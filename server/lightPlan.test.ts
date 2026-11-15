import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { USERS } from '../src/data/users'
import { defaultLightPreferences } from '../src/lightPlan'
import { ensureLightPlan, lightContext, lightPlanFor, saveLightAction, saveLightPreferences, saveLightStress } from './lightPlan'

describe('persisted authorized lighting plans',()=>{
  it('isolates roles/contexts and preserves saved preferences across idempotent initialization',()=>{
    const db=new DatabaseSync(':memory:');ensureLightPlan(db)
    try {
      const c=lightContext(USERS[0],{crewId:'C1',day:2,mission:'mars'})
      for(const [user,input] of [[USERS[0],{...c,crewId:'C4'}],[USERS[4],c],[USERS[0],{...c,day:91}],[USERS[0],{...c,mission:'leo'}],[USERS[1],{...c,crewId:'cabin'}]] as const)expect(()=>lightContext(user,input)).toThrow()
      expect(lightContext(USERS[1],{...c,crewId:'C4'}).crewId).toBe('C4')
      const prefs={wakeTime:'08:00',bedTime:'00:00',autoReview:false}
      saveLightPreferences(db,USERS[0],c,prefs);ensureLightPlan(db)
      expect(lightPlanFor(db,c,{}).preferences).toEqual(prefs)
      expect(lightPlanFor(db,{...c,mission:'iss'},{}).preferences).toEqual(defaultLightPreferences('C1'))
      expect(lightPlanFor(db,c,{}).deviceConnected).toBe(false)
      expect(lightPlanFor(db,c,{}).exposureAuthorized).toBe(false)
      expect(()=>saveLightPreferences(db,USERS[0],c,{...prefs,dose:10})).toThrow()
    }finally{db.close()}
  })
  it('persists review state transitions once, without turning requests into treatments',()=>{
    const db=new DatabaseSync(':memory:');ensureLightPlan(db)
    try {
      const c=lightContext(USERS[0],{crewId:'C1',day:2,mission:'mars'})
      saveLightStress(db,USERS[0],c,8)
      const first=lightPlanFor(db,c,{})
      expect(first.review.status).toBe('review')
      expect(first.events).toHaveLength(1)
      expect(lightPlanFor(db,c,{}).events).toHaveLength(1)
      expect(lightPlanFor(db,{...c,day:3},{}).review.metrics.selfReportedStress).toBeNull()
      saveLightStress(db,USERS[0],c,2)
      expect(lightPlanFor(db,c,{}).review.status).toBe('routine')
      expect(lightPlanFor(db,c,{}).events).toHaveLength(2)
      saveLightAction(db,USERS[0],c,'red_review','requested')
      expect(lightPlanFor(db,c,{}).exposureAuthorized).toBe(false)
      for(const action of ['started','approved','completed'])expect(()=>saveLightAction(db,USERS[1],c,'red_review',action)).toThrow()
      for(const score of [-1,11,7.5,'8',null])expect(()=>saveLightStress(db,USERS[0],c,score)).toThrow()
      expect(()=>saveLightStress(db,USERS[1],c,8)).toThrow()
    }finally{db.close()}
  })
})
