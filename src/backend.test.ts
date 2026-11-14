import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localCall } from './localBackend'
import { assessmentFor } from './assessment'
import { REPORT_MAX_CHARS } from './access'
import { USERS } from './data/users'
import { CREW, readingOn } from './data/simulatedCrew'
import { buildDay, reportText } from './model'
import { validateEmergencySteps, validateReading } from './validate'

const call = (user: string, method: string, path: string, body?: Record<string, unknown>) => localCall(method, path, body, `local:${user}`)
const state = (user: string) => call(user, 'GET', '/api/state').data as {
  messages: { body: string }[]; emergencies: unknown[]; events: unknown[]; checkIns: Record<string, unknown>
}

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) })
})

describe('shared backend privacy', () => {
  it('keeps crew reports private from other crew and visible to the CMO', () => {
    expect(call('C4', 'POST', '/api/messages', { body: 'Private report', day: 60, kind: 'report' }).status).toBe(200)
    expect(state('C1').messages).toHaveLength(0)
    expect(state('C4').messages).toHaveLength(1)
    expect(state('C2').messages).toHaveLength(1)
    expect(state('FS').messages).toHaveLength(0)
  })

  it('delivers addressed Earth replies only after the delay', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000)
    try {
      call('FS', 'POST', '/api/messages', { body: 'Reply to C4', day: 60, toUserId: 'C4', mission: 'iss' })
      expect(state('C4').messages).toHaveLength(0)
      now.mockReturnValue(101_000)
      expect(state('C4').messages).toHaveLength(1)
      expect(state('C1').messages).toHaveLength(0)
      expect(state('C2').messages).toHaveLength(1)
    } finally { now.mockRestore() }
  })

  it('defaults unaddressed Earth replies to the CMO', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000)
    try {
      call('FS', 'POST', '/api/messages', { body: 'CMO only', day: 60, mission: 'iss' })
      now.mockReturnValue(101_000)
      expect(state('C1').messages).toHaveLength(0)
      expect(state('C2').messages).toHaveLength(1)
    } finally { now.mockRestore() }
  })

  it('does not leak emergency records or events to unrelated crew', () => {
    expect(call('C4', 'POST', '/api/emergencies', {
      scenario: 'Practice', patient: 'C4', day: 60, startedAt: new Date().toISOString(), steps: [{ title: 'Check', atSeconds: 0 }],
    }).status).toBe(200)
    expect(state('C1').emergencies).toHaveLength(0)
    expect(state('C1').events).toHaveLength(0)
    expect(state('C1').messages).toHaveLength(0)
    expect(state('C2').emergencies).toHaveLength(1)
    expect(state('C4').emergencies).toHaveLength(1)
  })

  it('enforces check-in writes and assessment visibility', () => {
    const reading = readingOn(CREW[3], 60)
    expect(call('C1', 'PUT', '/api/checkins/C4/60', reading as unknown as Record<string, unknown>).status).toBe(403)
    expect(call('C4', 'PUT', '/api/checkins/C4/60', reading as unknown as Record<string, unknown>).status).toBe(200)
    expect(state('C1').checkIns).toEqual({})
    const own = assessmentFor(USERS[0], 60, {}, 'mars', 'space')
    expect(own.subjects.map((s) => s.id)).toEqual(['C1', 'cabin'])
    expect(call('FS', 'GET', '/api/assessment?day=60').status).toBe(403)
    expect(call('C1', 'GET', '/api/assessment?mission=invalid').status).toBe(400)
  })
})

describe('validation and persistence', () => {
  it('accepts every generated mission report within the report budget', () => {
    for (const mission of ['iss', 'moon', 'mars'] as const) {
      for (const mode of ['earth', 'space'] as const) {
        for (let day = 1; day <= 90; day++) {
          expect(reportText(day, buildDay(day, {}, mission), mode).length).toBeLessThanOrEqual(REPORT_MAX_CHARS)
        }
      }
    }
    const body = reportText(90, buildDay(90, {}), 'space')
    expect(call('C2', 'POST', '/api/messages', { body, day: 90, kind: 'report' }).status).toBe(200)
    expect(call('C2', 'POST', '/api/messages', { body: 'a'.repeat(4001), day: 90 }).status).toBe(400)
  })

  it('rejects malformed emergency steps', () => {
    for (const input of [null, [], [null], [{ title: 'Check', atSeconds: -1 }], [{ title: 'Check', atSeconds: Infinity }], [{ title: '', atSeconds: 0 }]]) {
      expect(validateEmergencySteps(input)).toBeNull()
    }
    expect(validateEmergencySteps([{ title: 'Check', atSeconds: 2 }, { title: 'Next', atSeconds: 1 }])).toBeNull()
  })

  it('rejects invalid readings', () => {
    expect(validateReading({ ...readingOn(CREW[0], 60), spo2Pct: NaN }).ok).toBe(false)
    expect(validateReading({ ...readingOn(CREW[0], 60), ijvFlow: 'invalid' }).ok).toBe(false)
  })

  it('does not claim a successful save when browser storage fails', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('full') } })
    expect(call('C1', 'POST', '/api/notes', { day: 60, text: 'Not saved' }).status).toBe(507)
  })
})
