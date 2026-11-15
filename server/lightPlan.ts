import type { DatabaseSync } from 'node:sqlite'
import { CREW } from '../src/data/simulatedCrew.ts'
import { canSee, type User } from '../src/data/users.ts'
import { isMission } from '../src/data/missions.ts'
import type { CheckIns } from '../src/model.ts'
import { LIGHT_PLAN_VERSION, LIGHT_SOURCES, defaultLightPreferences, lightReview, lightSchedule, validLightPreferences, type LightPreferences } from '../src/lightPlan.ts'
import { RequestError } from './http.ts'

export function ensureLightPlan(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS light_preferences (crew_id TEXT NOT NULL, mission TEXT NOT NULL, preferences TEXT NOT NULL, at TEXT NOT NULL, by_user TEXT NOT NULL, PRIMARY KEY(crew_id,mission));
    CREATE TABLE IF NOT EXISTS light_stress_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT NOT NULL, mission TEXT NOT NULL, day INTEGER NOT NULL, score INTEGER NOT NULL, at TEXT NOT NULL, by_user TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS light_review_alerts (crew_id TEXT NOT NULL, mission TEXT NOT NULL, day INTEGER NOT NULL, status TEXT NOT NULL, reasons TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(crew_id,mission,day));
    CREATE TABLE IF NOT EXISTS light_plan_events (id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT NOT NULL, mission TEXT NOT NULL, day INTEGER NOT NULL, kind TEXT NOT NULL, action TEXT NOT NULL, at TEXT NOT NULL, by_user TEXT, detail TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS light_stress_context ON light_stress_reports(crew_id,mission,day,id);
    CREATE INDEX IF NOT EXISTS light_events_context ON light_plan_events(crew_id,mission,day,id);`)
}
export function lightContext(user:User,input:Record<string,unknown>) {
  if(user.role==='surgeon' || typeof input.crewId!=='string' || !canSee(user,input.crewId))throw new RequestError(403,'Not authorized for this onboard lighting plan.')
  if(!CREW.some(c=>c.id===input.crewId) || typeof input.day!=='number' || !Number.isInteger(input.day) || input.day<1 || input.day>90 || !isMission(input.mission))throw new RequestError(400,'Provide astronaut, day (1–90) and mission (iss/moon/mars).')
  return {crewId:input.crewId,day:input.day,mission:input.mission}
}
type Context=ReturnType<typeof lightContext>
function preferencesFor(db:DatabaseSync,c:Context) {
  const row=db.prepare('SELECT preferences,at,by_user FROM light_preferences WHERE crew_id=? AND mission=?').get(c.crewId,c.mission)
  return {preferences:row?JSON.parse(String(row.preferences)) as LightPreferences:defaultLightPreferences(c.crewId),origin:row?'saved_preferences':'demo_default',updatedAt:row?.at ?? null}
}
function latestStress(db:DatabaseSync,c:Context) {
  const row=db.prepare('SELECT score,at FROM light_stress_reports WHERE crew_id=? AND mission=? AND day=? ORDER BY id DESC LIMIT 1').get(c.crewId,c.mission,c.day)
  return row?{score:Number(row.score),at:String(row.at)}:null
}
function addEvent(db:DatabaseSync,c:Context,kind:string,action:string,detail:string,userId:string|null) {
  const at=new Date().toISOString()
  const result=db.prepare('INSERT INTO light_plan_events (crew_id,mission,day,kind,action,at,by_user,detail) VALUES (?,?,?,?,?,?,?,?)').run(c.crewId,c.mission,c.day,kind,action,at,userId,detail)
  return {id:Number(result.lastInsertRowid),at}
}
export function syncLightReview(db:DatabaseSync,c:Context,checkIns:CheckIns) {
  const review=lightReview(c.crewId,c.day,c.mission,checkIns,preferencesFor(db,c).preferences,latestStress(db,c))
  const prior=db.prepare('SELECT status,reasons FROM light_review_alerts WHERE crew_id=? AND mission=? AND day=?').get(c.crewId,c.mission,c.day)
  const reasons=JSON.stringify(review.reasons)
  if((prior || !['routine','disabled'].includes(review.status)) && (prior?.status!==review.status || prior?.reasons!==reasons)) {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('INSERT INTO light_review_alerts (crew_id,mission,day,status,reasons,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(crew_id,mission,day) DO UPDATE SET status=excluded.status,reasons=excluded.reasons,updated_at=excluded.updated_at').run(c.crewId,c.mission,c.day,review.status,reasons,new Date().toISOString())
      addEvent(db,c,'automatic_review',review.status,reasons,null)
      db.exec('COMMIT')
    }catch(error){db.exec('ROLLBACK');throw error}
  }
  return review
}
export function lightPlanFor(db:DatabaseSync,c:Context,checkIns:CheckIns) {
  const prefs=preferencesFor(db,c)
  return {...c,version:LIGHT_PLAN_VERSION,...prefs,clock:'Mission-local operational clock; not browser time or planetary daylight',simulated:true,deviceConnected:false,exposureAuthorized:false,
    schedule:lightSchedule(c.day,prefs.preferences),review:syncLightReview(db,c,checkIns),
    events:db.prepare('SELECT id,kind,action,at,by_user,detail FROM light_plan_events WHERE crew_id=? AND mission=? AND day=? ORDER BY id DESC LIMIT 30').all(c.crewId,c.mission,c.day),sources:LIGHT_SOURCES,
    limitations:'Illustrative circadian planning and research-review workflow, not a prescription or medical device. No light doses, irradiance, wavelengths, automatic exposure or cell-regeneration/stress-treatment claims. Mood/sleep rules are not validated stress detection. Screen colors are decorative only. Medical review must consider eye conditions, light sensitivity, photosensitizing medicines and mood-disorder history before actual light treatment.'}
}
export type LightPlanResponse=ReturnType<typeof lightPlanFor>
export function saveLightPreferences(db:DatabaseSync,user:User,c:Context,input:unknown) {
  if(!validLightPreferences(input))throw new RequestError(400,'Use valid HH:MM wake/bed times with a 7–10 hour sleep opportunity and boolean autoReview; no device/dose parameters are accepted.')
  db.prepare('INSERT INTO light_preferences (crew_id,mission,preferences,at,by_user) VALUES (?,?,?,?,?) ON CONFLICT(crew_id,mission) DO UPDATE SET preferences=excluded.preferences,at=excluded.at,by_user=excluded.by_user').run(c.crewId,c.mission,JSON.stringify(input),new Date().toISOString(),user.id)
  return addEvent(db,c,'preferences','saved',JSON.stringify(input),user.id)
}
export function saveLightStress(db:DatabaseSync,user:User,c:Context,score:unknown) {
  if(c.crewId!==user.id)throw new RequestError(403,'Stress self-reports must belong to the signed-in astronaut, not a selected colleague.')
  if(typeof score!=='number' || !Number.isInteger(score) || score<0 || score>10)throw new RequestError(400,'Self-reported stress must be an integer from 0 to 10.')
  const at=new Date().toISOString()
  const result=db.prepare('INSERT INTO light_stress_reports (crew_id,mission,day,score,at,by_user) VALUES (?,?,?,?,?,?)').run(c.crewId,c.mission,c.day,score,at,user.id)
  return {id:Number(result.lastInsertRowid),at}
}
export function saveLightAction(db:DatabaseSync,user:User,c:Context,kind:unknown,action:unknown) {
  const standard=['wake_cue','wind_down','sleep','auto_review'].includes(String(kind)) && ['acknowledged','dismissed'].includes(String(action))
  const research=kind==='red_review' && action==='requested'
  if(typeof kind!=='string' || typeof action!=='string' || (!standard && !research))throw new RequestError(400,'Only reminder acknowledgments/dismissals or red-light research review requests are supported. Treatment cannot be started or approved here.')
  return addEvent(db,c,kind,action,research?'CMO/research review requested. No exposure or clinical approval.':'Reminder action only; not proof of treatment, adherence or exposure.',user.id)
}
