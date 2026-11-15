import { createHash, randomUUID } from 'node:crypto'
import { gzipSync, gunzipSync } from 'node:zlib'
import type { DatabaseSync } from 'node:sqlite'
import { CREW, cabinOn } from '../src/data/simulatedCrew.ts'
import { canSee, type User } from '../src/data/users.ts'
import { isMission, linkDelay } from '../src/data/missions.ts'
import { buildDay, type CheckIns } from '../src/model.ts'
import { crewDatasetFor } from './crewDataset.ts'
import { readObservations } from './observations.ts'
import { cabinLightFor } from './cabinLighting.ts'
import { RequestError } from './http.ts'
import { defaultLightPreferences, LIGHT_PLAN_VERSION } from '../src/lightPlan.ts'

const VERSION='mission-csv-v1'
const MAX_CSV_BYTES=16*1024*1024
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UNITS:Record<string,string>={hematocritPct:'%',onsdMm:'mm',sleepHours7d:'hours (7-day average)',spo2Pct:'%',restingHrBpm:'bpm',urineLitersDay:'L/day',resistanceSessions7d:'sessions/7 days',moodAvg7d:'1–5 self-report average',bodyTempC:'deg C',systolicBp:'mmHg',diastolicBp:'mmHg',glucoseMgDl:'mg/dL',wbcK:'thousand/uL',lymphK:'thousand/uL',vitaminDNgMl:'ng/mL',bodyMassKg:'kg',co2MmHg:'mmHg',cumulativeDoseMSv:'mSv',doseRateMSvDay:'mSv/day',score:'0–10 self-report',targetBrightnessPct:'% simulated dimmer',targetColorTemperatureK:'K illustrative target'}
export function ensureTelemetry(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS telemetry_bundles (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL, by_user TEXT NOT NULL, crew_ids TEXT NOT NULL,
    mission TEXT NOT NULL, day INTEGER NOT NULL, created_at TEXT NOT NULL, deliver_at INTEGER NOT NULL,
    delay_min REAL NOT NULL, filename TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
    compressed_bytes INTEGER NOT NULL, row_count INTEGER NOT NULL, csv_gzip BLOB NOT NULL, UNIQUE(by_user,request_id));`)
}
export function telemetryContext(user:User,input:Record<string,unknown>) {
  if(user.role==='surgeon')throw new RequestError(403,'Earth can download delivered snapshots only, not live onboard exports.')
  if(typeof input.day!=='number' || !Number.isInteger(input.day) || input.day<1 || input.day>90 || !isMission(input.mission))throw new RequestError(400,'Provide day (1–90) and mission (iss/moon/mars).')
  return {day:input.day,mission:input.mission}
}
export function csvCell(value:unknown) {
  let s=value===null || value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value)
  if(typeof value==='string' && (/^[\s\u0000-\u001f\u007f\uFEFF]*[=+\-@]/.test(s) || /^[\u0000-\u001f]/.test(s)))s="'"+s
  return `"${s.replace(/"/g,'""')}"`
}
type ExportContext=ReturnType<typeof telemetryContext>
const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex')
export function createMissionCsv(db:DatabaseSync,user:User,c:ExportContext,checkIns:CheckIns) {
  telemetryContext(user,c)
  const id=randomUUID(),at=new Date().toISOString(),crewIds=CREW.filter(member=>canSee(user,member.id)).map(member=>member.id)
  const lines:string[]=[['schema_version','export_id','exported_at','record_type','record_id','crew_id','mission','mission_day','measured_at','received_at','source','field','value','unit','measurement_day','mission_scope'].map(csvCell).join(',')]
  let rows=0,estimatedBytes=Buffer.byteLength(lines[0])+5 // UTF-8 BOM + CRLF
  const row=(kind:string,recordId:unknown,crewId:string,day:number|null,source:string,field:string,value:unknown,measuredAt:unknown=null,receivedAt:unknown=null,measurementDay:number|null=null,scope='selected_mission')=>{
    const line=[VERSION,id,at,kind,recordId,crewId,c.mission,day,measuredAt,receivedAt,source,field,value,UNITS[field]??'',measurementDay,scope].map(csvCell).join(',')
    estimatedBytes+=Buffer.byteLength(line)+2
    if(estimatedBytes>MAX_CSV_BYTES)throw new RequestError(413,'Export exceeds the 16 MiB prototype limit; choose an earlier day.')
    lines.push(line);rows++
  }
  const fields=(kind:string,recordId:unknown,crewId:string,day:number|null,source:string,values:Record<string,unknown>,measuredAt:unknown=null,receivedAt:unknown=null,scope='selected_mission')=>{
    for(const [key,value] of Object.entries(values))if(key!=='attachment')row(kind,recordId,crewId,day,source,key,value,measuredAt,receivedAt,null,scope)
  }
  const dataset=crewDatasetFor(db,user,c.day,c.mission,c.day,checkIns)
  for(const member of dataset.crew)for(const point of member.series) {
    for(const [key,value] of Object.entries(point.reading)) {
      const update=point.observations?.filter(o=>Object.hasOwn(o.values,key)).at(-1)
      row('health_snapshot',`${member.id}:${point.day}`,member.id,point.day,update?`${point.origin}+${update.source}`:point.origin,key,value,update?.measuredAt,update?.receivedAt,point.measurementDays[key]??point.day)
    }
  }
  for(let day=1;day<=c.day;day++) {
    fields('cabin_snapshot',day,'cabin',day,'synthetic_cabin',cabinOn(day,c.mission) as unknown as Record<string,unknown>)
    for(const subject of buildDay(day,checkIns,c.mission).filter(s=>s.id==='cabin'||crewIds.includes(s.id)))for(const f of subject.space)fields('rule_finding',`${subject.id}:${day}:${f.id}`,subject.id,day,'server_rules',{findingId:f.id,level:f.level,measured:f.measured,provenance:subject.info[f.id]})
  }
  for(const r of db.prepare('SELECT crew_id,day,reading,updated_at FROM checkins WHERE day<=? ORDER BY crew_id,day').all(c.day))if(crewIds.includes(String(r.crew_id)))fields('manual_checkin',`${r.crew_id}:${r.day}`,String(r.crew_id),Number(r.day),'manual_checkin',JSON.parse(String(r.reading)),r.updated_at,null,'all_missions_legacy_key')
  for(const o of readObservations(db))if(crewIds.includes(o.crewId) && o.mission===c.mission && o.day<=c.day)fields('observation',o.id,o.crewId,o.day,o.source,{...o.values,...(o.symptoms?.length?{symptoms:o.symptoms}:{})},o.measuredAt,o.receivedAt)
  for(const r of db.prepare('SELECT * FROM light_stress_reports WHERE mission=? AND day<=? ORDER BY id').all(c.mission,c.day))if(crewIds.includes(String(r.crew_id)))row('stress_report',r.id,String(r.crew_id),Number(r.day),'self_report','score',r.score,r.at,r.at)
  const preferences=db.prepare('SELECT * FROM light_preferences WHERE mission=? ORDER BY crew_id').all(c.mission)
  for(const crewId of crewIds) {
    const saved=preferences.find(r=>r.crew_id===crewId)
    fields('light_preferences',crewId,crewId,null,saved?'saved_preferences':'demo_default',saved?JSON.parse(String(saved.preferences)):defaultLightPreferences(crewId),saved?.at ?? at,null,'current_configuration')
  }
  for(const r of db.prepare('SELECT * FROM light_plan_events WHERE mission=? AND day<=? ORDER BY id').all(c.mission,c.day))if(crewIds.includes(String(r.crew_id)))fields('light_event',r.id,String(r.crew_id),Number(r.day),'light_audit',{kind:r.kind,action:r.action,byUser:r.by_user,detail:r.detail},r.at)
  for(const r of db.prepare('SELECT * FROM light_review_alerts WHERE mission=? AND day<=? ORDER BY crew_id,day').all(c.mission,c.day))if(crewIds.includes(String(r.crew_id)))fields('light_review',`${r.crew_id}:${r.day}`,String(r.crew_id),Number(r.day),'demo_review_rules',{status:r.status,reasons:JSON.parse(String(r.reasons))},r.updated_at)
  for(const r of db.prepare('SELECT user_id,day,key FROM tasks_done WHERE day<=? ORDER BY user_id,day,key').all(c.day))if(crewIds.includes(String(r.user_id)))fields('task_done',`${r.user_id}:${r.day}:${r.key}`,String(r.user_id),Number(r.day),'crew_task_log',{taskKey:r.key,done:true},null,null,'all_missions_legacy_key')
  for(const r of db.prepare('SELECT * FROM emergencies WHERE day<=? ORDER BY id').all(c.day))if(crewIds.includes(String(r.patient)))fields('emergency_practice',r.id,String(r.patient),Number(r.day),'simulated_emergency_practice',{scenario:r.scenario,byUser:r.by_user,steps:JSON.parse(String(r.steps))},r.started_at,null,'mission_not_recorded')
  const cabin=cabinLightFor(db,c.mission,new Date(at))
  fields('cabin_light_target','current','cabin',null,'automatic_simulation',{phase:cabin.phase,targetBrightnessPct:cabin.targetBrightnessPct,targetColorTemperatureK:cabin.targetColorTemperatureK,referenceClock:cabin.referenceClock,automatic:cabin.automatic,deviceConnected:false,commandSent:false,...cabin.config},at,null,'current_configuration')
  for(const r of db.prepare('SELECT * FROM cabin_light_events WHERE mission=? ORDER BY id').all(c.mission))fields('cabin_light_event',r.id,'cabin',null,'cabin_schedule_audit',{config:JSON.parse(String(r.config)),byUser:r.by_user},r.at,null,'current_configuration_history')
  fields('manifest',id,'',null,'export_service',{scope:'All authorized structured records for selected mission, days 1 through selected day. Current configuration is not historical telemetry.',crewIds,simulated:true,deviceConnected:false,excluded:'Images, private notes, messages, conversational transcripts, credentials, sessions, model files and unrelated missions.',valueUnits:'The unit column identifies measurement units and self-report scales; blank units identify categorical, metadata or JSON values.',datasetVersion:dataset.version,lightPlanVersion:LIGHT_PLAN_VERSION},at)
  const csv='\uFEFF'+lines.join('\r\n')+'\r\n',size=Buffer.byteLength(csv)
  if(size>MAX_CSV_BYTES)throw new RequestError(413,'Export exceeds the 16 MiB prototype limit; choose an earlier day.')
  return {id,csv,sha256:hash(csv),sizeBytes:size,rowCount:rows,crewIds,createdAt:at,filename:`astrobio-${c.mission}-days-1-${c.day}-${id}.csv`,...c}
}
type BundleRow=Record<string,unknown>
function canReadBundle(user:User,row:BundleRow,now:number) {
  if(user.role==='surgeon')return Number(row.deliver_at)<=now
  const ids=JSON.parse(String(row.crew_ids)) as string[]
  return ids.length>0 && ids.every(id=>canSee(user,id))
}
function summary(row:BundleRow,now:number) {
  return {id:String(row.id),mission:String(row.mission),day:Number(row.day),createdAt:String(row.created_at),deliverAt:Number(row.deliver_at),delayMinutes:Number(row.delay_min),delivered:Number(row.deliver_at)<=now,sha256:String(row.sha256),sizeBytes:Number(row.size_bytes),compressedBytes:Number(row.compressed_bytes),rowCount:Number(row.row_count),filename:String(row.filename),crewIds:JSON.parse(String(row.crew_ids)) as string[],simulated:true,physicalDeliveryVerified:false}
}
export function listTelemetryBundles(db:DatabaseSync,user:User,now=Date.now()) {
  return db.prepare('SELECT id,crew_ids,mission,day,created_at,deliver_at,delay_min,filename,sha256,size_bytes,compressed_bytes,row_count FROM telemetry_bundles ORDER BY created_at DESC').all().filter(row=>canReadBundle(user,row,now)).slice(0,20).map(row=>summary(row,now))
}
export function queueTelemetry(db:DatabaseSync,user:User,c:ExportContext,checkIns:CheckIns,requestId:unknown) {
  telemetryContext(user,c)
  if(typeof requestId!=='string' || !uuid.test(requestId))throw new RequestError(400,'Provide a UUID requestId for duplicate-safe queuing.')
  const existing=db.prepare('SELECT * FROM telemetry_bundles WHERE by_user=? AND request_id=?').get(user.id,requestId)
  if(existing) {
    if(existing.mission!==c.mission || Number(existing.day)!==c.day)throw new RequestError(409,'This requestId belongs to a different export context.')
    return {...summary(existing,Date.now()),duplicate:true}
  }
  const packet=createMissionCsv(db,user,c,checkIns),compressed=gzipSync(packet.csv),delay=linkDelay(c.mission,c.day)
  const deliverAt=Date.now()+delay.demoMs
  db.prepare('INSERT INTO telemetry_bundles (id,request_id,by_user,crew_ids,mission,day,created_at,deliver_at,delay_min,filename,sha256,size_bytes,compressed_bytes,row_count,csv_gzip) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(packet.id,requestId,user.id,JSON.stringify(packet.crewIds),c.mission,c.day,packet.createdAt,deliverAt,delay.minutes,packet.filename,packet.sha256,packet.sizeBytes,compressed.byteLength,packet.rowCount,compressed)
  return {...summary(db.prepare('SELECT * FROM telemetry_bundles WHERE id=?').get(packet.id)!,Date.now()),duplicate:false}
}
export function downloadTelemetryBundle(db:DatabaseSync,user:User,id:string,now=Date.now()) {
  const row=uuid.test(id)?db.prepare('SELECT * FROM telemetry_bundles WHERE id=?').get(id):undefined
  if(!row || !canReadBundle(user,row,now))throw new RequestError(404,'Export not available to this account or not yet delivered.')
  let csv:Buffer
  try{csv=gunzipSync(row.csv_gzip as Uint8Array,{maxOutputLength:MAX_CSV_BYTES});}catch{throw new RequestError(409,'Export integrity check failed.')}
  if(csv.byteLength!==Number(row.size_bytes) || hash(csv)!==row.sha256)throw new RequestError(409,'Export integrity check failed.')
  return {csv,filename:String(row.filename),sha256:String(row.sha256),rowCount:Number(row.row_count)}
}
