import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { CREW, readingOn } from '../src/data/simulatedCrew'
import { USERS } from '../src/data/users'
import { ensureCrewDataset } from './crewDataset'
import { ensureObservations, saveObservation } from './observations'
import { ensureLightPlan, saveLightStress } from './lightPlan'
import { createMissionCsv, csvCell, downloadTelemetryBundle, ensureTelemetry, listTelemetryBundles, queueTelemetry, telemetryContext } from './telemetry'

function database() {
  const db=new DatabaseSync(':memory:')
  db.exec('CREATE TABLE checkins (crew_id TEXT,day INTEGER,reading TEXT,updated_at TEXT); CREATE TABLE tasks_done (user_id TEXT,day INTEGER,key TEXT); CREATE TABLE emergencies (id INTEGER PRIMARY KEY,patient TEXT,day INTEGER,scenario TEXT,by_user TEXT,started_at TEXT,steps TEXT);')
  ensureCrewDataset(db);ensureObservations(db);ensureLightPlan(db);ensureTelemetry(db);return db
}
describe('single mission CSV and simulated store-and-forward',()=>{
  it('exports authorized structured records and provenance, not images, secrets, other missions or future days',()=>{
    const db=database()
    try {
      const reading={...readingOn(CREW[0],2),attachment:{dataUrl:'PRIVATE_IMAGE',caption:'PRIVATE_CAPTION'}}
      db.prepare('INSERT INTO checkins VALUES (?,?,?,?)').run('C1',2,JSON.stringify(reading),'2026-11-15T00:00:00Z')
      db.prepare('INSERT INTO checkins VALUES (?,?,?,?)').run('C4',2,JSON.stringify(reading),'2026-11-15T00:00:00Z')
      saveObservation(db,USERS[0],{crewId:'C1',day:2,mission:'mars',source:'manual_entry',symptoms:['nausea']})
      saveObservation(db,USERS[0],{crewId:'C1',day:3,mission:'mars',source:'manual_entry',symptoms:['vomiting']})
      saveObservation(db,USERS[0],{crewId:'C1',day:2,mission:'iss',source:'manual_entry',symptoms:['diarrhea']})
      saveLightStress(db,USERS[0],{crewId:'C1',day:2,mission:'mars'},8)
      db.exec("INSERT INTO tasks_done VALUES ('C1',2,'EXPORT_TASK'); INSERT INTO emergencies VALUES (1,'C1',2,'EXPORT_PRACTICE','C1','2026-11-15T00:00:00Z','[]'); INSERT INTO emergencies VALUES (2,'C4',2,'PRIVATE_OTHER_PATIENT','C1','2026-11-15T00:00:00Z','[]')")
      const packet=createMissionCsv(db,USERS[0],{day:2,mission:'mars'}, {})
      expect(packet.crewIds).toEqual(['C1'])
      expect(packet.csv).toContain('"observation"');expect(packet.csv).toContain('nausea');expect(packet.csv).toContain('"stress_report"');expect(packet.csv).toContain('"cabin_light_target"');expect(packet.csv).toContain('"unit"')
      expect(packet.csv).not.toContain('PRIVATE_IMAGE');expect(packet.csv).not.toContain('PRIVATE_CAPTION')
      expect(packet.csv).not.toContain('"C4"');expect(packet.csv).not.toContain('vomiting');expect(packet.csv).not.toContain('diarrhea')
      expect(packet.csv).toContain('EXPORT_TASK');expect(packet.csv).toContain('EXPORT_PRACTICE');expect(packet.csv).not.toContain('PRIVATE_OTHER_PATIENT')
      expect(packet.sha256).toBe(createHash('sha256').update(packet.csv).digest('hex'))
      expect(packet.rowCount).toBe(packet.csv.trim().split('\r\n').length-1)
      const full=createMissionCsv(db,USERS[1],{day:90,mission:'mars'}, {})
      expect(full.crewIds).toEqual(['C1','C2','C3','C4'])
      expect(full.rowCount).toBeGreaterThan(25_000)
      expect(full.sizeBytes).toBeLessThan(16*1024*1024)
      expect(()=>telemetryContext(USERS[4],{day:2,mission:'mars'})).toThrow()
      expect(()=>telemetryContext(USERS[0],{day:91,mission:'mars'})).toThrow()
    }finally{db.close()}
  })
  it('quotes CSV safely including spreadsheet-formula prefixes and delimiters',()=>{
    expect(csvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"')
    for(const input of [' +SUM(1,2)','@SUM(A1)','-cmd','\t=1','\u0000=1'])expect(csvCell(input)).toContain("'")
    expect(csvCell('a,b\nc"d')).toBe('"a,b\nc""d"')
    expect(csvCell(-3)).toBe('"-3"')
  })
  it('queues immutable compressed snapshots, retries idempotently and gates Earth access by delivery',()=>{
    const db=database()
    try {
      const c={day:2,mission:'mars' as const},requestId=randomUUID()
      const first=queueTelemetry(db,USERS[0],c,{},requestId)
      ensureTelemetry(db)
      const retry=queueTelemetry(db,USERS[0],c,{},requestId)
      expect(retry.id).toBe(first.id);expect(retry.duplicate).toBe(true)
      expect(first.compressedBytes).toBeLessThan(first.sizeBytes)
      expect(listTelemetryBundles(db,USERS[4],first.deliverAt-1)).toEqual([])
      expect(listTelemetryBundles(db,USERS[2],first.deliverAt+1)).toEqual([])
      expect(listTelemetryBundles(db,USERS[4],first.deliverAt+1)).toHaveLength(1)
      expect(()=>downloadTelemetryBundle(db,USERS[4],first.id,first.deliverAt-1)).toThrow()
      expect(()=>downloadTelemetryBundle(db,USERS[2],first.id,first.deliverAt+1)).toThrow()
      const before=downloadTelemetryBundle(db,USERS[0],first.id).csv
      saveObservation(db,USERS[0],{crewId:'C1',day:2,mission:'mars',source:'manual_entry',symptoms:['nausea']})
      expect(downloadTelemetryBundle(db,USERS[4],first.id,first.deliverAt+1).csv).toEqual(before)
      expect(()=>queueTelemetry(db,USERS[0],{...c,day:3},{},requestId)).toThrow()
      db.prepare('UPDATE telemetry_bundles SET sha256=? WHERE id=?').run('0'.repeat(64),first.id)
      expect(()=>downloadTelemetryBundle(db,USERS[0],first.id)).toThrow('integrity')
    }finally{db.close()}
  })
})
