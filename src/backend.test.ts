import { describe, expect, it } from 'vitest'
import { canReadEmergency, canReadEvent, canReadMessage, REPORT_MAX_CHARS } from './access'
import { assessmentFor } from './assessment'
import { USERS } from './data/users'
import { CREW, readingOn } from './data/simulatedCrew'
import { buildDay, reportText } from './model'
import { validateEmergencySteps, validateReading } from './validate'

const user = (id: string) => USERS.find((u) => u.id === id)!
const message = { from_user: 'C4', side: 'ship', to_user: null, deliver_at: 1000 }

describe('Astrobio privacy policy', () => {
  it('keeps crew reports private from unrelated crew', () => {
    expect(canReadMessage(user('C1'), message, 0)).toBe(false)
    expect(canReadMessage(user('C4'), message, 0)).toBe(true)
    expect(canReadMessage(user('C2'), message, 0)).toBe(true)
    expect(canReadMessage(user('FS'), message, 0)).toBe(false)
    expect(canReadMessage(user('FS'), message, 1000)).toBe(true)
  })

  it('delivers addressed Earth replies only after the delay', () => {
    const reply = { ...message, from_user: 'FS', side: 'earth', to_user: 'C4' }
    expect(canReadMessage(user('C4'), reply, 0)).toBe(false)
    expect(canReadMessage(user('C4'), reply, 1000)).toBe(true)
    expect(canReadMessage(user('C1'), reply, 1000)).toBe(false)
    expect(canReadMessage(user('C2'), reply, 1000)).toBe(true)
  })

  it('keeps legacy unaddressed Earth replies CMO-only on the ship', () => {
    const reply = { ...message, from_user: 'FS', side: 'earth' }
    expect(canReadMessage(user('C1'), reply, 1000)).toBe(false)
    expect(canReadMessage(user('C2'), reply, 1000)).toBe(true)
  })

  it('limits emergency records to the patient, recorder and CMO', () => {
    const record = { patient: 'C4', by_user: 'C3' }
    expect(canReadEmergency(user('C1'), record)).toBe(false)
    for (const id of ['C4', 'C3', 'C2']) expect(canReadEmergency(user(id), record)).toBe(true)
    expect(canReadEvent(user('C1'), { kind: 'emergency', crew_id: 'C4' })).toBe(false)
  })

  it('filters assessments and includes the referenced sources', () => {
    const own = assessmentFor(user('C1'), 60, {}, 'mars', 'space')
    expect(own.subjects.map((s) => s.id)).toEqual(['C1', 'cabin'])
    for (const s of own.subjects) for (const f of [...s.earth, ...s.space]) {
      for (const id of f.sourceIds) expect(own.sources[id]).toBeDefined()
    }
    expect(assessmentFor(user('C2'), 60, {}, 'mars', 'space').subjects).toHaveLength(5)
    expect(assessmentFor(user('FS'), 60, {}, 'mars', 'space').subjects).toHaveLength(0)
  })
})

describe('Astrobio validation', () => {
  it('keeps all generated mission reports within the report budget', () => {
    for (const mission of ['iss', 'moon', 'mars'] as const) {
      for (const mode of ['earth', 'space'] as const) {
        for (let day = 1; day <= 90; day++) {
          expect(reportText(day, buildDay(day, {}, mission), mode).length).toBeLessThanOrEqual(REPORT_MAX_CHARS)
        }
      }
    }
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

  it('does not expose patient information through old unscoped emergency events', () => {
    const event = { kind: 'emergency', crew_id: null }
    expect(canReadEvent(user('C1'), event)).toBe(false)
    expect(canReadEvent(user('C2'), event)).toBe(true)
  })
})
