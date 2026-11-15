import { DatabaseSync } from 'node:sqlite'
import { expect, it } from 'vitest'
import { USERS } from '../src/data/users'
import { cabinLightFor, ensureCabinLighting, saveCabinLighting } from './cabinLighting'
it('restricts shared cabin edits to CMO and preserves mission-specific settings',()=>{
  const db=new DatabaseSync(':memory:');ensureCabinLighting(db)
  try {
    const config={wakeTime:'08:00',bedTime:'00:00',autoEnabled:true}
    expect(()=>saveCabinLighting(db,USERS[0],'mars',config)).toThrow()
    expect(()=>saveCabinLighting(db,USERS[4],'mars',config)).toThrow()
    saveCabinLighting(db,USERS[1],'mars',config);ensureCabinLighting(db)
    expect(cabinLightFor(db,'mars').config).toEqual(config)
    expect(cabinLightFor(db,'iss').config.wakeTime).toBe('07:00')
    expect(db.prepare('SELECT count(*) AS n FROM cabin_light_events').get()!.n).toBe(1)
  }finally{db.close()}
})
