// Ambient dimmer targets for a demonstration, not measured lux, circadian dose,
// a medical treatment, or a substitute for task/emergency lighting.
import { validLightPreferences } from './lightPlan.ts'
export interface CabinLightConfig { wakeTime:string; bedTime:string; autoEnabled:boolean }
export const DEFAULT_CABIN_LIGHT:CabinLightConfig={wakeTime:'07:00',bedTime:'23:00',autoEnabled:true}
export function validCabinLightConfig(value:unknown):value is CabinLightConfig {
  if(!value || typeof value!=='object' || Array.isArray(value))return false
  const c=value as CabinLightConfig
  return Object.keys(c).every(k=>['wakeTime','bedTime','autoEnabled'].includes(k)) && typeof c.autoEnabled==='boolean' && validLightPreferences({wakeTime:c.wakeTime,bedTime:c.bedTime,autoReview:true})
}
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3))
const smooth=(x:number)=>x*x*(3-2*x)
export function cabinLightingAt(config:CabinLightConfig,now=new Date()) {
  const minute=now.getUTCHours()*60+now.getUTCMinutes()+now.getUTCSeconds()/60
  const elapsed=(minute-minutes(config.wakeTime)+1440)%1440
  const awake=(minutes(config.bedTime)-minutes(config.wakeTime)+1440)%1440
  let phase='night',label='Night · low warm light',brightness=5,kelvin=2200
  if(elapsed<90) {
    phase='morning';label='Morning · gradual wake-up'
    const p=smooth(elapsed/90);brightness=5+75*p;kelvin=2200+2300*p
  }else if(elapsed<awake-180) {
    phase='daytime';label='Daytime · steady task ambience';brightness=80;kelvin=4500
  }else if(elapsed<awake) {
    phase='evening';label='Evening · gradually dimming'
    const p=smooth((elapsed-awake+180)/180);brightness=80-75*p;kelvin=4500-2300*p
  }
  return {phase:config.autoEnabled?phase:'manual',label:config.autoEnabled?label:'Automatic schedule off',
    targetBrightnessPct:config.autoEnabled?Math.round(brightness*10)/10:null,targetColorTemperatureK:config.autoEnabled?Math.round(kelvin):null,
    referenceClock:'Earth UTC',referenceTime:now.toISOString(),config,automatic:config.autoEnabled,
    simulated:true,deviceConnected:false,commandSent:false,measuredBrightnessPct:null,
    summary:'Shared cabin ambient target; personal sleep quarters and safety/task lighting remain separate. Percent/K are illustrative control settings, not measured light or a circadian dose.'}
}
