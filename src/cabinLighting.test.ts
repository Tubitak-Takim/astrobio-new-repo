import { describe, expect, it } from 'vitest'
import { cabinLightingAt, DEFAULT_CABIN_LIGHT, validCabinLightConfig } from './cabinLighting'
const at=(time:string)=>cabinLightingAt(DEFAULT_CABIN_LIGHT,new Date(`2026-11-15T${time}:00Z`))
describe('automatic ambient-light target (simulation)',()=>{
  it('ramps up warm-to-neutral, holds daytime, and dims before the protected night',()=>{
    expect(at('07:00')).toMatchObject({phase:'morning',targetBrightnessPct:5,targetColorTemperatureK:2200})
    expect(at('07:45').targetBrightnessPct).toBe(42.5)
    expect(at('08:30')).toMatchObject({phase:'daytime',targetBrightnessPct:80,targetColorTemperatureK:4500})
    expect(at('20:00').targetBrightnessPct).toBe(80)
    expect(at('21:30')).toMatchObject({phase:'evening',targetBrightnessPct:42.5})
    expect(at('23:00')).toMatchObject({phase:'night',targetBrightnessPct:5,targetColorTemperatureK:2200})
    expect(at('00:00').targetBrightnessPct).toBe(at('06:59').targetBrightnessPct)
  })
  it('has bounded continuous targets across midnight and never claims physical feedback',()=>{
    let prior=5
    for(let minute=0;minute<1440;minute++) {
      const state=cabinLightingAt(DEFAULT_CABIN_LIGHT,new Date(Date.UTC(2026,10,15,0,minute)))
      expect(state.targetBrightnessPct).toBeGreaterThanOrEqual(5)
      expect(state.targetBrightnessPct).toBeLessThanOrEqual(80)
      expect(Math.abs(state.targetBrightnessPct!-prior)).toBeLessThan(2)
      expect(state.commandSent).toBe(false);expect(state.deviceConnected).toBe(false);expect(state.measuredBrightnessPct).toBeNull()
      prior=state.targetBrightnessPct!
    }
  })
  it('supports shifted UTC schedules and an off state without pretending the cabin is dark',()=>{
    const config={wakeTime:'16:00',bedTime:'08:00',autoEnabled:true}
    expect(validCabinLightConfig(config)).toBe(true)
    expect(cabinLightingAt(config,new Date('2026-11-15T00:00:00Z')).phase).toBe('daytime')
    expect(cabinLightingAt({...config,autoEnabled:false})).toMatchObject({phase:'manual',targetBrightnessPct:null,targetColorTemperatureK:null,automatic:false})
    for(const patch of [{wakeTime:'24:00'},{bedTime:'16:00'},{autoEnabled:'true'},{dose:7}])expect(validCabinLightConfig({...config,...patch})).toBe(false)
  })
})
