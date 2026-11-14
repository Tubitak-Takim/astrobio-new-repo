// Astrobio HTTP backend privacy policy.
import { canSee, type User } from './data/users.ts'

export const MESSAGE_MAX_CHARS = 4000
export const REPORT_MAX_CHARS = 16_000

export function canReadMessage(user: User, message: {
  from_user: unknown
  side: unknown
  to_user?: unknown
  deliver_at: unknown
}, now: number): boolean {
  const earth = user.role === 'surgeon'
  if (message.side !== (earth ? 'earth' : 'ship') && Number(message.deliver_at) > now) return false
  if (earth || user.role === 'cmo') return true
  // Legacy Earth replies without a recipient are CMO-only, never broadcast.
  return message.side === 'ship' ? message.from_user === user.id : message.to_user === user.id
}

export function canReadEmergency(user: User, record: { patient: unknown; by_user: unknown }): boolean {
  return canSee(user, String(record.patient)) || record.by_user === user.id
}

export function canReadEvent(user: User, event: { kind: unknown; crew_id: unknown }): boolean {
  // Old emergency events have no patient id; hide those except from the CMO.
  if (event.crew_id === null) return event.kind !== 'emergency' || user.role === 'cmo'
  return canSee(user, String(event.crew_id))
}
