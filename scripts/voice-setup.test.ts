import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { parseEnv } from 'node:util'
import { assertVoiceConsentMode, ensureVoicePython, installVoice, setupEnvironment, STT_REPO, TTS_REPO, TTS_FILE, validateVoiceManifest, voicePlan, type Command } from './voice-setup'

const digest = 'a'.repeat(64)
const manifest = () => ({ schemaVersion: 1,
  stt: { repo: STT_REPO, revision: 'b'.repeat(40), files: { 'config.json': digest, 'model.bin': digest, 'tokenizer.json': digest } },
  tts: { repo: TTS_REPO, revision: 'c'.repeat(40), files: { [TTS_FILE]: digest, [`${TTS_FILE}.json`]: digest } },
})
const dirs: string[] = []
async function fixture() {
  const root = await mkdtemp(join(existsSync('/tmp/opencode') ? '/tmp/opencode' : tmpdir(), 'astrobio-voice-setup-'))
  dirs.push(root)
  const before = '# keep\nAPI_PORT=9999\nGEMINI_API_KEY=example-only\nLOCAL_AI_MODEL=medical\nVOICE_ENABLED=false\n'
  await writeFile(join(root, '.env'), before)
  const plan = voicePlan(root, before)
  await mkdir(dirname(plan.python), { recursive: true })
  await writeFile(plan.python, 'fake executable; tests never run it')
  return { root, before, plan }
}
function fakeRun(): Command {
  return vi.fn(async (_exe, args) => {
    if (args[0] === '-c') return 'venv-ok'
    if (args[1] === 'download') return JSON.stringify(manifest())
    if (args[1] === 'smoke') return JSON.stringify({ ok: true })
    return ''
  })
}
afterEach(async () => { for (const path of dirs.splice(0)) await rm(path, { recursive: true, force: true }) })

describe('voice setup planning', () => {
  it('requires explicit voice-license approval in non-interactive automation', () => {
    expect(() => assertVoiceConsentMode(false, false)).toThrow('--accept-voice-license')
    expect(() => assertVoiceConsentMode(true, false)).not.toThrow()
    expect(() => assertVoiceConsentMode(false, true)).not.toThrow()
  })
  it('prepares managed CPU voice paths while preserving unrelated settings', async () => {
    const { root, before, plan } = await fixture()
    expect(plan.managedStt && plan.managedTts).toBe(true)
    const values = parseEnv(plan.envText)
    expect(values.VOICE_ENABLED).toBe('true')
    expect(values.API_PORT).toBe('9999')
    expect(values.LOCAL_AI_MODEL).toBe('medical')
    expect(await readFile(join(root, '.env'), 'utf8')).toBe(before)
  })
  it('respects custom files, aliases and interpreter paths', async () => {
    const { root } = await fixture()
    const plan = voicePlan(root, 'STT_MODEL_DIR=custom/stt\nTTS_MODEL_PATH=custom/voice.onnx\nVOICE_PYTHON=custom/venv/python\nVOICE_TTS_VOICE=chosen\n')
    expect(plan.managedStt || plan.managedTts).toBe(false)
    expect(plan.customPython).toBe(true)
    expect(plan.values.VOICE_TTS_VOICE).toBe('chosen')
  })
  it('refuses custom remote URLs, embedded credentials and invalid aliases', async () => {
    const { root } = await fixture()
    for (const value of ['https://example.com', 'http://u:p@127.0.0.1:8001', 'http://127.0.0.1:8001/other']) expect(() => voicePlan(root, `VOICE_STT_URL=${value}`)).toThrow()
    expect(() => voicePlan(root, 'VOICE_TTS_VOICE=model:cloud')).toThrow()
    expect(() => voicePlan(root, 'VOICE_PORT=0')).toThrow()
  })
  it('does not pass application keys or HF tokens to installers', () => {
    const env = setupEnvironment({ PATH: '/bin', GEMINI_API_KEY: 'private', HF_TOKEN: 'private', LOCAL_AI_MODEL: 'private' })
    expect(env.PATH).toBe('/bin')
    expect(env.GEMINI_API_KEY).toBeUndefined()
    expect(env.HF_TOKEN).toBeUndefined()
    expect(env.HF_HUB_DISABLE_IMPLICIT_TOKEN).toBe('1')
  })
})

describe('voice Python provisioning', () => {
  it('does not create or alter an existing verified venv', async () => {
    const { plan } = await fixture()
    const run = vi.fn<Command>().mockResolvedValue('venv-ok')
    await ensureVoicePython(plan, run)
    expect(run).toHaveBeenCalledTimes(1)
  })
  it('fails rather than installing into a missing custom/system interpreter', async () => {
    const { root } = await fixture()
    const plan = voicePlan(root, 'VOICE_PYTHON=custom/missing/python')
    const run = vi.fn<Command>()
    await expect(ensureVoicePython(plan, run)).rejects.toThrow('bulunamadı')
    expect(run).not.toHaveBeenCalled()
  })
  it('provisions a seeded venv through existing uv when Python 3.11/3.12 is unavailable', async () => {
    const { root } = await fixture()
    const plan = voicePlan(join(root, 'new-project'), '')
    const run = vi.fn<Command>(async (exe, args) => {
      if (exe === plan.python) return 'venv-ok'
      if (exe === 'uv') return ''
      if (args.includes('-c')) return '3.14'
      throw new Error('unavailable')
    })
    await ensureVoicePython(plan, run, 'linux')
    expect(run).toHaveBeenCalledWith('uv', ['venv', '--seed', '--python', '3.11', plan.defaultVenv])
  })
})

describe('voice installer safeguards', () => {
  it('validates checksums and prevents traversal/incomplete manifests', () => {
    expect(validateVoiceManifest(manifest()).schemaVersion).toBe(1)
    const bad = { ...manifest(), stt: { ...manifest().stt, files: { '../other': digest } } }
    expect(() => validateVoiceManifest(bad)).toThrow()
    expect(() => validateVoiceManifest({ schemaVersion: 1, stt: {}, tts: {} })).toThrow()
  })
  it('writes voice settings only after both asset and smoke stages succeed', async () => {
    const { root, before, plan } = await fixture()
    await mkdir(join(root, 'local-ai'))
    await writeFile(join(root, 'local-ai/model-lock.json'), 'existing medical lock')
    const run = vi.mocked(fakeRun())
    const { backup } = await installVoice(root, before, plan, false, run)
    expect(await readFile(backup!, 'utf8')).toBe(before)
    expect(parseEnv(await readFile(join(root, '.env'), 'utf8')).VOICE_ENABLED).toBe('true')
    expect(await readFile(join(root, 'local-ai/model-lock.json'), 'utf8')).toBe('existing medical lock')
    expect(JSON.parse(await readFile(join(root, 'local-ai/voice-model-lock.json'), 'utf8'))).toEqual(manifest())
    const pip = run.mock.calls.find(([, args]) => args.includes('pip'))!
    expect(pip[0]).toBe(plan.python)
  })
  it('does not enable voice after a failed download or smoke test', async () => {
    for (const failure of ['download', 'smoke']) {
      const { root, before, plan } = await fixture()
      const good = fakeRun()
      const run: Command = async (exe, args, input, capture) => {
        if (args[1] === failure) throw new Error('simulated failure')
        return good(exe, args, input, capture)
      }
      await expect(installVoice(root, before, plan, false, run)).rejects.toThrow()
      expect(await readFile(join(root, '.env'), 'utf8')).toBe(before)
      expect(existsSync(join(root, 'local-ai/voice-model-lock.json'))).toBe(false)
    }
  })
  it('refuses to overwrite concurrent settings changes', async () => {
    const { root, before, plan } = await fixture()
    const good = fakeRun()
    const run: Command = async (exe, args, input, capture) => {
      if (args[1] === 'smoke') await writeFile(join(root, '.env'), 'USER_CHANGE=true\n')
      return good(exe, args, input, capture)
    }
    await expect(installVoice(root, before, plan, false, run)).rejects.toThrow('değişti')
    expect(await readFile(join(root, '.env'), 'utf8')).toBe('USER_CHANGE=true\n')
  })
})
