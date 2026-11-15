import { afterEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { ensureCrewDataset, crewDatasetFor } from './crewDataset'
import { CREW, readingOn } from '../src/data/simulatedCrew'
import { USERS } from '../src/data/users'
import { getReading } from '../src/model'
import { generatedSeries } from '../src/crewDataset'

const databases:DatabaseSync[]=[]
function database() {const db=new DatabaseSync(':memory:');databases.push(db);return db}
afterEach(()=>{for(const db of databases.splice(0))db.close()})
describe('versioned crew dataset storage',()=>{
  it('seeds 1080 snapshots idempotently without touching existing tables or replacing existing rows',()=>{
    const db=database();db.exec("CREATE TABLE checkins (reading TEXT); INSERT INTO checkins VALUES ('USER_DATA')")
    ensureCrewDataset(db)
    expect(db.prepare('SELECT count(*) AS n FROM synthetic_crew_readings').get()!.n).toBe(1080)
    for(const mission of ['iss','moon','mars'] as const) {
      const data=crewDatasetFor(db,USERS[1],90,mission,90,{})
      for(const member of CREW) expect(data.crew.find(c=>c.id===member.id)!.series).toEqual(generatedSeries(member,90,mission,{},90))
    }
    db.prepare("UPDATE synthetic_crew_readings SET reading=? WHERE mission='mars' AND crew_id='C1' AND day=1").run(JSON.stringify({...getReading({},CREW[0],1),restingHrBpm:101}))
    ensureCrewDataset(db)
    expect(db.prepare('SELECT reading FROM checkins').get()!.reading).toBe('USER_DATA')
    expect(crewDatasetFor(db,USERS[0],1,'mars',1,{}).crew[0].series[0].reading.restingHrBpm).toBe(101)
    expect(db.prepare('SELECT count(*) AS n FROM synthetic_crew_readings').get()!.n).toBe(1080)
  })
  it('filters authorized profiles and future days and keeps manual readings out of seed storage',()=>{
    const db=database();ensureCrewDataset(db)
    const reading={...readingOn(CREW[0],60),restingHrBpm:111,attachment:{dataUrl:'data:image/jpeg;base64,UFJJVkFURQ==',width:1,height:1,bytes:7,attachedAt:'2026-11-15T00:00:00Z',caption:'PRIVATE_NOTE'}}
    const own=crewDatasetFor(db,USERS[0],60,'mars',10,{'C1:60':reading})
    expect(own.crew.map(c=>c.id)).toEqual(['C1'])
    expect(own.crew[0].series.map(p=>p.day)).toEqual([51,52,53,54,55,56,57,58,59,60])
    expect(own.crew[0].series.at(-1)!.reading.restingHrBpm).toBe(111)
    expect(own.crew[0].series.at(-1)!.origin).toBe('manual_checkin')
    expect(crewDatasetFor(db,USERS[1],60,'mars',10,{}).crew).toHaveLength(4)
    expect(crewDatasetFor(db,USERS[4],60,'mars',10,{}).crew).toHaveLength(0)
    expect(crewDatasetFor(db,USERS[0],60,'mars',10,{}).crew[0].series.at(-1)!.reading).toEqual(getReading({},CREW[0],60,'mars'))
    expect(JSON.stringify(own)).not.toContain('data:image')
    expect(JSON.stringify(own)).not.toContain('PRIVATE_NOTE')
  })
})
