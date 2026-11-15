import { describe, expect, it } from 'vitest'
import { CREW, readingOn } from './data/simulatedCrew'
import { CREW_PROFILES } from './data/crewProfiles'
import { SOURCES } from './data/sources'
import { validateReading } from './validate'
import { dataRelationships, generatedSeries, pearson } from './crewDataset'

describe('NASA-inspired synthetic cohort',()=>{
  it('generates reproducible, valid and different profiles across every mission/day',()=>{
    for(const mission of ['iss','moon','mars'] as const) for(const crew of CREW) for(let day=1;day<=90;day++) {
      const first=readingOn(crew,day,mission)
      expect(first).toEqual(readingOn(crew,day,mission))
      expect(validateReading(first).ok).toBe(true)
    }
    expect(new Set(CREW.map(c=>readingOn(c,60).restingHrBpm)).size).toBe(4)
    for(const p of Object.values(CREW_PROFILES)) for(const id of p.sourceIds) expect(SOURCES[id]).toBeDefined()
  })
  it('has coherent programmed within-person associations without implying clinical causation',()=>{
    for(const crew of CREW) {
      const relationships=dataRelationships(generatedSeries(crew,90,'mars',{},90))
      expect(relationships.find(r=>r.id==='sleep-heart')!.r).toBeLessThan(-.3)
      expect(relationships.find(r=>r.id==='sleep-mood')!.r).toBeGreaterThan(.5)
      expect(relationships.find(r=>r.id==='day-vitamin')!.r).toBeLessThan(-.5)
    }
    const sensitive=dataRelationships(generatedSeries(CREW[2],90,'mars',{},90))
    expect(sensitive.find(r=>r.id==='co2-headache')!.r).toBeGreaterThan(.7)
    expect(readingOn(CREW[2],80).spo2Pct).toBeGreaterThanOrEqual(96)
  })
  it('does not manufacture correlations for constant, short or invalid series',()=>{
    expect(pearson([1,2,3],[3,2,1])).toBeNull()
    expect(pearson(Array(10).fill(1),Array(10).fill(2))).toBeNull()
    expect(pearson([1,2,3,4,5,6,7,8],[2,4,6,8,10,12,14,16])).toBe(1)
    expect(pearson([1,2,3,4,5,6,7,8],[8,7,6,5,4,3,2,1])).toBe(-1)
    expect(pearson(Array(8).fill(NaN),Array(8).fill(2))).toBeNull()
  })
  it('uses manual overrides on their exact day, not as later simulated values',()=>{
    const points=generatedSeries(CREW[0],60,'mars',{'C1:59':{...readingOn(CREW[0],59),restingHrBpm:111}},3)
    expect(points.map(p=>p.day)).toEqual([58,59,60])
    expect(points[1].origin).toBe('manual_checkin')
    expect(points[1].reading.restingHrBpm).toBe(111)
    expect(points[2].origin).toBe('synthetic_dataset')
    expect(points[2].reading.restingHrBpm).not.toBe(111)
    expect(points[1].measurementDays.hematocritPct).toBe(59)
    expect(points[2].measurementDays.hematocritPct).toBe(31)
    expect(dataRelationships(points).every(r=>r.manualPoints===1)).toBe(true)
  })
})
