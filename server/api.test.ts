import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CREW, readingOn } from '../src/data/simulatedCrew'
import type { Assessment } from '../src/assessment'
import type { CheckIns } from '../src/model'
import { createServer, type Server } from 'node:http'
import { readJson, readBinary } from './http'

// Only the JSON fields inspected by this integration suite. Node's fetch JSON
// result is unknown, unlike the old DOM types; assertions below verify behavior.
type TestPayload = Pick<Assessment, 'subjects' | 'mission' | 'report'> & {
  token: string
  checkIns: CheckIns
  messages: { body: string }[]
  emergencies: unknown[]
  events: unknown[]
  state: string
  generated: string | null
  original: { finding: { id: string } }
  route: string
  reply: string
  replyId: string
  needsConfirmation: boolean
}

let processHandle: ChildProcess | undefined
let directory: string | undefined
let database: DatabaseSync | undefined
let modelServer: Server | undefined
const modelPrompts: Record<string, unknown>[] = []
const spokenTexts: string[] = []
let base = ''
const tokens: Record<string, string> = {}

function audioFixture() {
  const b = Buffer.alloc(3244)
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(16000, 24); b.writeUInt32LE(32000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(3200, 40)
  return b
}

async function request(user: string | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, data: await response.json() as TestPayload }
}

beforeAll(async () => {
  directory = await mkdtemp(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'astrobio-test-'))
  const dbFile = join(directory, 'test.sqlite')
  // A local protocol stub: tests never download or run actual model weights.
  modelServer = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'test-medgemma:latest' }, { name: 'test-companion:latest' }] }))
    if (req.url === '/v1/audio/transcriptions') {
      await readBinary(req, 1_050_000)
      return res.end(JSON.stringify({ text: 'Merhaba' }))
    }
    const body = await readJson(req)
    if (req.url === '/v1/audio/speech') {
      spokenTexts.push(String(body.input))
      res.setHeader('Content-Type', 'audio/wav')
      return res.end(audioFixture())
    }
    modelPrompts.push(body)
    const format = body.format as { required?: string[] } | undefined
    const content = body.model === 'test-companion'
      ? format?.required?.[0] === 'opening' ? JSON.stringify({ opening: 'thanks' }) : 'Hello. I am Astrobio, your AI assistant.'
      : 'Experimental explanation. Review the original finding.'
    res.end(JSON.stringify({ done: true, message: { content } }))
  })
  await new Promise<void>((resolve) => modelServer!.listen(0, '127.0.0.1', resolve))
  const modelAddress = modelServer.address() as { port: number }
  processHandle = spawn(process.execPath, ['server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: '0', DB_FILE: dbFile, GEMINI_API_KEY: '', LOCAL_AI_ENABLED: 'true', LOCAL_AI_MODEL: 'test-medgemma', LOCAL_AI_URL: `http://127.0.0.1:${modelAddress.port}`, LOCAL_AI_TIMEOUT_MS: '1000', COMPANION_AI_ENABLED: 'true', COMPANION_AI_MODEL: 'test-companion', COMPANION_AI_URL: `http://127.0.0.1:${modelAddress.port}`, COMPANION_AI_TIMEOUT_MS: '1000', VOICE_ENABLED: 'true', VOICE_STT_MODEL: 'test-stt', VOICE_TTS_MODEL: 'test-tts', VOICE_TTS_VOICE: 'test-voice', VOICE_STT_URL: `http://127.0.0.1:${modelAddress.port}`, VOICE_TTS_URL: `http://127.0.0.1:${modelAddress.port}`, VOICE_TIMEOUT_MS: '1000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  base = await new Promise<string>((resolve, reject) => {
    let output = ''
    let errors = ''
    const timer = setTimeout(() => reject(new Error(`API startup timed out: ${errors}`)), 10_000)
    processHandle!.stdout!.on('data', (chunk) => {
      output += String(chunk)
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0]
      if (url) { clearTimeout(timer); resolve(url) }
    })
    processHandle!.stderr!.on('data', (chunk) => { errors += String(chunk) })
    processHandle!.once('error', (error) => { clearTimeout(timer); reject(error) })
    processHandle!.once('exit', (code) => { clearTimeout(timer); reject(new Error(`API exited (${code}): ${errors}`)) })
  })
  database = new DatabaseSync(dbFile)
  for (const user of ['C1', 'C2', 'C4', 'FS']) {
    const result = await request(null, 'POST', '/api/login', { userId: user, pin: '2026' })
    expect(result.status).toBe(200)
    tokens[user] = result.data.token
  }
}, 15_000)

describe('same-origin frontend', () => {
  it('serves every frontend page and its local integration assets without signing in', async () => {
    const pages = ['/', '/index.html', '/ask-to-ai.html', '/bis-analizi.html', '/gorev-sagligi.html', '/gunluk-etkiler.html', '/gunluk-yuk.html', '/health-check.html', '/olcumler.html', '/personel-info.html', '/raporlar.html', '/ridge.html', '/takvim.html', '/toparlanma.html', '/uyku.html']
    for (const path of pages) {
      const response = await fetch(base + path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      const html = await response.text()
      expect(html).toContain('js/backend.js')
      expect(html).toContain('css/integration.css')
      expect(html).toContain('<html lang="en">')
      expect(html).toContain('js/shell.js')
    }
    for (const path of ['/js/shell.js', '/js/app.js', '/js/data.js', '/js/backend.js', '/clients/voice-client.js', '/css/style.css', '/css/integration.css', '/assets/favicon.svg', '/data/demo-records.json', '/data/ASTROBIO_Project_Overview.html', '/data/ASTROBIO_Proje_Dokumani.pdf']) {
      const response = await fetch(base + path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    }
  })
  it('supports HEAD and refuses private files, traversal and unsupported methods', async () => {
    const head = await fetch(base + '/', {method:'HEAD'})
    expect(head.status).toBe(200)
    expect(Number(head.headers.get('content-length'))).toBeGreaterThan(100)
    expect(await head.text()).toBe('')
    for (const path of ['/.env', '/package.json', '/server/index.ts', '/data/crew-health.sqlite', '/local-ai/model-lock.json', '/%2e%2e%2f.env', '/%2eenv', '/js/%5c..%5c.env', '/unknown.html']) {
      expect((await fetch(base + path)).status, path).toBe(404)
    }
    expect((await fetch(base + '/index.html', {method:'POST'})).status).toBe(405)
    expect((await fetch(base + '/api/state')).status).toBe(401)
  })
})

afterAll(async () => {
  database?.close()
  if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
    const exited = once(processHandle, 'exit')
    processHandle.kill()
    await exited
  }
  if (modelServer) await new Promise<void>((resolve, reject) => modelServer!.close((error) => error ? reject(error) : resolve()))
  // Only this test's freshly-created temporary directory is removed.
  if (directory) await rm(directory, { recursive: true, force: true })
})

describe('real HTTP API', () => {
  it('requires authentication and validates assessment parameters', async () => {
    expect((await request(null, 'GET', '/api/state')).status).toBe(401)
    expect((await request('C1', 'GET', '/api/assessment?day=0')).status).toBe(400)
    expect((await request('FS', 'GET', '/api/assessment')).status).toBe(403)
    const result = await request('C1', 'GET', '/api/assessment?day=60&mission=moon')
    expect(result.data.subjects.map((s: { id: string }) => s.id)).toEqual(['C1', 'cabin'])
    expect(result.data.mission).toBe('moon')
  })

  it('validates and isolates check-ins', async () => {
    const reading = readingOn(CREW[3], 60)
    expect((await request('C1', 'PUT', '/api/checkins/C4/60', reading)).status).toBe(403)
    expect((await request('C4', 'PUT', '/api/checkins/C4/60', { ...reading, spo2Pct: 'bad' })).status).toBe(400)
    expect((await request('C4', 'PUT', '/api/checkins/C4/60', reading)).status).toBe(200)
    expect((await request('C1', 'GET', '/api/state')).data.checkIns).toEqual({})
    expect((await request('C2', 'GET', '/api/state')).data.checkIns['C4:60']).toBeDefined()
  })

  it('sends generated long reports and enforces privacy and signal delay', async () => {
    const assessment = await request('C2', 'GET', '/api/assessment?day=90')
    expect((await request('C2', 'POST', '/api/messages', { day: 90, body: assessment.data.report, kind: 'report' })).status).toBe(200)
    expect((await request('C2', 'POST', '/api/messages', { day: 90, body: 'a'.repeat(4001) })).status).toBe(400)
    expect((await request('C1', 'GET', '/api/state')).data.messages).toHaveLength(0)
    expect((await request('FS', 'GET', '/api/state')).data.messages).toHaveLength(0)
    // Advance delivery in the isolated test DB, without wall-clock sleeps.
    database!.exec('UPDATE messages SET deliver_at = 0')
    expect((await request('FS', 'GET', '/api/state')).data.messages).toHaveLength(1)
    expect((await request('C1', 'GET', '/api/state')).data.messages).toHaveLength(0)
  })

  it('addresses Earth replies instead of broadcasting medical messages', async () => {
    expect((await request('FS', 'POST', '/api/messages', { day: 60, body: 'Private reply', toUserId: 'C4' })).status).toBe(200)
    database!.exec('UPDATE messages SET deliver_at = 0')
    expect((await request('C4', 'GET', '/api/state')).data.messages.some((m: { body: string }) => m.body === 'Private reply')).toBe(true)
    expect((await request('C1', 'GET', '/api/state')).data.messages).toHaveLength(0)
    expect((await request('C1', 'POST', '/api/messages', { day: 60, body: 'Spoof', toUserId: 'C4' })).status).toBe(400)
  })

  it('filters emergency records and rejects malformed steps', async () => {
    const body = { scenario: 'Practice', patient: 'C4', day: 60, startedAt: new Date().toISOString(), steps: [{ title: 'Check', atSeconds: 0 }] }
    expect((await request('C4', 'POST', '/api/emergencies', { ...body, steps: [null] })).status).toBe(400)
    expect((await request('C4', 'POST', '/api/emergencies', body)).status).toBe(200)
    const unrelated = await request('C1', 'GET', '/api/state')
    expect(unrelated.data.emergencies).toHaveLength(0)
    expect(unrelated.data.events).toHaveLength(0)
    expect((await request('C2', 'GET', '/api/state')).data.emergencies).toHaveLength(1)
  })

  it('rejects oversized bodies and protects local cloud rewording', async () => {
    expect((await request('C1', 'POST', '/api/notes', { day: 60, text: 'a'.repeat(21_000) })).status).toBe(413)
    expect((await request(null, 'POST', '/api/reword', { question: 'q', text: 't' })).status).toBe(401)
  })

  it('authenticates local AI and sends only the authorized finding', async () => {
    expect((await request(null, 'GET', '/api/ai/status')).status).toBe(401)
    expect((await request('C1', 'GET', '/api/ai/status')).data.state).toBe('ready')
    const body = { crewId: 'C1', findingId: 'vitals', day: 60, mission: 'mars', language: 'tr', text: 'C4 private secret' }
    expect((await request(null, 'POST', '/api/ai/explain', body)).status).toBe(401)
    expect((await request('C1', 'POST', '/api/ai/explain', { ...body, crewId: 'C4' })).status).toBe(403)
    expect((await request('FS', 'POST', '/api/ai/explain', body)).status).toBe(403)
    expect((await request('C1', 'POST', '/api/ai/explain', { ...body, language: 'xx' })).status).toBe(400)
    expect((await request('C1', 'POST', '/api/ai/explain', { ...body, findingId: 'unknown' })).status).toBe(404)
    const result = await request('C1', 'POST', '/api/ai/explain', body)
    expect(result.data.state).toBe('generated')
    expect(result.data.original.finding.id).toBe('vitals')
    expect(result.data.generated).toBeTruthy()
    const prompt = JSON.stringify(modelPrompts.at(-1))
    expect(prompt).not.toContain('C4 private secret')
    expect(prompt).not.toContain('attachment')
  })

  it('does not use generative AI for urgent or stale findings', async () => {
    const before = modelPrompts.length
    const reading = { ...readingOn(CREW[3], 61), spo2Pct: 88 }
    expect((await request('C4', 'PUT', '/api/checkins/C4/61', reading)).status).toBe(200)
    const urgent = await request('C4', 'POST', '/api/ai/explain', { crewId: 'C4', findingId: 'vitals', day: 61 })
    expect(urgent.data.state).toBe('urgent')
    expect(urgent.data.generated).toBeNull()
    const stale = await request('C1', 'POST', '/api/ai/explain', { crewId: 'C1', findingId: 'hematocrit', day: 60 })
    expect(stale.data.state).toBe('stale')
    expect(modelPrompts).toHaveLength(before)
  })

  it('enforces chat privacy and sequential medical/communication roles', async () => {
    expect((await request(null, 'POST', '/api/chat', { message: 'hello' })).status).toBe(401)
    expect((await request('C1', 'POST', '/api/chat', { message: 'hello', crewId: 'C4', findingId: 'vitals' })).status).toBe(403)
    expect((await request('FS', 'POST', '/api/chat', { message: 'hello' })).status).toBe(403)
    const before = modelPrompts.length
    const result = await request('C1', 'POST', '/api/chat', { message: 'Ölçümümü açıkla', findingId: 'vitals', language: 'tr' })
    expect(result.status).toBe(200)
    expect(result.data.route).toBe('medical')
    expect(result.data.reply).toContain('SpO2')
    expect(modelPrompts.slice(before).map((p) => p.model)).toEqual(['test-medgemma', 'test-companion'])
    const urgentBefore = modelPrompts.length
    const urgent = await request('C1', 'POST', '/api/chat', { message: 'Nefes alamıyorum' })
    expect(urgent.data.route).toBe('urgent')
    expect(modelPrompts).toHaveLength(urgentBefore)
  })

  it('forwards free-text questions without findingId to the selected local roles', async () => {
    const question = 'Hello, I want a quick explanation on my general health care'
    const before = modelPrompts.length
    const health = await request('C1', 'POST', '/api/chat', { message: question, language: 'en' })
    expect(health.status).toBe(200)
    expect(health.data.route).toBe('medical')
    expect(health.data.reply).toContain('Experimental explanation')
    expect(health.data.reply).not.toContain('Select the relevant finding')
    const turns = modelPrompts.slice(before)
    expect(turns.map(t => t.model)).toEqual(['test-medgemma', 'test-companion'])
    expect((turns[0].messages as { content: string }[])[1].content).toBe(question)
    const social = await request('C1', 'POST', '/api/chat', { message: 'Tell me about exploring Mars.', language: 'en' })
    expect(social.status).toBe(200)
    expect(social.data.reply).toBe('Hello. I am Astrobio, your AI assistant.')
    expect(modelPrompts.at(-1)?.model).toBe('test-companion')
  })

  it('requires voice consent and transcript confirmation, and protects reply audio', async () => {
    expect((await request('C1', 'POST', '/api/voice/speak', { replyId: 'missing' })).status).toBe(400)
    const before = modelPrompts.length
    const transcriptResponse = await fetch(`${base}/api/voice/transcribe?language=tr`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokens.C1}`, 'Content-Type': 'audio/wav', 'X-Voice-Consent': 'true' }, body: audioFixture(),
    })
    expect(transcriptResponse.status).toBe(200)
    expect(await transcriptResponse.json()).toMatchObject({ text: 'Merhaba', needsConfirmation: true })
    expect(modelPrompts).toHaveLength(before)
    expect((await request('C1', 'POST', '/api/chat', { message: 'Merhaba', inputOrigin: 'voice' })).status).toBe(400)
    const chat = await request('C1', 'POST', '/api/chat', { message: 'Merhaba', inputOrigin: 'voice', transcriptConfirmed: true })
    const speak = (id: string, user: string) => fetch(`${base}/api/voice/speak`, {
      method: 'POST', headers: { Authorization: `Bearer ${tokens[user]}`, 'Content-Type': 'application/json', 'X-Voice-Consent': 'true' }, body: JSON.stringify({ replyId: id }),
    })
    const foreign = await speak(chat.data.replyId, 'C4')
    expect(foreign.status).toBe(404)
    await foreign.json()
    const response = await speak(chat.data.replyId, 'C1')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('audio/wav')
    expect(Buffer.from(await response.arrayBuffer()).toString('ascii', 0, 4)).toBe('RIFF')
    expect(spokenTexts.at(-1)).toBe(chat.data.reply)
  })

  it('expires sessions and supports logout', async () => {
    database!.prepare('UPDATE sessions SET created_at = ? WHERE token = ?').run('2000-01-01T00:00:00.000Z', tokens.C4)
    expect((await request('C4', 'GET', '/api/state')).status).toBe(401)
    expect((await request('C1', 'POST', '/api/logout')).status).toBe(200)
    expect((await request('C1', 'GET', '/api/state')).status).toBe(401)
  })

  it('rate limits login attempts', async () => {
    let lastStatus = 0
    for (let i = 0; i < 11; i++) lastStatus = (await request(null, 'POST', '/api/login', { userId: 'C1', pin: 'wrong' })).status
    expect(lastStatus).toBe(429)
  })
})
