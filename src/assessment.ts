// UI-independent contract for a replacement frontend. No React or WebGL imports.
import { canSee, type User } from './data/users.ts'
import type { MissionId } from './data/missions.ts'
import { buildDay, CABIN_ID, reportText, summarize, type CheckIns } from './model.ts'
import type { Mode } from './triage.ts'
import { SOURCES } from './data/sources.ts'

export function assessmentFor(user: User, day: number, checkIns: CheckIns, mission: MissionId, mode: Mode) {
  const subjects = user.role === 'surgeon' ? [] : buildDay(day, checkIns, mission).filter((s) => s.id === CABIN_ID || canSee(user, s.id))
  return {
    day,
    mission,
    mode,
    simulated: true as const,
    subjects,
    sources: Object.fromEntries([...new Set(subjects.flatMap((s) => [...s.earth, ...s.space].flatMap((f) => f.sourceIds)))].map((id) => [id, SOURCES[id]])),
    // These are differences between rule sets, not measured clinical accuracy.
    summary: summarize(subjects),
    report: reportText(day, subjects, mode),
  }
}

export type Assessment = ReturnType<typeof assessmentFor>
