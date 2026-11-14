import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Finding } from '../src/triage'
import type { Provenance } from '../src/model'
import { explainLocally, localAiConfig, localAiStatus } from './localAi'

const finding: Finding = { id: 'vitals', title: 'Oxygen', level: 'amber', measured: 'SpO2 92%', why: 'Outside the usual range.', next: 'Re-measure at rest.', sourceIds: ['VITALS'] }
const provenance: Provenance = { source: 'Crew check-in', measuredDay: 60, ageDays: 0, stale: false, nextDue: null, auto: false }
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const inventory = () => json({ models: [{ name: 'test-medgemma:latest' }] })
function enable() {
  vi.stubEnv('LOCAL_AI_ENABLED', 'true')
  vi.stubEnv('LOCAL_AI_URL', 'http://127.0.0.1:11434')
  vi.stubEnv('LOCAL_AI_MODEL', 'test-medgemma')
  vi.stubEnv('LOCAL_AI_TIMEOUT_MS', '1000')
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('local AI configuration', () => {
  it('defaults to disabled without selecting a substitute model', () => {
    expect(localAiConfig({})).toEqual({ enabled: false, model: '', baseUrl: 'http://127.0.0.1:11434', timeoutMs: 90_000 })
  })

  it('refuses non-loopback URLs, credentials, paths, cloud aliases and invalid timeouts', () => {
    for (const url of ['https://example.com', 'http://localhost:11434', 'http://192.168.1.2:11434', 'http://u:p@127.0.0.1:11434', 'http://127.0.0.1/api', 'http://127.0.0.1/?x=1']) {
      expect(() => localAiConfig({ LOCAL_AI_URL: url })).toThrow()
    }
    expect(() => localAiConfig({ LOCAL_AI_MODEL: 'model:cloud' })).toThrow()
    expect(() => localAiConfig({ LOCAL_AI_TIMEOUT_MS: '0' })).toThrow()
    expect(() => localAiConfig({ LOCAL_AI_ENABLED: 'yes' })).toThrow()
  })
})

describe('local AI availability', () => {
  it('never calls the runtime when disabled or unconfigured', async () => {
    enable()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    vi.stubEnv('LOCAL_AI_ENABLED', 'false')
    expect((await localAiStatus()).state).toBe('disabled')
    expect((await explainLocally(finding, provenance, 'en')).state).toBe('disabled')
    vi.stubEnv('LOCAL_AI_ENABLED', 'true')
    vi.stubEnv('LOCAL_AI_MODEL', '')
    expect((await localAiStatus()).state).toBe('not_configured')
    expect((await explainLocally(finding, provenance, 'en')).state).toBe('not_configured')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('reports an invalid configuration without a request', async () => {
    enable()
    vi.stubEnv('LOCAL_AI_URL', 'http://example.com')
    expect((await localAiStatus()).state).toBe('invalid_configuration')
  })

  it('reports missing models without pulling them', async () => {
    enable()
    const fetcher = vi.fn().mockResolvedValue(json({ models: [] }))
    vi.stubGlobal('fetch', fetcher)
    expect((await explainLocally(finding, provenance, 'en')).state).toBe('model_missing')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/tags')
  })

  it('rejects cloud-backed entries even under an innocent local alias', async () => {
    enable()
    const fetcher = vi.fn().mockResolvedValue(json({ models: [{ name: 'test-medgemma:latest', remote_host: 'https://ollama.com' }] }))
    vi.stubGlobal('fetch', fetcher)
    expect((await explainLocally(finding, provenance, 'en')).state).toBe('remote_model_rejected')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('falls back to the original when the runtime is unreachable', async () => {
    enable()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const result = await explainLocally(finding, provenance, 'en')
    expect(result.state).toBe('unavailable')
    expect(result.generated).toBeNull()
    expect(result.original.finding).toEqual(finding)
  })
})

describe('local explanation boundary', () => {
  it('sends bounded text-only requests and retains the original', async () => {
    enable()
    const fetcher = vi.fn().mockResolvedValueOnce(inventory()).mockResolvedValueOnce(json({ done: true, message: { content: 'SpO2 92%. Re-measure at rest.' } }))
    vi.stubGlobal('fetch', fetcher)
    const result = await explainLocally(finding, provenance, 'tr')
    expect(result.state).toBe('generated')
    expect(result.experimental).toBe(true)
    expect(result.original.finding).toEqual(finding)
    const [url, options] = fetcher.mock.calls[1]
    expect(url).toBe('http://127.0.0.1:11434/api/chat')
    expect(options.redirect).toBe('error')
    const body = JSON.parse(options.body)
    expect(body.stream).toBe(false)
    expect(body.options).toEqual({ temperature: 0, num_ctx: 4096, num_predict: 256 })
    expect(body.messages[1].content).toContain('Turkish')
    expect(body.messages[1].content).not.toContain('attachment')
  })

  it('does not call the model for urgent or stale readings', async () => {
    enable()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    expect((await explainLocally({ ...finding, level: 'red' }, provenance, 'en')).state).toBe('urgent')
    expect((await explainLocally(finding, { ...provenance, stale: true }, 'en')).state).toBe('stale')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects new numbers in generated output', async () => {
    enable()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(inventory()).mockResolvedValueOnce(json({ done: true, message: { content: 'Take 987654 mg.' } })))
    const result = await explainLocally(finding, provenance, 'en')
    expect(result.state).toBe('rejected')
    expect(result.generated).toBeNull()
  })

  it('rejects partial or empty outputs', async () => {
    enable()
    for (const data of [{ done: false, message: { content: 'Partial' } }, { done: true, message: { content: '' } }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(inventory()).mockResolvedValueOnce(json(data)))
      expect((await explainLocally(finding, provenance, 'en')).state).toBe('rejected')
    }
  })

  it('limits output response bytes', async () => {
    enable()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(inventory()).mockResolvedValueOnce(json({ done: true, message: { content: 'a'.repeat(40_000) } })))
    expect((await explainLocally(finding, provenance, 'en')).generated).toBeNull()
  })

  it('returns timeout without a cloud fallback', async () => {
    enable()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(AbortSignal.abort())
    const fetcher = vi.fn().mockRejectedValue(new Error('aborted'))
    vi.stubGlobal('fetch', fetcher)
    expect((await explainLocally(finding, provenance, 'en')).state).toBe('timeout')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('allows only one in-flight generation per API process', async () => {
    enable()
    let release!: (response: Response) => void
    const pending = new Promise<Response>((resolve) => { release = resolve })
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(json({ done: true, message: { content: 'Re-measure at rest.' } })))
    const first = explainLocally(finding, provenance, 'en')
    expect((await explainLocally(finding, provenance, 'en')).state).toBe('busy')
    release(inventory())
    expect((await first).state).toBe('generated')
  })
})
