import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, lstat, mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { atomicWrite, optionalFile, updateEnv } from './local-ai-setup.ts'
import { localAiConfig } from '../server/localAi.ts'
import { voiceConfig } from '../server/voice.ts'

export const STT_REPO = 'Systran/faster-whisper-small'
export const TTS_REPO = 'rhasspy/piper-voices'
export const TTS_VOICE = 'tr_TR-dfki-medium'
export const VOICE_CARD = 'https://huggingface.co/rhasspy/piper-voices/blob/main/tr/tr_TR/dfki/medium/MODEL_CARD'
export const TTS_FILE = `tr/tr_TR/dfki/medium/${TTS_VOICE}.onnx`
export type Command = (executable: string, args: string[], input?: string, capture?: boolean) => Promise<string>

export function assertVoiceConsentMode(accepted: boolean, interactive: boolean) {
  if (!accepted && !interactive) throw new Error('Ses lisansı için ayrı onay gerekiyor. Koşulları incelediyseniz --accept-voice-license kullanın veya --skip-voice ile atlayın.')
}

export function validateVoiceManifest(value: unknown) {
  if (!value || typeof value !== 'object' || (value as Record<string, unknown>).schemaVersion !== 1) throw new Error('Ses manifest şeması geçersiz.')
  const manifest = value as { schemaVersion: number; stt: Record<string, unknown>; tts: Record<string, unknown> }
  for (const [entry, repo] of [[manifest.stt, STT_REPO], [manifest.tts, TTS_REPO]] as const) {
    if (!entry || typeof entry !== 'object' || !entry.files || typeof entry.files !== 'object' || Array.isArray(entry.files)) throw new Error('Ses manifest dosyaları geçersiz.')
    if (entry.repo !== null && entry.repo !== repo) throw new Error('Ses manifest kaynağı geçersiz.')
    if (entry.repo === null && entry.revision !== null) throw new Error('Yerel ses manifesti uzak revizyon iddia edemez.')
    if (entry.repo !== null && !/^[a-f0-9]{40}$/.test(String(entry.revision))) throw new Error('Ses manifest revizyonu geçersiz.')
    const files = Object.entries(entry.files)
    if (!files.length || files.length > 32) throw new Error('Ses manifest dosya sayısı geçersiz.')
    for (const [name, digest] of files) if (name.startsWith('/') || name.split('/').includes('..') || !/^[A-Za-z0-9._/-]{1,200}$/.test(name) || !/^[a-f0-9]{64}$/.test(String(digest))) throw new Error('Ses manifest yolu/digest geçersiz.')
  }
  const stt = manifest.stt.files as Record<string, string>
  if (!['config.json', 'model.bin', 'tokenizer.json'].every((name) => Object.hasOwn(stt, name))) throw new Error('STT manifesti eksik.')
  const tts = manifest.tts.files as Record<string, string>
  if (!Object.keys(tts).some((name) => name.endsWith('.onnx') && Object.hasOwn(tts, `${name}.json`))) throw new Error('TTS manifesti eksik.')
  return manifest
}

// Do not forward medical data, unrelated API keys or Hugging Face tokens into
// package/model installers. Public repositories are used without authentication.
export function setupEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const env: NodeJS.ProcessEnv = { HF_HUB_DISABLE_IMPLICIT_TOKEN: '1', HF_HUB_OFFLINE: '0', PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'HTTPS_PROXY', 'UV_CACHE_DIR']) if (source[key]) env[key] = source[key]
  return env
}

export const runSetupCommand: Command = (executable, args, input, capture = false) => new Promise((resolveCommand, reject) => {
  const child = spawn(executable, args, { shell: false, env: setupEnvironment(), stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', 'inherit'] })
  let output = ''
  let tooLarge = false
  const timeout = setTimeout(() => child.kill(), 30 * 60 * 1000)
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
    if (output.length > 512_000) { tooLarge = true; child.kill() }
  })
  child.on('error', (error) => { clearTimeout(timeout); reject(error) })
  child.on('close', (code) => {
    clearTimeout(timeout)
    if (code !== 0 || tooLarge) reject(new Error('Ses kurulum alt işlemi başarısız oldu. Yukarıdaki hatayı kontrol edip yeniden deneyin; mevcut ayarlar korunur.'))
    else resolveCommand(output.trim())
  })
  child.stdin?.on('error', () => {})
  if (input !== undefined) child.stdin?.end(input)
})

export function voicePlan(root: string, text: string, platform = process.platform) {
  const values = parseEnv(text)
  const absolute = (path: string) => isAbsolute(path) ? path : resolve(root, path)
  const managedStt = join(root, 'tools', 'voice', 'models', 'whisper-small')
  const managedTts = join(root, 'tools', 'voice', 'models', 'piper', ...TTS_FILE.split('/'))
  const sttPath = absolute(values.STT_MODEL_DIR || managedStt)
  const ttsPath = absolute(values.TTS_MODEL_PATH || managedTts)
  const defaultVenv = join(root, 'tools', 'voice', '.venv')
  const configuredPython = values.VOICE_PYTHON
  // Treat the sample's "python3" as a bootstrap placeholder, not a request to
  // install packages into the system interpreter.
  const python = configuredPython && !['python', 'python3'].includes(configuredPython)
    ? absolute(configuredPython) : join(defaultVenv, platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'python.exe' : 'python')
  const port = Number(values.VOICE_PORT || 8001)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VOICE_PORT geçersiz.')
  const expectedUrl = `http://127.0.0.1:${port}`
  for (const key of ['VOICE_STT_URL', 'VOICE_TTS_URL']) {
    if (values[key] && localAiConfig({ LOCAL_AI_URL: values[key] }).baseUrl !== expectedUrl) throw new Error('Özel ses servisi URL ayarınız var. Yerleşik servis kurulumu için VOICE_STT_URL/VOICE_TTS_URL ile VOICE_PORT değerlerini bilinçli olarak eşleştirin; üzerine yazılmadı.')
  }
  const fields = {
    VOICE_ENABLED: 'true', VOICE_PYTHON: python,
    STT_MODEL_DIR: sttPath, TTS_MODEL_PATH: ttsPath,
    VOICE_PORT: String(port), VOICE_STT_URL: expectedUrl, VOICE_TTS_URL: expectedUrl,
    VOICE_STT_MODEL: values.VOICE_STT_MODEL || 'local-whisper',
    VOICE_TTS_MODEL: values.VOICE_TTS_MODEL || 'local-piper',
    VOICE_TTS_VOICE: values.VOICE_TTS_VOICE || TTS_VOICE,
    VOICE_TIMEOUT_MS: values.VOICE_TIMEOUT_MS || '60000',
  }
  // updateEnv expects decoded values; reject newline/quote ambiguity in paths
  // rather than writing ambiguous dotenv files. Spaces are supported by Node.
  const decoded = { ...fields, VOICE_PYTHON: python, STT_MODEL_DIR: sttPath, TTS_MODEL_PATH: ttsPath }
  voiceConfig(decoded)
  for (const path of [python, sttPath, ttsPath]) if (/[\r\n#"']/.test(path)) throw new Error('Model/Python yolu dotenv için güvenli değil; daha basit bir yerel yol seçin.')
  const envText = updateEnv(text, decoded)
  return { python, defaultVenv, customPython: python !== join(defaultVenv, platform === 'win32' ? 'Scripts' : 'bin', platform === 'win32' ? 'python.exe' : 'python'), sttPath, ttsPath, managedStt: sttPath === managedStt, managedTts: ttsPath === managedTts, envText, values: decoded }
}

async function exists(path: string) { try { await access(path); return true } catch { return false } }

export async function ensureVoicePython(plan: ReturnType<typeof voicePlan>, run: Command = runSetupCommand, platform = process.platform) {
  const check = 'import sys; assert (3,11)<=sys.version_info[:2]<=(3,12); assert sys.prefix!=sys.base_prefix; print("venv-ok")'
  if (await exists(plan.python)) {
    if (await run(plan.python, ['-c', check], undefined, true) !== 'venv-ok') throw new Error('VOICE_PYTHON Python 3.11/3.12 sanal ortamı olmalıdır; sistem ortamına paket kurulmadı.')
    return
  }
  if (plan.customPython) throw new Error('Özel VOICE_PYTHON bulunamadı; mevcut ayarı değiştirmedim.')
  await mkdir(dirname(plan.defaultVenv), { recursive: true })
  if (await exists(plan.defaultVenv) && (await readdir(plan.defaultVenv)).length) throw new Error('Ses venv dizini dolu ancak Python çalıştırıcısı eksik. Dizini inceleyin; otomatik silinmedi.')
  const candidates: [string, string[]][] = platform === 'win32'
    ? [['py', ['-3.11']], ['py', ['-3.12']], ['python', []]]
    : [['python3.11', []], ['python3.12', []], ['python3', []]]
  let created = false
  for (const [exe, prefix] of candidates) {
    try {
      const version = await run(exe, [...prefix, '-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], undefined, true)
      if (!['3.11', '3.12'].includes(version)) continue
      await run(exe, [...prefix, '-m', 'venv', plan.defaultVenv])
      created = true
      break
    } catch { /* Try another installed interpreter; never use a shell installer. */ }
  }
  if (!created) {
    // uv may provision Python 3.11, but only inside this already-confirmed setup.
    try { await run('uv', ['--version'], undefined, true) }
    catch { throw new Error('Python 3.11/3.12 (venv/ensurepip desteğiyle) veya uv gerekiyor. Kurup betiği tekrar çalıştırın; otomatik yönetici/sistem kurulumu yapılmadı.') }
    await run('uv', ['venv', '--seed', '--python', '3.11', plan.defaultVenv])
  }
  if (await run(plan.python, ['-c', check], undefined, true) !== 'venv-ok') throw new Error('Ses sanal ortamı doğrulanamadı.')
}

export async function installVoice(root: string, originalEnv: string | null, plan: ReturnType<typeof voicePlan>, updateLock = false, run: Command = runSetupCommand, log: (message: string) => void = () => {}) {
  const lockPath = join(root, 'local-ai', 'voice-model-lock.json')
  const beforeLock = await optionalFile(lockPath)
  const oldLock = beforeLock === null ? null : validateVoiceManifest(JSON.parse(beforeLock))
  log('Ses: ayrı Python 3.11/3.12 ortamı hazırlanıyor...')
  await ensureVoicePython(plan, run)
  log('Ses: Python bağımlılıkları kuruluyor/doğrulanıyor...')
  await run(plan.python, ['-m', 'pip', 'install', '--requirement', join(root, 'tools', 'voice', 'requirements.txt')])
  await run(plan.python, ['-m', 'pip', 'check'])
  const job = {
    sttPath: plan.sttPath, ttsPath: plan.ttsPath, managedStt: plan.managedStt, managedTts: plan.managedTts,
    lock: oldLock, updateLock,
    aliases: { VOICE_STT_MODEL: plan.values.VOICE_STT_MODEL, VOICE_TTS_MODEL: plan.values.VOICE_TTS_MODEL, VOICE_TTS_VOICE: plan.values.VOICE_TTS_VOICE },
  }
  const helper = join(root, 'tools', 'voice', 'install_assets.py')
  log('Ses: yerel STT/TTS ağırlıkları ve checksum manifesti hazırlanıyor...')
  const manifest = validateVoiceManifest(JSON.parse(await run(plan.python, [helper, 'download'], JSON.stringify(job), true)))
  log('Ses: mikrofon kullanmadan sentetik Türkçe TTS → STT testi çalışıyor...')
  const smoke = JSON.parse(await run(plan.python, [helper, 'smoke'], JSON.stringify({ ...job, lock: manifest }), true)) as { ok?: boolean }
  if (smoke.ok !== true) throw new Error('Ses üretim/transkripsiyon testi başarısız; .env değiştirilmedi.')
  const envPath = join(root, '.env')
  for (const path of [envPath, lockPath]) {
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error('Ayar dosyası sembolik bağlantı; otomatik değiştirilmedi.') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  if (await optionalFile(envPath) !== originalEnv || await optionalFile(lockPath) !== beforeLock) throw new Error('Kurulum sırasında ayarlar/kilit değişti; üzerine yazılmadı.')
  let backup: string | null = null
  if (originalEnv !== null && originalEnv !== plan.envText) {
    backup = `${envPath}.setup-backup-${randomUUID()}`
    await writeFile(backup, originalEnv, { flag: 'wx', mode: 0o600 })
  }
  await mkdir(dirname(lockPath), { recursive: true })
  await atomicWrite(lockPath, JSON.stringify(manifest, null, 2) + '\n')
  if (originalEnv !== plan.envText) await atomicWrite(envPath, plan.envText)
  return { backup }
}
