import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CREW, readingOn } from '../src/data/simulatedCrew'

let processHandle: ChildProcess | undefined
let directory: string | undefined
let database: DatabaseSync | undefined
let base = ''
const tokens: Record<string, string> = {}

async function request(user: string | null, method: string, path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${tokens[user]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: response.status, data: await response.json() }
}

beforeAll(async () => {
  directory = await mkdtemp(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'crew-health-test-'))
  const dbFile = join(directory, 'test.sqlite')
  processHandle = spawn(process.execPath, ['server/index.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: '0', DB_FILE: dbFile, GEMINI_API_KEY: '' },
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

afterAll(async () => {
  database?.close()
  if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
    const exited = once(processHandle, 'exit')
    processHandle.kill()
    await exited
  }
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
