// Stand-in for the server when there is none (for example a static demo link).
// It follows the same rules as server/index.ts, but keeps everything in this browser.
// Two tabs of the same browser share it, so the crew tab and the Earth tab still talk.
// This is a demo convenience: privacy here is only as strong as the browser, not a server.

import { CREW, MISSION_DAYS } from './data/simulatedCrew.ts'
import { isMission, linkDelay } from './data/missions.ts'
import { DEMO_PIN, USERS, canSee, type User } from './data/users.ts'
import { buildDay, flagged, keyOf, type CheckIns } from './model.ts'
import type { CrewReading } from './triage.ts'
import { validateEmergencySteps, validateReading } from './validate.ts'
import { canReadEmergency, canReadEvent, canReadMessage, MESSAGE_MAX_CHARS, REPORT_MAX_CHARS } from './access.ts'
import { assessmentFor } from './assessment.ts'

interface Row {
  [k: string]: unknown
}
interface Db {
  nextId: number
  checkIns: CheckIns
  events: Row[]
  notes: Row[]
  tasksDone: { user: string; day: number; key: string }[]
  messages: Row[]
  emergencies: Row[]
}

const KEY = 'chm.local.v1'
const empty = (): Db => ({ nextId: 1, checkIns: {}, events: [], notes: [], tasksDone: [], messages: [], emergencies: [] })

function load(): Db {
  try {
    return { ...empty(), ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Db>) }
  } catch {
    return empty()
  }
}
function save(db: Db): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
    return true
  } catch {
    // Storage blocked or full: callers must report that persistence failed.
    return false
  }
}

/** Browser storage holds about 5 MB, so keep only the newest few images. */
const KEEP_IMAGES = 3
function dropImages(db: Db, keep: number) {
  const withImage = Object.entries(db.checkIns)
    .filter(([, r]) => r.attachment)
    .sort((a, b) => String(b[1].attachment!.attachedAt).localeCompare(String(a[1].attachment!.attachedAt)))
  for (const [key, r] of withImage.slice(keep)) db.checkIns[key] = { ...r, attachment: undefined }
}

const nameOf = (id: string) => USERS.find((u) => u.id === id)?.name ?? id
const validDay = (d: unknown): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= MISSION_DAYS
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim().length > 0 && v.length <= max ? v.trim() : null)

function stateFor(db: Db, user: User) {
  const now = Date.now()
  const messages = [...db.messages]
    .reverse()
    .filter((m) => canReadMessage(user, { from_user: m.from_user, side: m.side, to_user: m.to_user, deliver_at: m.deliver_at }, now))
    .slice(0, 40)
    .map((m) => ({ ...m, from_name: nameOf(String(m.from_user)), delivered: Number(m.deliver_at) <= now }))
  if (user.role === 'surgeon') return { user, now, messages, checkIns: {}, events: [], notes: [], tasksDone: [], emergencies: [] }
  const checkIns: CheckIns = {}
  for (const [key, reading] of Object.entries(db.checkIns)) if (canSee(user, key.split(':')[0])) checkIns[key] = reading
  return {
    user,
    now,
    messages,
    checkIns,
    events: [...db.events].reverse().filter((e) => canReadEvent(user, { kind: e.kind, crew_id: e.crew_id })).slice(0, 6),
    notes: [...db.notes].reverse().filter((n) => canSee(user, String(n.crew_id))),
    tasksDone: db.tasksDone.filter((t) => t.user === user.id).map(({ day, key }) => ({ day, key })),
    emergencies: [...db.emergencies].reverse().filter((e) => canReadEmergency(user, { patient: e.patient, by_user: e.by_user })).slice(0, 5),
  }
}

function sendMessage(db: Db, user: User, kind: string, body: string, day: number, mission: unknown, recipient?: string) {
  const link = linkDelay(isMission(mission) ? mission : 'mars', day)
  const delay = link.minutes
  const sent = Date.now()
  db.messages.push({ id: db.nextId++, from_user: user.id, side: user.role === 'surgeon' ? 'earth' : 'ship', kind, body, day, delay_min: delay, sent_at: sent, deliver_at: sent + link.demoMs, to_user: user.role === 'surgeon' ? (recipient ?? 'C2') : null })
}
const logEvent = (db: Db, kind: string, detail: string, crewId: string | null) => db.events.push({ id: db.nextId++, at: new Date().toISOString(), kind, detail, crew_id: crewId })

export function localCall(method: string, path: string, body: Record<string, unknown> | undefined, token: string | null): { status: number; data: unknown } {
  const fail = (status: number, error: string) => ({ status, data: { error } })
  if (method === 'GET' && path === '/api/users') return { status: 200, data: { users: USERS } }
  if (method === 'POST' && path === '/api/login') {
    const user = USERS.find((u) => u.id === body?.userId)
    if (!user || body?.pin !== DEMO_PIN) return fail(401, 'Wrong PIN.')
    return { status: 200, data: { token: `local:${user.id}`, user } }
  }
  const user = USERS.find((u) => token === `local:${u.id}`)
  if (!user) return fail(401, 'Please sign in.')
  if (method === 'POST' && path === '/api/logout') return { status: 200, data: { ok: true } }

  const db = load()
  const done = () => {
    if (!save(db)) return fail(507, 'Browser storage is unavailable or full. The change was not saved.')
    return { status: 200, data: stateFor(db, user) }
  }
  if (method === 'GET' && path === '/api/state') return { status: 200, data: stateFor(db, user) }

  const url = new URL(path, 'http://local')
  if (method === 'GET' && url.pathname === '/api/assessment') {
    if (user.role === 'surgeon') return fail(403, 'Earth can only read reports delivered to it.')
    const day = Number(url.searchParams.get('day') ?? 60)
    const mission = url.searchParams.get('mission') ?? 'mars'
    const mode = url.searchParams.get('mode') ?? 'space'
    if (!validDay(day) || !isMission(mission) || (mode !== 'earth' && mode !== 'space')) return fail(400, 'Invalid day, mission or mode.')
    return { status: 200, data: assessmentFor(user, day, db.checkIns, mission, mode) }
  }

  if (method === 'POST' && path === '/api/messages') {
    const max = body?.kind === 'report' ? REPORT_MAX_CHARS : MESSAGE_MAX_CHARS
    const msg = text(body?.body, max)
    if (!msg || !validDay(body?.day)) return fail(400, `Message must contain 1 to ${max} characters and a valid day.`)
    if (body?.toUserId !== undefined && (user.role !== 'surgeon' || !USERS.some((u) => u.id === body.toUserId && u.role !== 'surgeon'))) return fail(400, 'Invalid recipient.')
    sendMessage(db, user, body?.kind === 'report' ? 'report' : 'message', msg, body.day, body?.mission, body?.toUserId as string | undefined)
    return done()
  }
  if (user.role === 'surgeon') return fail(403, 'Earth can only read what the crew sent, and reply.')

  const m = path.match(/^\/api\/checkins\/([A-Za-z0-9]+)\/(\d+)$/)
  if (method === 'PUT' && m) {
    const crew = CREW.find((c) => c.id === m[1])
    const day = Number(m[2])
    if (!crew) return fail(404, 'Unknown crew member.')
    if (!canSee(user, crew.id)) return fail(403, 'You can only log your own check-in.')
    if (!validDay(day)) return fail(400, `Day must be 1 to ${MISSION_DAYS}.`)
    const v = validateReading(body)
    if (!v.ok) return fail(400, v.error)
    db.checkIns[keyOf(crew.id, day)] = v.reading as CrewReading
    dropImages(db, KEEP_IMAGES)
    const subject = buildDay(day, db.checkIns).find((s) => s.id === crew.id)!
    const urgent = subject.space.some((f) => f.level === 'red')
    logEvent(db, 'checkin', `${crew.name}, day ${day}: check-in by ${user.name}. ${urgent ? 'URGENT finding' : `${flagged(subject.space)} flagged`}`, crew.id)
    if (!save(db) && v.reading.attachment) {
      // Storage is full: keep the check-in, drop every image, and say so.
      dropImages(db, 0)
      if (!save(db)) return fail(507, 'Browser storage is unavailable or full. The check-in was not saved.')
      return fail(413, 'Browser storage is full, so the check-in was saved without its image.')
    }
    return done()
  }
  if (method === 'DELETE' && path === '/api/checkins') {
    if (user.role !== 'cmo') return fail(403, 'Only the medical officer can clear check-ins.')
    db.checkIns = {}
    logEvent(db, 'clear', `All crew check-ins removed by ${user.name}`, null)
    return done()
  }
  if (method === 'POST' && path === '/api/notes') {
    const note = text(body?.text, 1000)
    if (!note || !validDay(body?.day)) return fail(400, 'Write a few words first.')
    db.notes.push({ id: db.nextId++, crew_id: user.id, day: body.day, text: note, at: new Date().toISOString() })
    return done()
  }
  if (method === 'POST' && path === '/api/tasks') {
    const key = text(body?.key, 80)
    if (!key || !validDay(body?.day)) return fail(400, 'Unknown task.')
    const day = body.day
    db.tasksDone = db.tasksDone.filter((t) => !(t.user === user.id && t.day === day && t.key === key))
    if (body?.done) db.tasksDone.push({ user: user.id, day, key })
    return done()
  }
  if (method === 'POST' && path === '/api/emergencies') {
    const scenario = text(body?.scenario, 120)
    const patient = CREW.find((c) => c.id === body?.patient)
    const clean = validateEmergencySteps(body?.steps)
    if (!scenario || !patient || !clean || !validDay(body?.day) || typeof body?.startedAt !== 'string' || !Number.isFinite(Date.parse(body.startedAt))) return fail(400, 'Incomplete record.')
    db.emergencies.push({ id: db.nextId++, scenario, patient: patient.id, by_user: user.id, day: body.day, started_at: String(body?.startedAt ?? ''), steps: clean })
    logEvent(db, 'emergency', `Emergency record: ${scenario}, patient ${patient.name}`, patient.id)
    const lines = clean.map((s) => `  +${Math.floor(s.atSeconds / 60)}:${String(Math.round(s.atSeconds % 60)).padStart(2, '0')}  ${s.title}`)
    sendMessage(db, user, 'emergency', `EMERGENCY RECORD (practice, simulated)\n${scenario}\nPatient: ${patient.name}. Run by: ${user.name}. Mission day ${body.day}.\nSteps done:\n${lines.join('\n')}`, body.day, body?.mission)
    return done()
  }
  return fail(404, 'Not found.')
}
