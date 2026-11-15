import type { DatabaseSync } from 'node:sqlite'
import { SYNTHETIC_VERSION } from '../src/data/crewProfiles.ts'
import { CREW, MISSION_DAYS, cabinOn } from '../src/data/simulatedCrew.ts'
import { MISSIONS, type MissionId } from '../src/data/missions.ts'
import { canSee, type User } from '../src/data/users.ts'
import { getReading, keyOf, type CheckIns } from '../src/model.ts'
import { validateReading } from '../src/validate.ts'
import { dataRelationships, measurementDays, publicCrewProfile, type CrewDataPoint, type CrewDatasetResponse } from '../src/crewDataset.ts'

// Separate versioned table: never seed demo rows into medical check-ins, never
// overwrite a user's existing check-ins or relabel every simulated lab as fresh.
export function ensureCrewDataset(db: DatabaseSync) {
  db.exec('CREATE TABLE IF NOT EXISTS synthetic_crew_readings (version TEXT NOT NULL, mission TEXT NOT NULL, crew_id TEXT NOT NULL, day INTEGER NOT NULL, reading TEXT NOT NULL, PRIMARY KEY(version,mission,crew_id,day))')
  const insert=db.prepare('INSERT OR IGNORE INTO synthetic_crew_readings (version,mission,crew_id,day,reading) VALUES (?,?,?,?,?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    for(const mission of Object.keys(MISSIONS) as MissionId[]) for(const crew of CREW) for(let day=1;day<=MISSION_DAYS;day++) {
      insert.run(SYNTHETIC_VERSION,mission,crew.id,day,JSON.stringify(getReading({},crew,day,mission)))
    }
    db.exec('COMMIT')
  } catch(error) { db.exec('ROLLBACK'); throw error }
}

export function crewDatasetFor(db: DatabaseSync,user: User,day:number,mission:MissionId,window:number,checkIns:CheckIns): CrewDatasetResponse {
  const fromDay=Math.max(1,day-window+1)
  const select=db.prepare('SELECT day,reading FROM synthetic_crew_readings WHERE version=? AND mission=? AND crew_id=? AND day BETWEEN ? AND ? ORDER BY day')
  const allowed=user.role==='surgeon'?[]:CREW.filter(c=>canSee(user,c.id))
  const crew=allowed.map(member=>{
    const rows=select.all(SYNTHETIC_VERSION,mission,member.id,fromDay,day)
    const series:CrewDataPoint[]=rows.map(row=>{
      const d=Number(row.day), manual=checkIns[keyOf(member.id,d)]
      const validated=validateReading(manual ?? JSON.parse(String(row.reading)))
      if(!validated.ok) throw new Error('Invalid stored crew dataset reading')
      const {attachment: _attachment,...reading}=validated.reading
      const cabin=cabinOn(d,mission)
      return {day:d,origin:manual?'manual_checkin':'synthetic_dataset',reading,cabin:{co2MmHg:cabin.co2MmHg,cumulativeDoseMSv:cabin.cumulativeDoseMSv},measurementDays:measurementDays(d,Boolean(manual))}
    })
    if(series.length!==day-fromDay+1) throw new Error('Incomplete crew dataset; restart to add missing synthetic rows')
    return {id:member.id,name:member.name,role:member.role,profile:publicCrewProfile(member.id),series,relationships:dataRelationships(series)}
  })
  return {version:SYNTHETIC_VERSION,mission,day,fromDay,simulated:true,crew,limitations:'Fictional astronauts and programmed associations, not NASA medical records or clinical predictions. Published sources support broad research themes only, not these coefficients. Correlation does not establish causation; shared time trends, autocorrelation and scheduled sample-hold affect coefficients. Manual check-ins override only their exact person/day and are shared across mission settings (the existing key does not include mission). No notes or images are included.'}
}
