import { randomBytes } from 'node:crypto'
import { localAiConfig, readLocalJson } from './localAi.ts'
import { RequestError } from './http.ts'
import type { Language } from './conversation.ts'

export const MAX_VOICE_BYTES = 1_000_000
export const MAX_SPEECH_BYTES = 8 * 1024 * 1024

export function voiceConfig(env: NodeJS.ProcessEnv = process.env) {
  if (env.VOICE_ENABLED && !['true', 'false'].includes(env.VOICE_ENABLED)) throw new Error('Invalid voice enabled flag')
  const timeoutMs = Number(env.VOICE_TIMEOUT_MS || 60_000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) throw new Error('Invalid voice timeout')
  const origin = (value: string) => localAiConfig({ LOCAL_AI_URL: value }).baseUrl
  const identifier = (value: string) => {
    if (value && (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(value) || /cloud/i.test(value))) throw new Error('Invalid voice identifier')
    return value
  }
  return {
    enabled: env.VOICE_ENABLED === 'true', timeoutMs,
    sttUrl: origin(env.VOICE_STT_URL || 'http://127.0.0.1:8001'),
    ttsUrl: origin(env.VOICE_TTS_URL || 'http://127.0.0.1:8001'),
    sttModel: identifier(env.VOICE_STT_MODEL || ''), ttsModel: identifier(env.VOICE_TTS_MODEL || ''),
    voice: identifier(env.VOICE_TTS_VOICE || ''),
  }
}

export function voiceStatus() {
  try {
    const c = voiceConfig()
    return { enabled: c.enabled, sttConfigured: !!c.sttModel, ttsConfigured: !!(c.ttsModel && c.voice), verified: false, input: 'PCM16 mono WAV, 16000 Hz, max 30 seconds', confirmationRequired: true }
  } catch { return { enabled: false, state: 'invalid_configuration', verified: false, confirmationRequired: true } }
}

// Strict bounded PCM WAV validation. No compressed audio decoding in Node.
export function validateWav(data: Uint8Array, input = true) {
  const b = Buffer.from(data)
  if (b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.readUInt32LE(4) + 8 !== b.length) throw new RequestError(400, 'Invalid WAV container.')
  let offset = 12
  let sampleRate = 0
  let byteRate = 0
  let blockAlign = 0
  let audioBytes = -1
  let fmt = false
  while (offset + 8 <= b.length) {
    const name = b.toString('ascii', offset, offset + 4)
    const size = b.readUInt32LE(offset + 4)
    const start = offset + 8
    if (start + size > b.length) throw new RequestError(400, 'Invalid WAV chunk.')
    if (name === 'fmt ') {
      if (fmt || size < 16) throw new RequestError(400, 'Invalid WAV format.')
      fmt = true
      const channels = b.readUInt16LE(start + 2)
      sampleRate = b.readUInt32LE(start + 4)
      byteRate = b.readUInt32LE(start + 8)
      blockAlign = b.readUInt16LE(start + 12)
      if (b.readUInt16LE(start) !== 1 || b.readUInt16LE(start + 14) !== 16 || channels !== 1 || blockAlign !== 2 || byteRate !== sampleRate * 2 || (input ? sampleRate !== 16000 : sampleRate < 8000 || sampleRate > 48000)) throw new RequestError(400, 'Use mono PCM16 WAV; microphone input must be 16000 Hz.')
    }
    if (name === 'data') {
      if (audioBytes !== -1) throw new RequestError(400, 'Duplicate WAV data.')
      audioBytes = size
    }
    offset = start + size + size % 2
  }
  if (offset !== b.length || !fmt || audioBytes <= 0 || audioBytes % blockAlign || audioBytes / byteRate > (input ? 30 : 120)) throw new RequestError(400, 'Empty, malformed or overlong WAV.')
  return { durationSeconds: audioBytes / byteRate, sampleRate }
}

export class ReplyReceipts {
  private records = new Map<string, { user: string; text: string; expires: number; timer: NodeJS.Timeout }>()
  issue(user: string, text: string, now = Date.now()) {
    if (!text || text.length > 6000) throw new Error('Invalid reply length')
    this.prune(now)
    const owned = [...this.records].filter(([, entry]) => entry.user === user)
    if (owned.length >= 10) this.remove(owned[0][0])
    if (this.records.size >= 200) this.remove(this.records.keys().next().value!)
    const id = randomBytes(24).toString('hex')
    const timer = setTimeout(() => this.remove(id), 120_000)
    timer.unref()
    this.records.set(id, { user, text, expires: now + 120_000, timer })
    return id
  }
  get(user: string, id: string, now = Date.now()) {
    this.prune(now)
    const entry = this.records.get(id)
    return entry?.user === user ? entry.text : null
  }
  private remove(id: string) { const entry = this.records.get(id); if (entry) clearTimeout(entry.timer); this.records.delete(id) }
  private prune(now: number) { for (const [id, entry] of this.records) if (entry.expires <= now) this.remove(id) }
}

let speaking = false
async function speechOperation<T>(task: (config: ReturnType<typeof voiceConfig>) => Promise<T>) {
  let c
  try { c = voiceConfig() } catch { throw new RequestError(503, 'Invalid voice configuration.') }
  if (!c.enabled) throw new RequestError(503, 'Voice is disabled.')
  if (speaking) throw new RequestError(429, 'Speech service is busy.')
  speaking = true
  try { return await task(c) }
  catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(502, 'Local speech service unavailable or returned an invalid result.') }
  finally { speaking = false }
}

export async function transcribeVoice(wav: Buffer, language: Language) {
  validateWav(wav)
  return speechOperation(async (c) => {
    if (!c.sttModel) throw new RequestError(503, 'Configure a local STT model.')
    const form = new FormData()
    form.set('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'speech.wav')
    form.set('model', c.sttModel)
    form.set('language', language)
    form.set('response_format', 'json')
    const data = await readLocalJson(await fetch(`${c.sttUrl}/v1/audio/transcriptions`, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(c.timeoutMs) }), 16_384)
    if (typeof data.text !== 'string' || !data.text.trim() || data.text.length > 2000) throw new RequestError(502, 'No valid transcript was returned.')
    return { text: data.text.trim(), language, needsConfirmation: true, stored: false }
  })
}

export async function synthesizeVoice(text: string) {
  return speechOperation(async (c) => {
    if (!c.ttsModel || !c.voice) throw new RequestError(503, 'Configure a local TTS model and voice.')
    const response = await fetch(`${c.ttsUrl}/v1/audio/speech`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(c.timeoutMs),
      body: JSON.stringify({ model: c.ttsModel, input: text, voice: c.voice, response_format: 'wav' }),
    })
    if (!response.ok || !response.body || !(response.headers.get('content-type') ?? '').toLowerCase().startsWith('audio/wav')) throw new RequestError(502, 'Speech runtime must return WAV audio.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > MAX_SPEECH_BYTES) { await reader.cancel(); throw new RequestError(502, 'Speech output is too large.') }
        chunks.push(part.value)
      }
    } finally { reader.releaseLock() }
    const wav = Buffer.concat(chunks)
    try { validateWav(wav, false) } catch { throw new RequestError(502, 'Speech runtime returned an invalid WAV.') }
    return wav
  })
}
