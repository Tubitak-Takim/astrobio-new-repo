import type { DatabaseSync } from 'node:sqlite'
import type { MissionId } from '../src/data/missions.ts'
import type { User } from '../src/data/users.ts'
import { cabinLightingAt, DEFAULT_CABIN_LIGHT, validCabinLightConfig, type CabinLightConfig } from '../src/cabinLighting.ts'
import { RequestError } from './http.ts'
export function ensureCabinLighting(db:DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS cabin_light_config (mission TEXT PRIMARY KEY, config TEXT NOT NULL, updated_at TEXT NOT NULL, by_user TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cabin_light_events (id INTEGER PRIMARY KEY AUTOINCREMENT, mission TEXT NOT NULL, config TEXT NOT NULL, at TEXT NOT NULL, by_user TEXT NOT NULL);`)
}
export function cabinLightConfigFor(db:DatabaseSync,mission:MissionId) {
  const row=db.prepare('SELECT config,updated_at FROM cabin_light_config WHERE mission=?').get(mission)
  return {config:row?JSON.parse(String(row.config)) as CabinLightConfig:{...DEFAULT_CABIN_LIGHT},origin:row?'saved_cabin_config':'demo_default',updatedAt:row?String(row.updated_at):null}
}
export function cabinLightFor(db:DatabaseSync,mission:MissionId,now=new Date()) {
  const saved=cabinLightConfigFor(db,mission)
  return {...cabinLightingAt(saved.config,now),origin:saved.origin,updatedAt:saved.updatedAt,mission}
}
export function saveCabinLighting(db:DatabaseSync,user:User,mission:MissionId,config:unknown) {
  if(user.role!=='cmo')throw new RequestError(403,'Only the CMO may change the shared cabin schedule.')
  if(!validCabinLightConfig(config))throw new RequestError(400,'Use HH:MM UTC wake/bed times, a 7–10 hour sleep opportunity and boolean autoEnabled. No device/dose parameters are accepted.')
  const at=new Date().toISOString(),json=JSON.stringify(config)
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('INSERT INTO cabin_light_config (mission,config,updated_at,by_user) VALUES (?,?,?,?) ON CONFLICT(mission) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at,by_user=excluded.by_user').run(mission,json,at,user.id)
    const event=db.prepare('INSERT INTO cabin_light_events (mission,config,at,by_user) VALUES (?,?,?,?)').run(mission,json,at,user.id)
    db.exec('COMMIT');return {id:Number(event.lastInsertRowid),at}
  }catch(error){db.exec('ROLLBACK');throw error}
}
