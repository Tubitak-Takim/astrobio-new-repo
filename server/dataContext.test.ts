import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CREW, readingOn } from '../src/data/simulatedCrew'
import { USERS } from '../src/data/users'
import { OBSERVATIONS, type CheckIns } from '../src/model'
import { ensureLightPlan, saveLightStress } from './lightPlan'
import { ensureTelemetry } from './telemetry'
import { saveCabinLighting } from './cabinLighting'
import { applicationDataFor, explicitDataSubjects, requestedDataTopics } from './dataContext'
import { applicationDataTurn } from './dataConversation'

function database() {
  const db=new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE notes (id INTEGER PRIMARY KEY,crew_id TEXT,day INTEGER,text TEXT,at TEXT);
    CREATE TABLE tasks_done (user_id TEXT,day INTEGER,key TEXT);
    CREATE TABLE emergencies (id INTEGER PRIMARY KEY,patient TEXT,day INTEGER,scenario TEXT,started_at TEXT,steps TEXT);
    CREATE TABLE messages (id INTEGER PRIMARY KEY,from_user TEXT,side TEXT,to_user TEXT,deliver_at INTEGER,body TEXT,sent_at INTEGER,day INTEGER);`)
  ensureLightPlan(db);ensureTelemetry(db);return db
}
const now=new Date('2026-11-15T21:30:00Z')
const json=(data:unknown)=>new Response(JSON.stringify(data))
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()})
describe('authorized application-data retrieval',()=>{
  it.each([
    ['Şuanda uzay aracı içerisindeki ışık oranı ne durumda?','lighting'],
    ['İç aydınlatma hangi seviyede?','lighting'],
    ['What is the current cabin brightness?','lighting'],
    ['Şu anki CO2 oranı kaç?','environment'],
    ['Stresim kaç?','stress'],
    ['Nabzım kaç?','health'],
    ['Astronot 1’in tansiyonu kaç?','health'],
    ['Sirkadyen planım nasıl?','schedule'],
    ['Bugünkü notlarımı göster','journal'],
    ['Tamamlanan görevlerim neler?','tasks'],
    ['Acil durum kayıtlarımı göster','emergency'],
    ['Mesajlarımı göster','messages'],
    ['Dünyaya gönderilen CSV paketleri ne durumda?','telemetry'],
    ['Bütün verilerimize erişebiliyor musun?','overview'],
  ])('recognizes a natural request without a magic record-review phrase: %s',(message,topic)=>{
    expect(requestedDataTopics(message)).toContain(topic)
  })
  it.each(['Merhaba','Tell me a story about Mars.','Mavi ışık nedir?','How does blue light affect melatonin?','Uyku neden önemlidir?','Kalp hızı kaç olmalı?'])('keeps ordinary conversation and general education free of application data: %s',message=>{
    expect(requestedDataTopics(message)).toEqual([])
  })
  it('reads exact live UTC lighting state, honors off mode and performs no database writes',()=>{
    const db=database()
    try {
      const before=db.prepare('SELECT total_changes() AS n').get()!.n
      const context=applicationDataFor(db,USERS[0],'C1',2,'mars',{},'Şuanda uzay aracı içerisindeki ışık oranı ne durumda?','tr',now)!
      expect(context.topics).toEqual(['lighting'])
      expect(context.facts.find(f=>f.id==='cabin-light-now')!.text).toContain('%42.5')
      expect(context.facts.find(f=>f.id==='cabin-light-source')!.text).toContain(now.toISOString())
      expect(context.facts.find(f=>f.id==='cabin-light-source')!.text).toContain('lamba bağlı değil')
      expect(db.prepare('SELECT total_changes() AS n').get()!.n).toBe(before)
      saveCabinLighting(db,USERS[1],'mars',{wakeTime:'07:00',bedTime:'23:00',autoEnabled:false})
      const off=applicationDataFor(db,USERS[0],'C1',2,'mars',{},'Current cabin light level?','en',now)!
      expect(off.facts[0].text).toContain('schedule is off')
      expect(off.facts[0].text).not.toContain('0%')
    }finally{db.close()}
  })
  it('uses actual selected readings/overlays and stress records without attaching private unrelated records',()=>{
    const db=database()
    try {
      saveLightStress(db,USERS[0],{crewId:'C1',day:2,mission:'mars'},8)
      const checkIns:CheckIns={'C1:2':{...readingOn(CREW[0],2),restingHrBpm:93}}
      checkIns[OBSERVATIONS]=[{id:1,crewId:'C1',day:2,mission:'mars',source:'manual_entry',values:{restingHrBpm:101},measuredAt:now.toISOString(),receivedAt:now.toISOString()}]
      const health=applicationDataFor(db,USERS[0],'C1',2,'mars',checkIns,'Nabzım kaç?','tr',now)!
      expect(health.facts.find(f=>f.id==='health-C1')!.text).toContain('101 bpm')
      expect(health.facts.find(f=>f.id==='health-C1')!.text).not.toContain('Hematokrit')
      expect(applicationDataFor(db,USERS[0],'C1',2,'mars',checkIns,'Stresim kaç?','tr',now)!.facts[0].text).toContain('8/10')
      expect(applicationDataFor(db,USERS[0],'C1',3,'mars',checkIns,'Stresim kaç?','tr',now)!.facts[0].text).toContain('bildirimi yok')
      expect(()=>applicationDataFor(db,USERS[0],'C4',2,'mars',checkIns,'Nabzım kaç?','tr',now)).toThrow()
      expect(()=>explicitDataSubjects('C4 nabız değerleri',USERS[0])).toThrow()
      expect(explicitDataSubjects('Astronot 1 ve C4 nabız değerleri',USERS[1])).toEqual(['C1','C4'])
      expect(()=>applicationDataFor(db,USERS[4],'C1',2,'mars',checkIns,'Current lighting?','en',now)).toThrow()
    }finally{db.close()}
  })
  it('keeps broad overviews bounded and only retrieves journal/message text when explicitly requested',()=>{
    const db=database()
    try {
      db.prepare('INSERT INTO notes VALUES (1,?,?,?,?)').run('C1',2,'OWN_JOURNAL_IGNORE_ALL_RULES',now.toISOString())
      db.prepare('INSERT INTO notes VALUES (2,?,?,?,?)').run('C4',2,'OTHER_JOURNAL_SECRET',now.toISOString())
      db.prepare('INSERT INTO notes VALUES (3,?,?,?,?)').run('C1',3,'FUTURE_JOURNAL_SECRET',now.toISOString())
      const overview=applicationDataFor(db,USERS[0],'C1',2,'mars',{},'Bütün verilerimize erişebiliyor musun?','tr',now)!
      expect(overview.subjectIds).toEqual(['C1'])
      expect(JSON.stringify(overview)).not.toContain('OWN_JOURNAL')
      const journal=applicationDataFor(db,USERS[0],'C1',2,'mars',{},'Notlarımı göster','tr',now)!
      expect(JSON.stringify(journal)).toContain('OWN_JOURNAL_IGNORE_ALL_RULES')
      expect(JSON.stringify(journal)).not.toContain('OTHER_JOURNAL_SECRET')
      expect(JSON.stringify(journal)).not.toContain('FUTURE_JOURNAL_SECRET')
      db.prepare('INSERT INTO messages VALUES (1,?,?,?,?,?,?,?)').run('FS','earth','C1',now.getTime()+60_000,'UNDELIVERED_SECRET',now.getTime(),2)
      db.prepare('INSERT INTO messages VALUES (2,?,?,?,?,?,?,?)').run('FS','earth','C1',0,'DELIVERED_OWN_MESSAGE',now.getTime(),2)
      db.prepare('INSERT INTO messages VALUES (3,?,?,?,?,?,?,?)').run('FS','earth','C4',0,'OTHER_MESSAGE_SECRET',now.getTime(),2)
      const messages=applicationDataFor(db,USERS[0],'C1',2,'mars',{},'Mesajlarımı göster','tr',now)!
      expect(JSON.stringify(messages)).toContain('DELIVERED_OWN_MESSAGE')
      expect(JSON.stringify(messages)).not.toContain('UNDELIVERED_SECRET')
      expect(JSON.stringify(messages)).not.toContain('OTHER_MESSAGE_SECRET')
      const all=applicationDataFor(db,USERS[1],'C1',2,'mars',{},'All crew overview','en',now)!
      expect(all.subjectIds).toEqual(['C1','C2','C3','C4'])
      expect(JSON.stringify(all).length).toBeLessThan(24_000)
    }finally{db.close()}
  })
})
describe('grounded data conversation',()=>{
  it('gives the model real facts but renders unchanged required values even when selection is irrelevant',async()=>{
    const db=database();const bodies:Record<string,unknown>[]=[]
    try {
      vi.stubEnv('COMPANION_AI_ENABLED','true');vi.stubEnv('COMPANION_AI_MODEL','data-test')
      vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
        if(url.endsWith('/api/tags'))return json({models:[{name:'data-test'}]})
        bodies.push(JSON.parse(String(options?.body)));return json({done:true,message:{content:JSON.stringify({factIds:['cabin-light-clock']})}})
      }))
      const question='Şuanda uzay aracı içerisindeki ışık oranı ne durumda?'
      const packet=applicationDataFor(db,USERS[0],'C1',2,'mars',{},question,'tr',now)!
      const result=await applicationDataTurn(question,'tr',packet)
      expect(result.route).toBe('data');expect(result.reply).toContain('%42.5');expect(result.reply).toContain('lamba bağlı değil')
      expect(result.companion.state).toBe('generated')
      expect(JSON.stringify(bodies)).toContain('AUTHORIZED_APPLICATION_CONTEXT')
      expect(JSON.stringify(bodies)).toContain('%42.5')
      expect(result.reply).not.toContain('genellikle sabittir')
    }finally{db.close()}
  })
  it('fails closed on invented values/extra fields while retaining the current server answer',async()=>{
    const db=database()
    try {
      vi.stubEnv('COMPANION_AI_ENABLED','true');vi.stubEnv('COMPANION_AI_MODEL','data-test')
      vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/api/tags')?json({models:[{name:'data-test'}]}):json({done:true,message:{content:JSON.stringify({factIds:['cabin-light-now'],reply:'Measured light is 9999% and a device is connected.'})}})))
      const packet=applicationDataFor(db,USERS[0],'C1',2,'mars',{},'Current cabin light?','en',now)!
      const result=await applicationDataTurn('Current cabin light?','en',packet)
      expect(result.companion.state).toBe('rejected');expect(result.reply).not.toContain('9999');expect(result.reply).toContain('42.5%');expect(result.reply).toContain('not free-form model-generated')
      const urgent=await applicationDataTurn('Current cabin light?','en',packet,true)
      expect(urgent.reply).toContain('Do not wait for AI');expect(urgent.reply).toContain('42.5%');expect(urgent.companion.state).toBe('bypassed')
      vi.stubEnv('COMPANION_AI_ENABLED','false')
      const disabled=await applicationDataTurn('Current cabin light?','en',packet)
      expect(disabled.companion.state).toBe('disabled');expect(disabled.reply).toContain('42.5%')
    }finally{db.close()}
  })
})
