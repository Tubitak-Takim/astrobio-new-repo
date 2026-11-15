import type { CrewReading } from './triage.ts'
import type { MissionId } from './data/missions.ts'
import { CREW_PROFILES } from './data/crewProfiles.ts'
import { SOURCES } from './data/sources.ts'
import { cabinOn, type CrewMember } from './data/simulatedCrew.ts'
import { getReading, keyOf, lastMeasured, type CheckIns } from './model.ts'

export interface CrewDataPoint {
  day: number
  origin: 'synthetic_dataset' | 'manual_checkin'
  reading: Omit<CrewReading,'attachment'>
  cabin: {co2MmHg:number;cumulativeDoseMSv:number}
  measurementDays: Record<string,number>
}

export function measurementDays(day:number,manual:boolean) {
  const groups:Record<string,string>={hematocritPct:'hematocrit',onsdMm:'onsd',ijvFlow:'ijv',ijvClotSeen:'ijv',wbcK:'immune',lymphK:'immune',vitaminDNgMl:'vitd',bodyMassKg:'bodymass'}
  return Object.fromEntries(Object.entries(groups).map(([field,group])=>[field,manual?day:lastMeasured(group,day)]))
}

export function generatedSeries(crew: CrewMember,day:number,mission:MissionId,checkIns:CheckIns,window=30): CrewDataPoint[] {
  return Array.from({length:Math.min(day,window)},(_,index)=>{
    const d=Math.max(1,day-window+1)+index
    const {attachment:_attachment,...reading}=getReading(checkIns,crew,d,mission)
    const cabin=cabinOn(d,mission)
    const manual=Boolean(checkIns[keyOf(crew.id,d)])
    return {day:d,origin:manual?'manual_checkin':'synthetic_dataset',reading,cabin:{co2MmHg:cabin.co2MmHg,cumulativeDoseMSv:cabin.cumulativeDoseMSv},measurementDays:measurementDays(d,manual)}
  })
}

export function pearson(x: number[], y: number[]) {
  if(x.length!==y.length || x.length<8 || [...x,...y].some(v=>!Number.isFinite(v))) return null
  const mx=x.reduce((a,b)=>a+b,0)/x.length, my=y.reduce((a,b)=>a+b,0)/y.length
  let covariance=0, vx=0, vy=0
  for(let i=0;i<x.length;i++) { const a=x[i]-mx,b=y[i]-my; covariance+=a*b;vx+=a*a;vy+=b*b }
  if(vx<1e-12 || vy<1e-12) return null
  return Math.round(Math.max(-1,Math.min(1,covariance/Math.sqrt(vx*vy)))*1000)/1000
}

export function dataRelationships(series: CrewDataPoint[]) {
  const definitions: {id:string;label:string;x:(p:CrewDataPoint)=>number;y:(p:CrewDataPoint)=>number;sourceIds:string[];note:string}[] = [
    {id:'sleep-heart',label:'Sleep ↔ resting heart rate',x:p=>p.reading.sleepHours7d,y:p=>p.reading.restingHrBpm,sourceIds:['SLEEP'],note:'Shared programmed workload and sleep drivers; not an estimated physiological effect.'},
    {id:'sleep-mood',label:'Sleep ↔ mood',x:p=>p.reading.sleepHours7d,y:p=>p.reading.moodAvg7d,sourceIds:['SLEEP','MOOD'],note:'A programmed within-person association; mood is self-reported on a 1–5 demo scale.'},
    {id:'urine-heart',label:'Urine output ↔ resting heart rate',x:p=>p.reading.urineLitersDay,y:p=>p.reading.restingHrBpm,sourceIds:['URINE_TARGET'],note:'A fictional hydration/workload coupling, not a diagnostic relationship.'},
    {id:'co2-headache',label:'Cabin CO₂ ↔ reported headache',x:p=>p.cabin.co2MmHg,y:p=>Number(p.reading.headache),sourceIds:['CO2_HEADACHE'],note:'Pearson with headache coded 0/1 (point-biserial). A constant headache series has no coefficient.'},
    {id:'exercise-mass',label:'Exercise participation ↔ body mass',x:p=>p.reading.resistanceSessions7d,y:p=>p.reading.bodyMassKg,sourceIds:['EXERCISE_PLAN','MASS'],note:'Shared mission-time and energy-balance drivers can confound this association; it does not estimate exercise effects.'},
    {id:'day-vitamin',label:'Mission day ↔ vitamin D',x:p=>p.day,y:p=>p.reading.vitaminDNgMl,sourceIds:['VITD_FLIGHT'],note:'A deliberately programmed long-flight decline; scheduled lab measurements are held between sample days.'},
  ]
  return definitions.map(d=>({id:d.id,label:d.label,r:pearson(series.map(d.x),series.map(d.y)),n:series.length,manualPoints:series.filter(p=>p.origin==='manual_checkin').length,sourceIds:d.sourceIds,note:d.note}))
}

export function publicCrewProfile(id: string) {
  const profile=CREW_PROFILES[id]
  return {title:profile.title,description:profile.description,sources:profile.sourceIds.map(id=>({...SOURCES[id]}))}
}

export interface CrewDatasetResponse {
  version:string;mission:MissionId;day:number;fromDay:number;simulated:true
  crew:{id:string;name:string;role:string;profile:ReturnType<typeof publicCrewProfile>;series:CrewDataPoint[];relationships:ReturnType<typeof dataRelationships>}[]
  limitations:string
}
