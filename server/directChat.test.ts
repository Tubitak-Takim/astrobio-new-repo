import { afterEach, describe, expect, it, vi } from 'vitest'
import { directChat } from './directChat'
import { localAiConfig } from './localAi'

const config = localAiConfig({ LOCAL_AI_ENABLED: 'true', LOCAL_AI_MODEL: 'qwen3:1.7b', LOCAL_AI_TIMEOUT_MS: '1000' })
const json = (data: unknown) => new Response(JSON.stringify(data))
afterEach(() => vi.unstubAllGlobals())
describe('direct local chat', () => {
  it.each([
    { done: true, message: { content: '' } },
    { done: false, message: { content: 'Truncated' } },
    { done: true, message: { content: '<think>Internal reasoning</think> Hello' } },
    { done: true, message: { content: 'x'.repeat(5201) } },
  ])('rejects empty, incomplete, reasoning-tagged and oversized content', async data => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/api/tags') ? json({ models: [{ name: config.model }] }) : json(data)))
    expect(await directChat(config, 'Hello', 'Be helpful.')).toMatchObject({ state: 'rejected', value: null })
  })
  it('rejects remote models and releases the shared inference slot after a failure', async () => {
    const fetcher = vi.fn(async () => json({ models: [{ name: config.model, remote_host: 'https://example.com' }] }))
    vi.stubGlobal('fetch', fetcher)
    expect((await directChat(config, 'Hello', 'Be helpful.')).state).toBe('remote_model_rejected')
    fetcher.mockRejectedValue(new Error('Offline'))
    expect((await directChat(config, 'Hello', 'Be helpful.')).state).toBe('unavailable')
    expect((await directChat(config, 'Hello', 'Be helpful.')).state).toBe('unavailable')
  })
  it('does not fetch or select substitute models when disabled or unconfigured', async () => {
    const fetcher=vi.fn(); vi.stubGlobal('fetch',fetcher)
    expect((await directChat({ ...config, enabled: false }, 'Hi','Hello')).state).toBe('disabled')
    expect((await directChat({ ...config, model: '' }, 'Hi','Hello')).state).toBe('not_configured')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('shares the single inference slot and releases it after completion', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release=resolve })
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/api/tags')) { await gate; return json({models:[{name:config.model}]}) }
      return json({done:true,message:{content:'Hello from Qwen3.'}})
    }))
    const first=directChat(config,'Hello','Be helpful.')
    expect((await directChat(config,'Another message','Be helpful.')).state).toBe('busy')
    release()
    expect((await first).state).toBe('generated')
    expect((await directChat(config,'Try again','Be helpful.')).state).toBe('generated')
  })
})
