// Server-built, selected-subject-only context. No SQL, images, notes, names,
// session tokens or arbitrary client-supplied context is passed to a model.
import { CREW, MISSION_DAYS, cabinOn } from '../src/data/simulatedCrew.ts'
import { canSee, type User } from '../src/data/users.ts'
import { isMission, type MissionId } from '../src/data/missions.ts'
import { buildDay, getReading, keyOf, OBSERVATIONS, type CheckIns } from '../src/model.ts'
import { SOURCES } from '../src/data/sources.ts'
import type { CrewReading } from '../src/triage.ts'
import { dataRelationships, generatedSeries } from '../src/crewDataset.ts'
import { SYNTHETIC_VERSION } from '../src/data/crewProfiles.ts'

const FIELDS = ['hematocritPct','onsdMm','visionChange','ijvFlow','ijvClotSeen','headache','sleepHours7d','spo2Pct','restingHrBpm','urineLitersDay','resistanceSessions7d','moodAvg7d','bodyTempC','systolicBp','diastolicBp','glucoseMgDl','wbcK','lymphK','vitaminDNgMl','bodyMassKg'] as const satisfies readonly (keyof CrewReading)[]
const HISTORY_FIELDS = ['restingHrBpm','spo2Pct','sleepHours7d','bodyTempC','systolicBp','diastolicBp','bodyMassKg','headache'] as const
const fields = <K extends keyof CrewReading>(reading: CrewReading, keys: readonly K[]) => Object.fromEntries(keys.map(key => [key, reading[key]]))

export function requestsHealthRecords(message: string) {
  const value=message.toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i')
  return /\b(?:health|medical) (?:data|records|history|measurements|results)\b|\b(?:my )?(?:check.?ins?|measurements?|readings?)\b|\b(?:verilerim\w*|olcumlerim\w*|tahlil\w*|saglik ver\w*|saglik kayit\w*|kayitlarim\w*|sonuclarim\w*)\b|\b(?:analy[sz]e|summari[sz]e|review) my (?:data|records|results)\b/.test(value)
}

export function healthContextFor(user: User, subjectId: string, day: number, mission: MissionId, checkIns: CheckIns) {
  if (user.role === 'surgeon' || (subjectId !== 'cabin' && !canSee(user, subjectId))) return null
  if (!Number.isInteger(day) || day < 1 || day > MISSION_DAYS || !isMission(mission)) return null
  const crew = CREW.find(c => c.id === subjectId)
  if (!crew && subjectId !== 'cabin') return null
  const subject = buildDay(day, checkIns, mission).find(s => s.id === subjectId)!
  const saved = crew ? checkIns[keyOf(subjectId, day)] : undefined
  const history: { day: number; values: Record<string, unknown> }[] = []
  // Only previous saved readings, never future entries or other people's data.
  for (let d = day - 1; crew && d >= 1 && history.length < 7; d--) {
    const reading = checkIns[keyOf(subjectId, d)]
    if (reading) history.push({ day: d, values: fields(reading, HISTORY_FIELDS) })
  }
  const sourceIds = [...new Set(subject.space.flatMap(f => f.sourceIds))]
  const levels = { red: 0, amber: 1, green: 2 }
  const detailed = new Set([...subject.space].sort((a,b) => levels[a.level]-levels[b.level] || Number(subject.info[b.id]?.stale)-Number(subject.info[a.id]?.stale)).slice(0,3).map(f=>f.id))
  const recent=(checkIns[OBSERVATIONS] ?? []).filter(o=>o.crewId===subjectId && o.mission===mission && o.day<=day && o.day>=day-6)
  // A fast demo/sensor stream must not immediately crowd a symptom report out.
  const reports=recent.filter(o=>o.symptoms?.length || o.values.headache!==undefined).slice(-8)
  const reportIds=new Set(reports.map(o=>o.id))
  const other=recent.filter(o=>!reportIds.has(o.id) && !o.symptoms?.length && o.values.headache===undefined)
  const recentObservations=[...reports,...(reports.length<8?other.slice(-(8-reports.length)):[])].sort((a,b)=>a.measuredAt.localeCompare(b.measuredAt)||a.id-b.id)
  const context = {
    subjectId, day, mission, prototype: true,
    origin: saved ? 'database_checkin' as const : 'simulated_feed' as const,
    values: crew ? fields(getReading(checkIns, crew, day, mission), FIELDS) : cabinOn(day, mission),
    baseline: crew?.baseline ?? null,
    provenance: Object.fromEntries(Object.entries(subject.info).map(([id,p])=>[id,{source:p.source,measuredDay:p.measuredDay,ageDays:p.ageDays,stale:p.stale}])),
    findings: subject.space.map(({ id, level, measured, why, next, sourceIds }) => ({ id, level, measured, why: detailed.has(id) ? why : undefined, next: detailed.has(id) ? next : undefined, sourceIds })),
    sources: sourceIds.map(id => ({ id, status: SOURCES[id].status })),
    previousSavedReadings: history,
    recentObservations,
    datasetVersion: SYNTHETIC_VERSION,
    associations: crew ? {fromDay:Math.max(1,day-29),toDay:day,results:dataRelationships(generatedSeries(crew,day,mission,checkIns)).map(({id,r,n,manualPoints})=>({id,r,n,manualPoints})),caution:'Exploratory correlations in a synthetic/mixed series, not causal effects or clinical predictions. Coefficients and coupling drivers are not NASA findings.'} : null,
    limits: 'Simulation prototype, not clinically validated. origin describes the base reading only; recentObservations are separate health updates. Symptoms are self-reports, not diagnoses or measured vitals. Feverishness does not establish a temperature; palpitations do not establish a heart rate. Full check-ins supersede older field overlays, not historical symptom reports. Older reports are not automatically current symptoms. History includes at most seven prior saved check-in summaries; recentObservations includes at most eight updates within seven mission days, prioritizing symptom reports over vital streams. No other people/missions/future days, images, arbitrary notes or transcript history. Provenance age/stale flags refer to the selected day, not the calendar date. Unrelated lab freshness is unchanged by partial updates.',
  }
  // Context is server bounded before generation; do not silently truncate a
  // finding or discard its stale flag to make it fit the model context window.
  if (JSON.stringify(context).length > 12_000) throw new Error('Selected health context exceeds the model budget')
  return context
}

export type HealthContext = NonNullable<ReturnType<typeof healthContextFor>>

// Catch newly invented numeric claims. This does NOT validate relationships,
// diagnoses, arithmetic or statements such as "normal"; review is still needed.
export function hasGroundedNumbers(reply: string, context: HealthContext, message: string) {
  const numbers = (text: string) => (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => String(Number(n.replace(',', '.'))))
  const allowed = new Set([...numbers(JSON.stringify(context)), ...numbers(message), '1', '2', '3', '4'])
  return numbers(reply).every(number => allowed.has(number))
}
