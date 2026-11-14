import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, writeFile, readdir, rm, stat, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseEnv } from 'node:util'
import { checkLock, configuration, installedModel, normalizeDigest, parseLock, pullModel, saveSetup, smokeTest, updateEnv } from './local-ai-setup'

const digest = 'a'.repeat(64)
const lock = { schemaVersion: 1 as const, model: 'medgemma1.5:4b', digest }
const config = configuration('').config
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status })
const temporary: string[] = []
async function temp() {
  const root = await mkdtemp(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'astrobio-setup-test-'))
  temporary.push(root)
  return root
}
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const path of temporary.splice(0)) await rm(path, { recursive: true, force: true })
})

describe('setup configuration', () => {
  it('selects the agreed model only when no model is configured', () => {
    expect(configuration('').config.model).toBe('medgemma1.5:4b')
    expect(configuration('LOCAL_AI_MODEL=custom:4b').config.model).toBe('custom:4b')
    expect(configuration('LOCAL_AI_MODEL=custom:4b', 'chosen:4b').config.model).toBe('chosen:4b')
  })

  it('preserves unrelated values, comments and multiline secrets', () => {
    const source = '# keep me\nAPI_PORT=9999\nDB_FILE="data/custom.sqlite"\nGEMINI_API_KEY="example\nmultiline"\nLOCAL_AI_ENABLED=false\nLOCAL_AI_MODEL=\n'
    const result = configuration(source)
    const before = parseEnv(source)
    const after = parseEnv(result.envText)
    for (const key of ['API_PORT', 'DB_FILE', 'GEMINI_API_KEY']) expect(after[key]).toBe(before[key])
    expect(result.envText).toContain('# keep me')
    expect(after.LOCAL_AI_ENABLED).toBe('true')
  })

  it('is idempotent and handles CRLF and repeated target keys', () => {
    const source = 'API_PORT=8787\r\nLOCAL_AI_ENABLED=false\r\nLOCAL_AI_ENABLED=false\r\n'
    const first = configuration(source).envText
    expect(configuration(first).envText).toBe(first)
    expect(first.match(/LOCAL_AI_ENABLED=/g)).toHaveLength(1)
    expect(first).toContain('\r\n')
  })

  it('refuses to corrupt unusual multiline target values', () => {
    expect(() => updateEnv('LOCAL_AI_MODEL="old\nSECRET=kept"\nOTHER=value\n', { LOCAL_AI_MODEL: 'new' })).toThrow()
  })

  it('applies explicit LOCAL_AI environment overrides without copying other secrets', () => {
    const result = configuration('API_PORT=8787\n', undefined, { LOCAL_AI_MODEL: 'override:4b', GEMINI_API_KEY: 'do-not-copy' })
    expect(result.config.model).toBe('override:4b')
    expect(result.envText).not.toContain('do-not-copy')
  })
})

describe('model identity and local-only boundary', () => {
  it('normalizes digests and validates lock files', () => {
    expect(normalizeDigest(`sha256:${digest.toUpperCase()}`)).toBe(digest)
    expect(parseLock(JSON.stringify(lock))).toEqual(lock)
    expect(() => normalizeDigest('abc')).toThrow()
    expect(() => parseLock('{"schemaVersion":99}')).toThrow()
    expect(() => configuration('', 'model:cloud')).toThrow()
    expect(() => configuration('LOCAL_AI_URL=http://example.com')).toThrow()
  })

  it('requires an explicit update for an existing digest change', () => {
    const changed = { name: lock.model, digest: 'b'.repeat(64) }
    expect(() => checkLock(lock, changed, false)).toThrow()
    expect(checkLock(lock, changed, true).digest).toBe(changed.digest)
  })

  it('rejects remote aliases even when updating the lock', () => {
    expect(() => checkLock(null, { name: lock.model, digest, remote_host: 'https://ollama.com' }, true)).toThrow()
  })

  it('looks up installed models without pulling them', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ models: [{ name: lock.model, digest }] }))
    vi.stubGlobal('fetch', fetcher)
    expect((await installedModel(config))?.digest).toBe(digest)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/tags')
    expect(fetcher.mock.calls[0][1].redirect).toBe('error')
  })
})

describe('download and production smoke test', () => {
  it('streams download progress and requires a successful final event', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"total":100,"completed":50}\n{"status":"success"}\n'))
    vi.stubGlobal('fetch', fetcher)
    const progress = vi.fn()
    await pullModel(config, progress)
    expect(progress).toHaveBeenCalledWith(50)
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ model: config.model, stream: true })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"status":"pulling manifest"}\n')))
    await expect(pullModel(config, progress)).rejects.toThrow('tamamlanmadı')
  })

  it('fails downloads on upstream errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"no access"}\n')))
    await expect(pullModel(config, vi.fn())).rejects.toThrow('reddetti')
  })

  it('tests generation with synthetic data and reports GPU, mixed and CPU', async () => {
    for (const [size_vram, processor] of [[100, 'gpu'], [50, 'mixed'], [0, 'cpu']] as const) {
      const fetcher = vi.fn().mockResolvedValueOnce(json({ done: true, message: { content: 'OK' } })).mockResolvedValueOnce(json({ models: [{ name: config.model, size: 100, size_vram }] }))
      vi.stubGlobal('fetch', fetcher)
      expect((await smokeTest(config)).processor).toBe(processor)
      const body = JSON.parse(fetcher.mock.calls[0][1].body)
      expect(body.messages[0].content).toContain('not a medical question')
      expect(body.options.num_predict).toBe(16)
    }
  })

  it('does not declare readiness for failed or incomplete generation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ done: false, message: { content: 'partial' } })))
    await expect(smokeTest(config)).rejects.toThrow()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(smokeTest(config)).rejects.toThrow()
  })

  it('does not claim GPU support if loaded-model metadata is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ done: true, message: { content: 'OK' } })).mockResolvedValueOnce(json({ models: [] })))
    expect((await smokeTest(config)).processor).toBe('unknown')
  })
})

describe('safe configuration persistence', () => {
  it('creates initial settings and a reviewable model lock', async () => {
    const root = await temp()
    const env = configuration('').envText
    expect(await saveSetup(root, null, env, null, lock)).toBeNull()
    expect(await readFile(join(root, '.env'), 'utf8')).toBe(env)
    expect(parseLock(await readFile(join(root, 'local-ai/model-lock.json'), 'utf8'))).toEqual(lock)
    if (process.platform !== 'win32') expect((await stat(join(root, '.env'))).mode & 0o777).toBe(0o600)
  })

  it('backs up existing settings and avoids backups on identical reruns', async () => {
    const root = await temp()
    const before = '# private settings\nAPI_PORT=9999\nLOCAL_AI_ENABLED=false\n'
    await writeFile(join(root, '.env'), before)
    const after = configuration(before).envText
    const backup = await saveSetup(root, before, after, null, lock)
    expect(await readFile(backup!, 'utf8')).toBe(before)
    const lockText = await readFile(join(root, 'local-ai/model-lock.json'), 'utf8')
    expect(await saveSetup(root, after, after, lockText, lock)).toBeNull()
    expect((await readdir(root)).filter((name) => name.includes('setup-backup'))).toHaveLength(1)
  })

  it('refuses to overwrite concurrent changes', async () => {
    const root = await temp()
    await mkdir(join(root, 'local-ai'))
    await writeFile(join(root, '.env'), 'USER_CHANGE=yes\n')
    await expect(saveSetup(root, null, configuration('').envText, null, lock)).rejects.toThrow('değişti')
    expect(await readFile(join(root, '.env'), 'utf8')).toBe('USER_CHANGE=yes\n')
  })
})
