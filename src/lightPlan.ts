import { CREW } from './data/simulatedCrew.ts'
import type { MissionId } from './data/missions.ts'
import { buildDay, getReading, keyOf, observationsFor, type CheckIns } from './model.ts'

export const LIGHT_PLAN_VERSION='circadian-demo-v1'
export interface LightPreferences { wakeTime:string; bedTime:string; autoReview:boolean }
export const LIGHT_SOURCES=[
  {title:'NASA: Circadian Light experiment',url:'https://www.nasa.gov/blogs/stationreport/2023/10/12/iss-daily-summary-report-10-12-2023/',note:'Research on varied lighting and circadian rhythm; not validation of this schedule.'},
  {title:'CDC/NIOSH: light color and circadian rhythms',url:'https://www.cdc.gov/niosh/work-hour-training-for-nurses/longhours/mod2/20.html',note:'Blue-containing light can suppress melatonin and shift circadian timing; not a bedtime relaxation treatment.'},
  {title:'AAD: red-light therapy evidence and precautions',url:'https://www.aad.org/public/cosmetic/safety/red-light-therapy',note:'Dermatology evidence is indication/device dependent. Not proof of astronaut cell regeneration, stress treatment or a dosing protocol.'},
]
export function defaultLightPreferences(crewId:string):LightPreferences {
  const times:Record<string,[string,string]>={C1:['06:30','22:30'],C2:['07:00','23:00'],C3:['07:30','23:30'],C4:['06:00','22:00']}
  const [wakeTime,bedTime]=times[crewId] ?? times.C1
  return {wakeTime,bedTime,autoReview:true}
}
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3))
export function validLightPreferences(value:unknown):value is LightPreferences {
  if(!value || typeof value!=='object' || Array.isArray(value))return false
  const p=value as LightPreferences
  if(Object.keys(p).some(k=>!['wakeTime','bedTime','autoReview'].includes(k)) || typeof p.autoReview!=='boolean' || ![p.wakeTime,p.bedTime].every(t=>typeof t==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)))return false
  const sleep=(minutes(p.wakeTime)-minutes(p.bedTime)+1440)%1440
  return sleep>=420 && sleep<=600 // Demo planning guard: 7–10 h opportunity, not prescribed sleep.
}
export function lightSchedule(day:number,preferences:LightPreferences) {
  const wake=minutes(preferences.wakeTime),bed=wake+(minutes(preferences.bedTime)-wake+1440)%1440
  const point=(minute:number,d:number)=>({day:d+Math.floor(minute/1440),time:`${String(Math.floor(minute%1440/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`})
  return Array.from({length:Math.min(7,91-day)},(_,i)=>{
    const d=day+i
    const slot=(kind:string,title:string,start:number,end:number,mode:string,description:string)=>({kind,title,start:point(start,d),end:point(end,d),mode,description})
    return {day:d,slots:[
      slot('wake_cue','Wake-time lighting reminder',wake,wake+30,'daylight','Illustrative planning window for mission-approved daytime lighting. Not a blue-light dose or a device instruction.'),
      slot('daytime','Daytime task lighting',wake+30,bed-90,'neutral','Use the mission-approved lighting plan for alertness and tasks; no therapeutic exposure is prescribed.'),
      slot('wind_down','Pre-sleep wind-down',bed-90,bed,'warm','Plan dim, warm-toned ambient lighting. Avoid blue-enriched/bright light near the intended sleep period.'),
      slot('sleep','Protected sleep opportunity',bed,wake+1440,'dark','Plan darkness, with only mission-approved safety lighting if needed. This is not overnight light treatment.'),
      ...(d%3===0?[slot('red_review','Red-light research review (no exposure)',wake+360,wake+375,'research','A demo discussion appointment only. CMO/research protocol review is required; no treatment, dose, wavelength or regeneration benefit is authorized.')]:[]),
    ].sort((a,b)=>a.start.day-b.start.day || a.start.time.localeCompare(b.start.time))}
  })
}
export function lightReview(crewId:string,day:number,mission:MissionId,checkIns:CheckIns,preferences:LightPreferences,stress:{score:number;at:string}|null) {
  const crew=CREW.find(c=>c.id===crewId)!
  const reading=getReading(checkIns,crew,day,mission)
  const subject=buildDay(day,checkIns,mission).find(s=>s.id===crewId)!
  const observations=observationsFor(checkIns,crewId,day,mission)
  const reported=[...new Set(observations.flatMap(o=>o.symptoms ?? []))]
  const reasons:string[]=[]
  const urgent=subject.space.some(f=>f.level==='red') || reported.some(s=>s==='chest_pain'||s==='shortness_of_breath')
  const caution=reading.headache || reading.visionChange
  if(urgent)reasons.push('Urgent rule finding or acute chest/breathing self-report: seek medical assessment, not light treatment.')
  else if(caution)reasons.push('Headache or vision change is present in the selected reading. Review with the medical officer before considering changes to light exposure.')
  else if(preferences.autoReview) {
    if(stress && stress.score>=7)reasons.push(`Self-reported stress ${stress.score}/10 meets the demo review threshold (7/10). This is not a stress diagnosis.`)
    if(reading.sleepHours7d<6 && reading.moodAvg7d<=2.5)reasons.push('Short sleep (<6 h) and lower mood (≤2.5/5) meet a demo fatigue-review rule; these are not a measured stress level.')
    if(reported.includes('fatigue') || reported.includes('insomnia'))reasons.push('A same-day fatigue or sleep-difficulty self-report is available for review.')
  }
  const status=urgent?'urgent':caution?'caution':reasons.length?'review':preferences.autoReview?'routine':'disabled'
  return {status,reasons,action:urgent?'Medical assessment takes priority. No light treatment should replace urgent care.':caution?'Discuss symptoms with the medical officer; no automatic light exposure.':status==='review'?'Automatically suggested: review sleep timing, workload and the ambient-light plan with the CMO; consider a voluntary quiet break. No automatic treatment.':'No automatic review prompt. The calendar remains a planning demonstration.',
    metrics:{sleepHours7d:reading.sleepHours7d,moodAvg7d:reading.moodAvg7d,baseOrigin:checkIns[keyOf(crewId,day)]?'manual_checkin':'synthetic_feed',savedUpdates:observations.length,reportedSymptoms:reported,selfReportedStress:stress},
    thresholdsAreDemo:true,measuredStressAvailable:false}
}
