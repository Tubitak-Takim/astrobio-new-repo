// Astrobio backend: HTTP API + SQLite. Uses only what ships with Node 24.
// Health rules live in UI-independent domain modules under src/.
//
// Sign-in and privacy are enforced HERE, not only on screen:
//   crew member     -> own medical data only
//   medical officer -> everyone's data
//   flight surgeon  -> only what the crew sent to Earth, after the signal delay
//
//   GET  /api/users                       names for the sign-in screen
//   POST /api/login {userId, pin}         -> {token, user}
//   POST /api/logout
//   GET  /api/state                       everything this user may see
//   PUT  /api/checkins/:crewId/:day       store a check-in
//   DELETE /api/checkins                  medical officer only
//   POST /api/notes {day, text}           how I feel, in my own words
//   POST /api/tasks {day, key, done}      tick a task for today
//   POST /api/messages {day, body}        send to the other side (Earth or ship)
//   POST /api/emergencies {...}           record of an emergency; also sent to Earth

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { allowed, reword, rewordEnabled } from './reword.js'
import { CREW, MISSION_DAYS } from '../src/data/simulatedCrew.ts'
import { isMission, linkDelay } from '../src/data/missions.ts'
import { DEMO_PIN, USERS, canSee, type User } from '../src/data/users.ts'
import { buildDay, flagged, keyOf, OBSERVATIONS, type CheckIns } from '../src/model.ts'
import { MAX_IMAGE_CHARS, validateReading } from '../src/validate.ts'
import { validateEmergencySteps } from '../src/validate.ts'
import { canReadEmergency, canReadEvent, canReadMessage, MESSAGE_MAX_CHARS, REPORT_MAX_CHARS } from '../src/access.ts'
import { assessmentFor } from '../src/assessment.ts'
import { readJson, readBinary, rateLimiter, RequestError } from './http.ts'
import { explainLocally, localAiStatus } from './localAi.ts'
import { companionStatus, conversationTurn, conversationRoute } from './conversation.ts'
import { MAX_VOICE_BYTES, ReplyReceipts, synthesizeVoice, transcribeVoice, voiceStatus } from './voice.ts'
import { serveFrontend } from './static.ts'
import { healthContextFor, requestsHealthRecords } from './healthContext.ts'
import { crewDatasetFor, ensureCrewDataset } from './crewDataset.ts'
import { ensureObservations, readObservations, saveObservation } from './observations.ts'
import { directSymptomReports } from '../src/symptoms.ts'
import { ensureLightPlan, lightContext, lightPlanFor, saveLightAction, saveLightPreferences, saveLightStress, syncLightReview } from './lightPlan.ts'
import { saveCabinLighting } from './cabinLighting.ts'
import { createMissionCsv, downloadTelemetryBundle, ensureTelemetry, listTelemetryBundles, queueTelemetry, telemetryContext } from './telemetry.ts'
import { applicationDataFor, explicitDataSubjects, requestedDataTopics } from './dataContext.ts'
import { applicationDataTurn } from './dataConversation.ts'

const PORT = Number(process.env.API_PORT ?? 8787)
const dbFile = process.env.DB_FILE ?? 'data/crew-health.sqlite'
mkdirSync(dirname(dbFile), { recursive: true })
const db = new DatabaseSync(dbFile)
db.exec(`
  CREATE TABLE IF NOT EXISTS checkins (crew_id TEXT NOT NULL, day INTEGER NOT NULL, reading TEXT NOT NULL, updated_at TEXT NOT NULL, by_user TEXT, PRIMARY KEY (crew_id, day));
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL, crew_id TEXT);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT NOT NULL, day INTEGER NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tasks_done (user_id TEXT NOT NULL, day INTEGER NOT NULL, key TEXT NOT NULL, PRIMARY KEY (user_id, day, key));
  CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, from_user TEXT NOT NULL, side TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL, day INTEGER NOT NULL, delay_min REAL NOT NULL, sent_at INTEGER NOT NULL, deliver_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS emergencies (id INTEGER PRIMARY KEY AUTOINCREMENT, scenario TEXT NOT NULL, patient TEXT NOT NULL, by_user TEXT NOT NULL, day INTEGER NOT NULL, started_at TEXT NOT NULL, steps TEXT NOT NULL);
`)
// Inspect schema instead of swallowing every migration failure.
for (const [table, column, type] of [['checkins', 'by_user', 'TEXT'], ['events', 'crew_id', 'TEXT'], ['messages', 'to_user', 'TEXT']]) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
}
const sessionLifetimeMs = 12 * 60 * 60 * 1000
ensureCrewDataset(db)
ensureObservations(db)
ensureLightPlan(db)
ensureTelemetry(db)
const allowTelemetry=rateLimiter(6,60_000)
const allowLightWrites=rateLimiter(30,60_000)
const allowIngest = rateLimiter(120,60_000)
const allowLogin = rateLimiter(10, 60_000)
const allowLocalAi = rateLimiter(6, 60_000)
const allowChat = rateLimiter(6, 60_000)
const allowVoice = rateLimiter(12, 60_000)
const replyReceipts = new ReplyReceipts()

// The demo PIN is stored as a salted hash, the way a real password would be.
const salt = randomBytes(16)
const pinHash = scryptSync(DEMO_PIN, salt, 32)
const pinOk = (pin: unknown) => typeof pin === 'string' && pin.length < 64 && timingSafeEqual(scryptSync(pin, salt, 32), pinHash)

const nowIso = () => new Date().toISOString()
const nameOf = (id: string) => USERS.find((u) => u.id === id)?.name ?? id

function allCheckIns(): CheckIns {
  const out: CheckIns = {}
  const updated:Record<string,string>={}
  for (const row of db.prepare('SELECT crew_id, day, reading, updated_at FROM checkins').all()) {
    out[keyOf(String(row.crew_id), Number(row.day))] = JSON.parse(String(row.reading))
    updated[keyOf(String(row.crew_id),Number(row.day))]=String(row.updated_at)
  }
  out[OBSERVATIONS]=readObservations(db).flatMap(o=>!updated[keyOf(o.crewId,o.day)] || o.measuredAt>updated[keyOf(o.crewId,o.day)] ? [o] : o.symptoms?.length ? [{...o,values:{}}] : [])
  return out
}

const logEvent = (kind: string, detail: string, crewId: string | null) =>
  db.prepare('INSERT INTO events (at, kind, detail, crew_id) VALUES (?, ?, ?, ?)').run(nowIso(), kind, detail, crewId)

function sendMessage(user: User, kind: string, body: string, day: number, mission: unknown, recipient?: string) {
  const link = linkDelay(isMission(mission) ? mission : 'mars', day)
  const delay = link.minutes
  const sent = Date.now()
  db.prepare('INSERT INTO messages (from_user, side, kind, body, day, delay_min, sent_at, deliver_at, to_user) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    user.id,
    user.role === 'surgeon' ? 'earth' : 'ship',
    kind,
    body,
    day,
    delay,
    sent,
    sent + link.demoMs,
    user.role === 'surgeon' ? (recipient ?? 'C2') : null,
  )
}

/** Everything this user is allowed to see. */
function stateFor(user: User) {
  const now = Date.now()
  const messages = db
    .prepare('SELECT id, from_user, side, kind, body, day, delay_min, sent_at, deliver_at, to_user FROM messages ORDER BY id DESC')
    .all()
    // You see your own side's messages at once. The other side's arrive after the delay.
    .filter((m) => canReadMessage(user, { from_user: m.from_user, side: m.side, to_user: m.to_user, deliver_at: m.deliver_at }, now))
    .slice(0, 40)
    .map((m) => ({ ...m, from_name: nameOf(String(m.from_user)), delivered: Number(m.deliver_at) <= now }))

  if (user.role === 'surgeon') return { user, now, messages, checkIns: {}, events: [], notes: [], tasksDone: [], emergencies: [] }

  const checkIns: CheckIns = {}
  for (const [key, reading] of Object.entries(allCheckIns())) if (canSee(user, key.split(':')[0])) checkIns[key] = reading
  const events = db
    .prepare('SELECT id, at, kind, detail, crew_id FROM events ORDER BY id DESC')
    .all()
    .filter((e) => canReadEvent(user, { kind: e.kind, crew_id: e.crew_id }))
    .slice(0, 6)
  const notes = db
    .prepare('SELECT id, crew_id, day, text, at FROM notes ORDER BY id DESC')
    .all()
    .filter((n) => canSee(user, String(n.crew_id)))
    .slice(0, 60)
  const tasksDone = db.prepare('SELECT day, key FROM tasks_done WHERE user_id = ?').all(user.id)
  const emergencies = db.prepare('SELECT id, scenario, patient, by_user, day, started_at, steps FROM emergencies ORDER BY id DESC').all()
    .filter((e) => canReadEmergency(user, { patient: e.patient, by_user: e.by_user })).slice(0, 5)
  return { user, now, messages, checkIns, events, notes, tasksDone, emergencies }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}
function sendCsv(res:ServerResponse,packet:{csv:string|Buffer;filename:string;sha256:string;rowCount:number}) {
  res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${packet.filename}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Content-SHA256':packet.sha256,'X-Export-Row-Count':String(packet.rowCount)})
  res.end(packet.csv)
}

function userFrom(req: IncomingMessage): User | null {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
  if (!token) return null
  const row = db.prepare('SELECT user_id, created_at FROM sessions WHERE token = ?').get(token)
  if (row && !(Date.parse(String(row.created_at)) > Date.now() - sessionLifetimeMs)) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
    return null
  }
  return row ? (USERS.find((u) => u.id === row.user_id) ?? null) : null
}

const validDay = (d: unknown): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= MISSION_DAYS
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null)

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname
  const method = req.method ?? 'GET'
  try {
    if (await serveFrontend(req, res, path)) return
    if (method === 'GET' && path === '/api/health') return send(res, 200, { ok: true })
    if (method === 'GET' && path === '/api/users') return send(res, 200, { users: USERS })
    if (method === 'GET' && path === '/api/reword') return send(res, 200, { enabled: rewordEnabled() })
    if (method === 'POST' && path === '/api/reword') {
      if (!userFrom(req)) return send(res, 401, { error: 'Please sign in.' })
      if (!allowed(req.socket.remoteAddress ?? 'local')) return send(res, 429, { error: 'Too many rewording requests. Try again in a minute.' })
      const body = await readJson(req)
      const r = await reword(body.question, body.text)
      return r.ok ? send(res, 200, { text: r.text }) : send(res, r.status, { error: r.error })
    }

    if (method === 'POST' && path === '/api/login') {
      if (!allowLogin(req.socket.remoteAddress ?? 'local')) return send(res, 429, { error: 'Too many sign-in attempts. Try again in a minute.' })
      const body = await readJson(req)
      const user = USERS.find((u) => u.id === body.userId)
      if (!user || !pinOk(body.pin)) return send(res, 401, { error: 'Wrong PIN.' })
      const token = randomBytes(24).toString('hex')
      db.prepare('DELETE FROM sessions WHERE created_at <= ?').run(new Date(Date.now() - sessionLifetimeMs).toISOString())
      db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, user.id, nowIso())
      return send(res, 200, { token, user })
    }

    const user = userFrom(req)
    if (!user) return send(res, 401, { error: 'Please sign in.' })

    if (method === 'POST' && path === '/api/logout') {
      db.prepare('DELETE FROM sessions WHERE token = ?').run((req.headers.authorization ?? '').replace(/^Bearer /, ''))
      return send(res, 200, { ok: true })
    }

    if (method === 'GET' && path === '/api/state') return send(res, 200, stateFor(user))

    if(method==='GET' && path==='/api/telemetry/export.csv') {
      const c=telemetryContext(user,{day:Number(url.searchParams.get('day') ?? 60),mission:url.searchParams.get('mission') ?? 'mars'})
      if(!allowTelemetry(user.id))return send(res,429,{error:'Too many exports. Try again in a minute.'})
      return sendCsv(res,createMissionCsv(db,user,c,allCheckIns()))
    }
    if(path==='/api/telemetry/bundles') {
      if(method==='GET')return send(res,200,{bundles:listTelemetryBundles(db,user),simulated:true,physicalDeliveryVerified:false})
      if(method==='POST') {
        const body=await readJson(req),c=telemetryContext(user,body)
        if(!allowTelemetry(user.id))return send(res,429,{error:'Too many exports. Try again in a minute.'})
        return send(res,201,{bundle:queueTelemetry(db,user,c,allCheckIns(),body.requestId),simulated:true,physicalDeliveryVerified:false})
      }
    }
    const telemetryDownload=path.match(/^\/api\/telemetry\/bundles\/([^/]+)\/csv$/)
    if(method==='GET' && telemetryDownload) {
      if(!allowTelemetry(user.id))return send(res,429,{error:'Too many exports. Try again in a minute.'})
      return sendCsv(res,downloadTelemetryBundle(db,user,telemetryDownload[1]))
    }

    if(path==='/api/light-plan' && method==='GET') {
      const c=lightContext(user,{crewId:url.searchParams.get('crewId') ?? user.id,day:Number(url.searchParams.get('day') ?? 60),mission:url.searchParams.get('mission') ?? 'mars'})
      return send(res,200,lightPlanFor(db,c,allCheckIns()))
    }
    if((['/api/light-plan/preferences','/api/light-plan/cabin'].includes(path) && method==='PUT') || (['/api/light-plan/stress','/api/light-plan/actions'].includes(path) && method==='POST')) {
      const body=await readJson(req),c=lightContext(user,body)
      if(!allowLightWrites(user.id))return send(res,429,{error:'Too many lighting-plan updates. Try again in a minute.'})
      const receipt=path.endsWith('/cabin')?saveCabinLighting(db,user,c.mission,body.config):path.endsWith('/preferences')?saveLightPreferences(db,user,c,body.preferences):path.endsWith('/stress')?saveLightStress(db,user,c,body.score):saveLightAction(db,user,c,body.kind,body.action)
      return send(res,200,{persisted:true,receipt,plan:lightPlanFor(db,c,allCheckIns())})
    }

    if (path === '/api/observations' && (method==='GET' || method==='POST')) {
      if(user.role==='surgeon') return send(res,403,{error:'Onboard observations are not available to Earth.'})
      if(method==='POST') {
        if(!allowIngest(user.id)) return send(res,429,{error:'Too many measurements. Try again in a minute.'})
        const observation=saveObservation(db,user,await readJson(req))
        const lightReview=syncLightReview(db,observation,allCheckIns())
        return send(res,201,{persisted:true,observation,lightReview})
      }
      const crewId=url.searchParams.get('crewId') ?? user.id
      const day=Number(url.searchParams.get('day') ?? 60),mission=url.searchParams.get('mission') ?? 'mars'
      if(!canSee(user,crewId)) return send(res,403,{error:'Not authorized for this astronaut.'})
      if(!CREW.some(c=>c.id===crewId) || !validDay(day) || !isMission(mission)) return send(res,400,{error:'Invalid observation context.'})
      const observations=readObservations(db).filter(o=>o.crewId===crewId && o.day===day && o.mission===mission)
      return send(res,200,{observations:observations.slice(-50).reverse(),total:observations.length,serverTime:nowIso()})
    }

    if (method === 'GET' && path === '/api/crew-data') {
      if(user.role==='surgeon') return send(res,403,{error:'Earth can only read delivered reports, not onboard crew time series.'})
      const day=Number(url.searchParams.get('day') ?? 60)
      const mission=url.searchParams.get('mission') ?? 'mars'
      const window=Number(url.searchParams.get('window') ?? 90)
      if(!validDay(day)||!isMission(mission)||!Number.isInteger(window)||window<1||window>MISSION_DAYS) return send(res,400,{error:'Invalid dataset day, mission or window.'})
      return send(res,200,crewDatasetFor(db,user,day,mission,window,allCheckIns()))
    }

    if (method === 'GET' && path === '/api/ai/status') return send(res, 200, await localAiStatus())

    if (method === 'GET' && path === '/api/ai/pipeline/status') {
      const [medical, companion] = await Promise.all([localAiStatus(), companionStatus()])
      return send(res, 200, { medical, companion, voice: voiceStatus(), memory: 'stateless', healthMemory:'structured_observations' })
    }

    if (method === 'POST' && path === '/api/chat') {
      if (user.role === 'surgeon') return send(res, 403, { error: 'This pilot chat is for the onboard crew only.' })
      const body = await readJson(req)
      const message = text(body.message, 2000)
      const language = body.language ?? 'tr'
      const day = body.day ?? 60
      const mission = body.mission ?? 'mars'
      const crewInput = body.crewId ?? user.id
      if (body.inputOrigin === 'voice' && body.transcriptConfirmed !== true) return send(res, 400, { error: 'Confirm the transcript before sending it to chat.' })
      if (!message || !validDay(day) || !isMission(mission) || (language !== 'tr' && language !== 'en') || typeof crewInput !== 'string' || (body.findingId !== undefined && typeof body.findingId !== 'string') || (body.inputOrigin !== undefined && body.inputOrigin !== 'text' && body.inputOrigin !== 'voice')) return send(res, 400, { error: 'Invalid chat message or context.' })
      let crewId=crewInput
      if (crewId !== 'cabin' && !canSee(user, crewId)) return send(res, 403, { error: 'You may only chat about authorized findings.' })
      const dataTopics=requestedDataTopics(message)
      if(dataTopics.length) {
        const explicit=explicitDataSubjects(message,user)
        if(explicit.length===1)crewId=explicit[0]
      }
      let checkIns = allCheckIns()
      let subject = assessmentFor(user, day, checkIns, mission, 'space').subjects.find((s) => s.id === crewId)
      if (!subject) return send(res, 404, { error: 'Subject not found.' })
      const requested = body.findingId === undefined ? undefined : subject.space.find((f) => f.id === body.findingId)
      if (body.findingId !== undefined && !requested) return send(res, 404, { error: 'Finding not found.' })
      // An existing urgent finding for this subject takes priority over social chat.
      let urgentFinding = subject.space.find((f) => f.level === 'red')
      if (!urgentFinding && conversationRoute(message, false) !== 'urgent' && !allowChat(user.id)) return send(res, 429, { error: 'Too many chat requests.' })
      const symptoms=directSymptomReports(message)
      const qualifies=symptoms.length>0
      const canPersist=qualifies && crewId===user.id && allowIngest(user.id)
      const savedReport=canPersist ? saveObservation(db,user,{crewId:user.id,day,mission,source:'chat_self_report',symptoms},true) : null
      if(savedReport) {
        checkIns=allCheckIns()
        subject=assessmentFor(user,day,checkIns,mission,'space').subjects.find(s=>s.id===crewId)!
        urgentFinding=subject.space.find(f=>f.level==='red')
      }
      const lightReview=savedReport?syncLightReview(db,savedReport,checkIns):null
      const finding = urgentFinding ?? (requested ? subject.space.find(f=>f.id===requested.id) : undefined)
      const applicationContext=!requested && !savedReport && dataTopics.length && conversationRoute(message,false)!=='urgent'?applicationDataFor(db,user,crewId,day,mission,checkIns,message,language as 'tr'|'en'):null
      const context = !applicationContext && !finding && (savedReport || requestsHealthRecords(message)) ? healthContextFor(user, crewId, day, mission, checkIns) : undefined
      const result = applicationContext
        ? await applicationDataTurn(message,language as 'tr'|'en',applicationContext,!!urgentFinding)
        : await conversationTurn(message, language as 'tr' | 'en', finding, finding ? subject.info[finding.id] : undefined, context ?? undefined)
      const replyId = replyReceipts.issue(user.id, result.reply)
      return send(res, 200, { ...result, replyId, replyExpiresInSeconds: 120, persisted:!!savedReport,lightReview, healthRecord:{status:savedReport?'saved':'not_saved',reason:savedReport?'Direct self-reported symptoms saved (not a diagnosis).':qualifies?crewId!==user.id?'Selected astronaut differs from signed-in account; no automatic attribution.':'Health-record rate limit reached; symptom not recorded.':'No unambiguous supported self-report detected.',observation:savedReport} })
    }

    if (method === 'GET' && path === '/api/voice/status') return send(res, 200, voiceStatus())
    if (method === 'POST' && (path === '/api/voice/transcribe' || path === '/api/voice/speak')) {
      if (req.headers['x-voice-consent'] !== 'true') return send(res, 400, { error: 'Explicit X-Voice-Consent: true is required.' })
      if (!allowVoice(user.id)) return send(res, 429, { error: 'Too many voice requests.' })
      if (path === '/api/voice/transcribe') {
        const language = url.searchParams.get('language') ?? 'tr'
        if (language !== 'tr' && language !== 'en') return send(res, 400, { error: 'Language must be tr or en.' })
        if (req.headers['content-type']?.split(';')[0].trim() !== 'audio/wav') return send(res, 415, { error: 'Upload raw mono PCM16 WAV at 16000 Hz.' })
        return send(res, 200, await transcribeVoice(await readBinary(req, MAX_VOICE_BYTES), language))
      }
      const body = await readJson(req)
      if (typeof body.replyId !== 'string' || body.replyId.length > 100) return send(res, 400, { error: 'Provide a chat replyId, not arbitrary text.' })
      const reply = replyReceipts.get(user.id, body.replyId)
      if (!reply) return send(res, 404, { error: 'Reply not found or expired.' })
      const wav = await synthesizeVoice(reply)
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': wav.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      return res.end(wav)
    }

    if (method === 'POST' && path === '/api/ai/explain') {
      if (user.role === 'surgeon') return send(res, 403, { error: 'Earth can only read reports delivered to it.' })
      const body = await readJson(req)
      const mission = body.mission ?? 'mars'
      const language = body.language ?? 'en'
      if (!validDay(body.day) || !isMission(mission) || (language !== 'tr' && language !== 'en') || typeof body.crewId !== 'string' || typeof body.findingId !== 'string') return send(res, 400, { error: 'Provide crewId, findingId, day, mission and language (tr/en).' })
      if (body.crewId !== 'cabin' && !canSee(user, body.crewId)) return send(res, 403, { error: 'You can only explain findings you may read.' })
      const assessment = assessmentFor(user, body.day, allCheckIns(), mission, 'space')
      const subject = assessment.subjects.find((s) => s.id === body.crewId)
      const finding = subject?.space.find((f) => f.id === body.findingId)
      if (!subject || !finding) return send(res, 404, { error: 'Finding not found.' })
      if (!allowLocalAi(user.id)) return send(res, 429, { error: 'Too many local AI requests. Try again in a minute.' })
      return send(res, 200, await explainLocally(finding, subject.info[finding.id], language))
    }

    if (method === 'GET' && path === '/api/assessment') {
      if (user.role === 'surgeon') return send(res, 403, { error: 'Earth can only read reports delivered to it.' })
      const day = Number(url.searchParams.get('day') ?? 60)
      const mission = url.searchParams.get('mission') ?? 'mars'
      const mode = url.searchParams.get('mode') ?? 'space'
      if (!validDay(day) || !isMission(mission) || (mode !== 'earth' && mode !== 'space')) return send(res, 400, { error: 'Invalid day, mission or mode.' })
      return send(res, 200, assessmentFor(user, day, allCheckIns(), mission, mode))
    }

    if (method === 'POST' && path === '/api/messages') {
      const body = await readJson(req, REPORT_MAX_CHARS * 6 + 2000)
      const max = body.kind === 'report' ? REPORT_MAX_CHARS : MESSAGE_MAX_CHARS
      const msg = text(body.body, max)
      if (!msg || !validDay(body.day)) return send(res, 400, { error: `Message must contain 1 to ${max} characters and a valid day.` })
      if (body.toUserId !== undefined && (user.role !== 'surgeon' || !USERS.some((u) => u.id === body.toUserId && u.role !== 'surgeon'))) return send(res, 400, { error: 'Invalid recipient.' })
      sendMessage(user, body.kind === 'report' ? 'report' : 'message', msg, body.day, body.mission, body.toUserId as string | undefined)
      return send(res, 200, stateFor(user))
    }

    if (user.role === 'surgeon') return send(res, 403, { error: 'Earth can only read what the crew sent, and reply.' })

    const m = path.match(/^\/api\/checkins\/([A-Za-z0-9]+)\/(\d+)$/)
    if (method === 'PUT' && m) {
      const crew = CREW.find((c) => c.id === m[1])
      const day = Number(m[2])
      if (!crew) return send(res, 404, { error: 'Unknown crew member.' })
      if (!canSee(user, crew.id)) return send(res, 403, { error: 'You can only log your own check-in.' })
      if (!validDay(day)) return send(res, 400, { error: `Day must be 1 to ${MISSION_DAYS}.` })
      // A check-in may carry one compressed image, so this route accepts a larger body than the others.
      const v = validateReading(await readJson(req, MAX_IMAGE_CHARS + 20_000))
      if (!v.ok) return send(res, 400, { error: v.error })
      db.prepare(
        'INSERT INTO checkins (crew_id, day, reading, updated_at, by_user) VALUES (?, ?, ?, ?, ?) ON CONFLICT (crew_id, day) DO UPDATE SET reading = excluded.reading, updated_at = excluded.updated_at, by_user = excluded.by_user',
      ).run(crew.id, day, JSON.stringify(v.reading), nowIso(), user.id)
      const updatedReadings=allCheckIns()
      for(const mission of ['iss','moon','mars'] as const)syncLightReview(db,{crewId:crew.id,day,mission},updatedReadings)
      const subject = buildDay(day, allCheckIns()).find((s) => s.id === crew.id)!
      const urgent = subject.space.some((f) => f.level === 'red')
      logEvent('checkin', `${crew.name}, day ${day}: check-in by ${user.name}. ${urgent ? 'URGENT finding' : `${flagged(subject.space)} flagged`}`, crew.id)
      return send(res, 200, stateFor(user))
    }

    if (method === 'DELETE' && path === '/api/checkins') {
      if (user.role !== 'cmo') return send(res, 403, { error: 'Only the medical officer can clear check-ins.' })
      db.exec('DELETE FROM checkins')
      logEvent('clear', `All crew check-ins removed by ${user.name}`, null)
      return send(res, 200, stateFor(user))
    }

    if (method === 'POST' && path === '/api/notes') {
      const body = await readJson(req)
      const note = text(body.text, 1000)
      if (!note || !validDay(body.day)) return send(res, 400, { error: 'Write a few words first.' })
      db.prepare('INSERT INTO notes (crew_id, day, text, at) VALUES (?, ?, ?, ?)').run(user.id, body.day, note, nowIso())
      return send(res, 200, stateFor(user))
    }

    if (method === 'POST' && path === '/api/tasks') {
      const body = await readJson(req)
      const key = text(body.key, 80)
      if (!key || !validDay(body.day)) return send(res, 400, { error: 'Unknown task.' })
      if (body.done) db.prepare('INSERT OR IGNORE INTO tasks_done (user_id, day, key) VALUES (?, ?, ?)').run(user.id, body.day, key)
      else db.prepare('DELETE FROM tasks_done WHERE user_id = ? AND day = ? AND key = ?').run(user.id, body.day, key)
      return send(res, 200, stateFor(user))
    }

    if (method === 'POST' && path === '/api/emergencies') {
      const body = await readJson(req)
      const scenario = text(body.scenario, 120)
      const patient = CREW.find((c) => c.id === body.patient)
      const clean = validateEmergencySteps(body.steps)
      if (!scenario || !patient || !clean || !validDay(body.day) || typeof body.startedAt !== 'string' || !Number.isFinite(Date.parse(body.startedAt))) return send(res, 400, { error: 'Incomplete record.' })
      db.prepare('INSERT INTO emergencies (scenario, patient, by_user, day, started_at, steps) VALUES (?, ?, ?, ?, ?, ?)').run(scenario, patient.id, user.id, body.day, body.startedAt.slice(0, 40), JSON.stringify(clean))
      logEvent('emergency', `Emergency record: ${scenario}, patient ${patient.name}`, patient.id)
      const lines = clean.map((s) => `  +${Math.floor(s.atSeconds / 60)}:${String(Math.round(s.atSeconds % 60)).padStart(2, '0')}  ${s.title}`)
      sendMessage(user, 'emergency', `EMERGENCY RECORD (practice, simulated)\n${scenario}\nPatient: ${patient.name}. Run by: ${user.name}. Mission day ${body.day}.\nSteps done:\n${lines.join('\n')}`, body.day, body.mission)
      return send(res, 200, stateFor(user))
    }

    send(res, 404, { error: 'Not found.' })
  } catch (error) {
    if (error instanceof RequestError) return send(res, error.status, { error: error.message })
    console.error('API request failed:', error)
    send(res, 500, { error: 'The server could not complete the request.' })
  }
})

server.requestTimeout = 15_000
const HOST = process.env.HOST ?? '127.0.0.1'
server.listen(PORT, HOST, () => {
  const address = server.address()
  console.log(`Astrobio API on http://${HOST}:${typeof address === 'object' && address ? address.port : PORT}`)
})
})
