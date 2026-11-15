import type { DatabaseSync } from 'node:sqlite'
import { CREW } from '../src/data/simulatedCrew.ts'
import { canSee, type User } from '../src/data/users.ts'
import { isMission } from '../src/data/missions.ts'
import { type Observation } from '../src/model.ts'
import { RequestError } from './http.ts'
import { directSymptomReports, isSymptomId, type SymptomId } from '../src/symptoms.ts'

export function ensureObservations(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS health_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, crew_id TEXT NOT NULL, day INTEGER NOT NULL,
    mission TEXT NOT NULL, source TEXT NOT NULL, measured_at TEXT NOT NULL,
    received_at TEXT NOT NULL, by_user TEXT NOT NULL, values_json TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS observations_subject ON health_observations(crew_id,mission,day,id);`)
  if(!db.prepare('PRAGMA table_info(health_observations)').all().some(c=>c.name==='symptoms_json')) db.exec("ALTER TABLE health_observations ADD COLUMN symptoms_json TEXT NOT NULL DEFAULT '[]'")
}
const ranges:Record<string,[number,number]>={restingHrBpm:[20,220],spo2Pct:[50,100],bodyTempC:[30,43],systolicBp:[50,260],diastolicBp:[30,160],glucoseMgDl:[20,600]}
export function validateObservation(user:User,body:Record<string,unknown>,chat=false) {
  if(user.role==='surgeon' || typeof body.crewId!=='string' || !canSee(user,body.crewId)) throw new RequestError(403,'Not authorized for this astronaut.')
  if(!CREW.some(c=>c.id===body.crewId) || !Number.isInteger(body.day) || Number(body.day)<1 || Number(body.day)>90 || !isMission(body.mission)) throw new RequestError(400,'Provide crewId, day (1–90) and mission (iss/moon/mars).')
  if(typeof body.source!=='string' || !(chat?body.source==='chat_self_report':['manual_entry','demo_stream','external_api'].includes(body.source))) throw new RequestError(400,'Invalid observation source.')
  const symptoms=body.symptoms===undefined?[]:body.symptoms
  if(!Array.isArray(symptoms) || symptoms.length>16 || !symptoms.every(isSymptomId) || new Set(symptoms).size!==symptoms.length) throw new RequestError(400,'Invalid symptom list.')
  const values=body.values===undefined?{}:body.values
  if(!values || typeof values!=='object' || Array.isArray(values) || (!Object.keys(values).length && !symptoms.length)) throw new RequestError(400,'Provide at least one measurement or supported symptom.')
  for(const [key,value] of Object.entries(values)) {
    if(key==='headache' || key==='visionChange') {if(typeof value!=='boolean') throw new RequestError(400,`${key} must be true or false.`);continue}
    const range=Object.hasOwn(ranges,key)?ranges[key]:undefined
    if(!range || typeof value!=='number' || !Number.isFinite(value) || value<range[0] || value>range[1]) throw new RequestError(400,`Invalid measurement: ${key}.`)
  }
  const measured=body.measuredAt===undefined?Date.now():typeof body.measuredAt==='string'?Date.parse(body.measuredAt):NaN
  if(!Number.isFinite(measured) || measured>Date.now()+60_000 || measured<Date.now()-86400_000) throw new RequestError(400,'measuredAt must be within the last 24 hours (at most one minute ahead).')
  const normalized={...values} as Observation['values']
  for(const [id,field] of [['headache','headache'],['vision_change','visionChange']] as const) if(symptoms.includes(id)) {
    if(normalized[field]===false) throw new RequestError(400,'Symptom conflicts with supplied field.')
    normalized[field]=true
  }
  return {crewId:body.crewId,day:Number(body.day),mission:body.mission,source:String(body.source),measuredAt:new Date(measured).toISOString(),values:normalized,...(symptoms.length?{symptoms:symptoms as SymptomId[]}:{})}
}
export function saveObservation(db:DatabaseSync,user:User,body:Record<string,unknown>,chat=false):Observation {
  const o=validateObservation(user,body,chat),receivedAt=new Date().toISOString()
  const result=db.prepare('INSERT INTO health_observations (crew_id,day,mission,source,measured_at,received_at,by_user,values_json,symptoms_json) VALUES (?,?,?,?,?,?,?,?,?)').run(o.crewId,o.day,o.mission,o.source,o.measuredAt,receivedAt,user.id,JSON.stringify(o.values),JSON.stringify(o.symptoms ?? []))
  return {...o,id:Number(result.lastInsertRowid),receivedAt}
}
export function readObservations(db:DatabaseSync):Observation[] {
  return db.prepare('SELECT * FROM health_observations ORDER BY measured_at,id').all().map(r=>{
    const symptoms=JSON.parse(String(r.symptoms_json)) as SymptomId[]
    return {id:Number(r.id),crewId:String(r.crew_id),day:Number(r.day),mission:r.mission as Observation['mission'],source:String(r.source),measuredAt:String(r.measured_at),receivedAt:String(r.received_at),values:JSON.parse(String(r.values_json)),...(symptoms.length?{symptoms}:{})}
  })
}

// Deliberately narrow, whole-message grammar. Never use generated prose as a write instruction.
export function directHeadacheReport(message:string) {
  const reports=directSymptomReports(message)
  return reports.length===1 && reports[0]==='headache'
}
