import { describe, expect, it } from 'vitest'
import { CREW } from './data/simulatedCrew'
import { getReading, OBSERVATIONS, type CheckIns } from './model'
import { defaultLightPreferences, lightReview, lightSchedule, validLightPreferences } from './lightPlan'

describe('circadian planning, not treatment control',()=>{
  it('has distinct default clock times and validates schedules without allowing dose parameters',()=>{
    expect(new Set(CREW.map(c=>defaultLightPreferences(c.id).wakeTime)).size).toBe(4)
    const prefs=defaultLightPreferences('C1')
    expect(validLightPreferences(prefs)).toBe(true)
    for(const patch of [{wakeTime:'25:00'},{bedTime:'22:5'},{bedTime:'06:30'},{autoReview:'true'},{irradiance:10},{redEnabled:true},{bedTime:'02:00'}]) expect(validLightPreferences({...prefs,...patch})).toBe(false)
    expect(validLightPreferences(null)).toBe(false)
    expect(validLightPreferences({wakeTime:'16:00',bedTime:'08:00',autoReview:true})).toBe(true)
  })
  it('builds bounded calendars with explicit overnight and shifted sleep periods',()=>{
    const plan=lightSchedule(60,defaultLightPreferences('C1'))
    expect(plan).toHaveLength(1)
    expect(plan[0].slots.find(s=>s.kind==='sleep')).toMatchObject({mode:'dark',start:{day:60,time:'22:30'},end:{day:61,time:'06:30'}})
    expect(plan[0].slots.find(s=>s.kind==='wind_down')).toMatchObject({mode:'warm',start:{day:60,time:'21:00'},end:{day:60,time:'22:30'}})
    expect(plan[0].slots.find(s=>s.kind==='red_review')!.description).toContain('no treatment')
    expect(lightSchedule(90,defaultLightPreferences('C1'))).toHaveLength(1)
    const shifted=lightSchedule(1,{wakeTime:'16:00',bedTime:'08:00',autoReview:true})
    expect(shifted[0].slots.find(s=>s.kind==='sleep')).toMatchObject({start:{day:2,time:'08:00'},end:{day:2,time:'16:00'}})
  })
  it('labels self-reported stress and fatigue proxies, not a measured stress diagnosis',()=>{
    const prefs=defaultLightPreferences('C1')
    expect(lightReview('C1',2,'mars',{},prefs,null).status).toBe('routine')
    const stress=lightReview('C1',2,'mars',{},prefs,{score:8,at:'2026-11-15T00:00:00Z'})
    expect(stress.status).toBe('review')
    expect(stress.measuredStressAvailable).toBe(false)
    expect(stress.reasons.join(' ')).toContain('not a stress diagnosis')
    const base=getReading({},CREW[0],2)
    const checkIns:CheckIns={'C1:2':{...base,sleepHours7d:5,moodAvg7d:2}}
    expect(lightReview('C1',2,'mars',checkIns,prefs,null).status).toBe('review')
    checkIns['C1:2'].moodAvg7d=4
    expect(lightReview('C1',2,'mars',checkIns,prefs,null).status).toBe('routine')
  })
  it('uses only the selected day/mission/person and never suppresses urgent or symptom cautions',()=>{
    const prefs=defaultLightPreferences('C1'),checkIns:CheckIns={}
    checkIns[OBSERVATIONS]=[{id:1,crewId:'C1',day:2,mission:'mars',source:'chat_self_report',measuredAt:'2026-11-15T00:00:00Z',receivedAt:'2026-11-15T00:00:00Z',values:{},symptoms:['fatigue']}]
    expect(lightReview('C1',2,'mars',checkIns,prefs,null).status).toBe('review')
    for(const [crewId,day,mission] of [['C4',2,'mars'],['C1',1,'mars'],['C1',2,'iss']] as const)expect(lightReview(crewId,day,mission,checkIns,defaultLightPreferences(crewId),null).status).toBe('routine')
    expect(lightReview('C1',2,'mars',checkIns,{...prefs,autoReview:false},{score:10,at:''}).status).toBe('disabled')
    checkIns[OBSERVATIONS][0].symptoms=['chest_pain']
    expect(lightReview('C1',2,'mars',checkIns,{...prefs,autoReview:false},null).status).toBe('urgent')
    checkIns[OBSERVATIONS][0].symptoms=[];checkIns[OBSERVATIONS][0].values={headache:true}
    expect(lightReview('C1',2,'mars',checkIns,{...prefs,autoReview:false},null).status).toBe('caution')
  })
})
