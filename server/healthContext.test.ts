import { describe, expect, it } from 'vitest'
import { hasGroundedNumbers, healthContextFor, requestsHealthRecords } from './healthContext'
import { CREW, readingOn } from '../src/data/simulatedCrew'
import { USERS } from '../src/data/users'
import type { CheckIns } from '../src/model'

const crew=USERS.find(u=>u.id==='C1')!
const cmo=USERS.find(u=>u.id==='C2')!
const surgeon=USERS.find(u=>u.id==='FS')!
describe('authorized selected health context',()=>{
  it('adds records for explicit data-analysis requests, not ordinary conversation or general education',()=>{
    for(const text of ['Genel sağlık verilerimi analiz edebilir misin?','Verilerimi değerlendir','Analyze my health records','Summarize my data','Explain my readings']) expect(requestsHealthRecords(text)).toBe(true)
    for(const text of ['Merhaba','Başım ağrıyor','Explain what a headache is','Tell me about Mars']) expect(requestsHealthRecords(text)).toBe(false)
  })
  it('uses saved measurements, excludes attachments/extra fields, and includes only selected-subject history',()=>{
    const reading={...readingOn(CREW[0],60),restingHrBpm:87,attachment:{dataUrl:'IMAGE_SECRET',caption:'NOTE_SECRET'},extra:'EXTRA_SECRET'}
    const records={'C1:60':reading,'C1:59':readingOn(CREW[0],59),'C1:61':{...readingOn(CREW[0],61),restingHrBpm:188},'C4:59':{...readingOn(CREW[3],59),restingHrBpm:199}} as unknown as CheckIns
    const result=healthContextFor(crew,'C1',60,'mars',records)!
    expect(result.origin).toBe('database_checkin')
    expect(result.values).toMatchObject({restingHrBpm:87})
    expect(result.previousSavedReadings.map(r=>r.day)).toEqual([59])
    expect(result.provenance.vitals).toMatchObject({source:'Crew check-in',ageDays:0,stale:false})
    const text=JSON.stringify(result)
    for(const value of ['IMAGE_SECRET','NOTE_SECRET','EXTRA_SECRET','C4','attachment','E. Vance','188','199']) expect(text).not.toContain(value)
  })
  it('refuses unauthorized subjects and all Earth-role requests even if data exist',()=>{
    expect(healthContextFor(crew,'C4',60,'mars',{})).toBeNull()
    expect(healthContextFor(surgeon,'C1',60,'mars',{})).toBeNull()
    expect(healthContextFor(surgeon,'cabin',60,'mars',{})).toBeNull()
    expect(healthContextFor(cmo,'unknown',60,'mars',{})).toBeNull()
    expect(healthContextFor(crew,'C1',0,'mars',{})).toBeNull()
  })
  it('labels simulated fallback and stale measurements rather than pretending the database has fresh records',()=>{
    const result=healthContextFor(crew,'C1',60,'moon',{})!
    expect(result.origin).toBe('simulated_feed')
    expect(result.previousSavedReadings).toEqual([])
    expect(result.provenance.hematocrit.stale).toBe(true)
    expect(result.findings.some(f=>f.id==='vitals')).toBe(true)
    expect(result.sources.every(s=>s.id&&s.status)).toBe(true)
    expect(result.mission).toBe('moon')
  })
  it('does not carry an old saved check-in into the selected day',()=>{
    const result=healthContextFor(crew,'C1',60,'mars',{'C1:59':{...readingOn(CREW[0],59),restingHrBpm:177}})!
    expect(result.origin).toBe('simulated_feed')
    expect(result.values).not.toHaveProperty('restingHrBpm',177)
    expect(result.previousSavedReadings[0].values.restingHrBpm).toBe(177)
  })
  it('limits history to seven previous selected-person records and keeps context bounded',()=>{
    const records:CheckIns={}
    for(const member of CREW) for(let day=1;day<=90;day++) records[`${member.id}:${day}`]=readingOn(member,day)
    for(const member of CREW) {
      const result=healthContextFor(cmo,member.id,90,'mars',records)!
      expect(result.previousSavedReadings.map(r=>r.day)).toEqual([89,88,87,86,85,84,83])
      expect(JSON.stringify(result).length).toBeLessThanOrEqual(12000)
      expect(result.subjectId).toBe(member.id)
    }
  })
  it('can provide only cabin context without attaching any crew measurements',()=>{
    const result=healthContextFor(crew,'cabin',60,'mars',{'C1:60':readingOn(CREW[0],60)})!
    expect(result.subjectId).toBe('cabin')
    expect(result.baseline).toBeNull()
    expect(result.previousSavedReadings).toEqual([])
    expect(JSON.stringify(result)).not.toContain('restingHrBpm')
    expect(result.findings.map(f=>f.id)).toEqual(['co2','radiation'])
  })
  it('rejects invented numbers while allowing provided measurements and decimal-comma formatting',()=>{
    const context=healthContextFor(crew,'C1',60,'mars',{'C1:60':{...readingOn(CREW[0],60),restingHrBpm:87,bodyTempC:36.7}})!
    expect(hasGroundedNumbers('1. Heart rate 87 bpm; temperature 36,7 °C.',context,'Analyze')).toBe(true)
    expect(hasGroundedNumbers('Heart rate 777 bpm.',context,'Analyze')).toBe(false)
    expect(hasGroundedNumbers('You reported 95 today.',context,'I measured 95 today')).toBe(true)
  })
})
