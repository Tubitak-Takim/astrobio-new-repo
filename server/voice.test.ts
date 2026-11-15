import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReplyReceipts, synthesizeVoice, transcribeVoice, validateWav, voiceConfig, voiceStatus } from './voice'

export function testWav(rate = 16000, seconds = 0.1) {
  const bytes = Math.floor(rate * seconds) * 2
  const b = Buffer.alloc(44 + bytes)
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8)
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(bytes, 40)
  return b
}
function enable() {
  for (const [key, value] of Object.entries({ VOICE_ENABLED: 'true', VOICE_STT_URL: 'http://127.0.0.1:8001', VOICE_TTS_URL: 'http://127.0.0.1:8001', VOICE_STT_MODEL: 'local-whisper', VOICE_TTS_MODEL: 'local-piper', VOICE_TTS_VOICE: 'selected-voice', VOICE_TIMEOUT_MS: '1000' })) vi.stubEnv(key, value)
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('voice boundaries', () => {
  it('accepts bounded input WAV and rejects invalid codecs/rates/durations', () => {
    expect(validateWav(testWav()).sampleRate).toBe(16000)
    expect(() => validateWav(testWav(24000))).toThrow()
    expect(() => validateWav(testWav(16000, 31))).toThrow()
    expect(() => validateWav(Buffer.from('not a wave'))).toThrow()
    const bad = testWav(); bad.writeUInt16LE(2, 22)
    expect(() => validateWav(bad)).toThrow()
    expect(validateWav(testWav(24000), false).sampleRate).toBe(24000)
  })
  it('is disabled by default and refuses remote URLs', () => {
    expect(voiceConfig({}).enabled).toBe(false)
    expect(() => voiceConfig({ VOICE_STT_URL: 'https://external.example' })).toThrow()
    expect(() => voiceConfig({ VOICE_TTS_URL: 'http://localhost:8001' })).toThrow()
  })
  it('reports configuration rather than claiming speech is verified', () => {
    enable()
    expect(voiceStatus()).toMatchObject({ enabled: true, verified: false, confirmationRequired: true })
  })
  it('requires transcript confirmation without invoking chat', async () => {
    enable()
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Merhaba' })))
    vi.stubGlobal('fetch', fetcher)
    expect(await transcribeVoice(testWav(), 'tr')).toMatchObject({ text: 'Merhaba', needsConfirmation: true, stored: false })
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toContain('/v1/audio/transcriptions')
    expect(fetcher.mock.calls[0][1].body).toBeInstanceOf(FormData)
  })
  it('validates TTS WAV output and never follows redirects', async () => {
    enable()
    const fetcher = vi.fn().mockResolvedValue(new Response(testWav(24000), { headers: { 'Content-Type': 'audio/wav' } }))
    vi.stubGlobal('fetch', fetcher)
    expect(await synthesizeVoice('AI assistant.')).toBeInstanceOf(Buffer)
    expect(fetcher.mock.calls[0][1].redirect).toBe('error')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid', { headers: { 'Content-Type': 'audio/wav' } })))
    await expect(synthesizeVoice('AI assistant.')).rejects.toMatchObject({ status: 502 })
  })
  it('rejects disabled or unavailable speech without a cloud fallback', async () => {
    enable()
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    vi.stubEnv('VOICE_ENABLED', 'false')
    await expect(transcribeVoice(testWav(), 'tr')).rejects.toMatchObject({ status: 503 })
    expect(fetcher).not.toHaveBeenCalled()
    vi.stubEnv('VOICE_ENABLED', 'true')
    await expect(transcribeVoice(testWav(), 'tr')).rejects.toMatchObject({ status: 502 })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('keeps temporary speech receipts private, bounded and short-lived', () => {
    const receipts = new ReplyReceipts()
    const id = receipts.issue('C1', 'Original server reply', 1000)
    expect(receipts.get('C4', id, 1001)).toBeNull()
    expect(receipts.get('C1', id, 1001)).toBe('Original server reply')
    expect(receipts.get('C1', id, 121000)).toBeNull()
    const first = receipts.issue('C1', 'First', 200000)
    for (let i = 0; i < 10; i++) receipts.issue('C1', 'Next', 200000)
    expect(receipts.get('C1', first, 200001)).toBeNull()
  })
})
