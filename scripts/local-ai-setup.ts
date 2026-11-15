import { readFile, writeFile, rename, unlink, mkdir, lstat } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { localAiConfig, type LocalAiConfig } from '../server/localAi.ts'

export const DEFAULT_MODEL = 'medgemma1.5:4b'
export const DEFAULT_COMPANION_MODEL = 'qwen3:1.7b'
export const COMPANION_TERMS_URL = 'https://ollama.com/library/qwen3:1.7b'
export const TERMS_URL = 'https://developers.google.com/health-ai-developer-foundations/terms'
export type ModelRole = 'medical' | 'companion'

export type ModelLock = { schemaVersion: 1; model: string; digest: string }
type InstalledModel = { name: string; digest: string; remote_host?: unknown; remote_model?: unknown }

export function configuration(text: string, model?: string, overrides: NodeJS.ProcessEnv = {}, role: ModelRole = 'medical') {
  const values = parseEnv(text)
  const prefix = role === 'medical' ? 'LOCAL_AI' : 'COMPANION_AI'
  const keys = ['ENABLED', 'URL', 'MODEL', 'TIMEOUT_MS'].map((key) => `${prefix}_${key}`)
  for (const key of keys) if (overrides[key] !== undefined) values[key] = overrides[key]!
  const selected = model ?? (values[`${prefix}_MODEL`] || (role === 'medical' ? DEFAULT_MODEL : DEFAULT_COMPANION_MODEL))
  const config = localAiConfig({
    LOCAL_AI_ENABLED: 'true',
    LOCAL_AI_URL: values[`${prefix}_URL`] || values.LOCAL_AI_URL,
    LOCAL_AI_TIMEOUT_MS: values[`${prefix}_TIMEOUT_MS`],
    LOCAL_AI_MODEL: selected,
  })
  return { config, envText: updateEnv(text, {
    [`${prefix}_ENABLED`]: 'true', [`${prefix}_URL`]: config.baseUrl,
    [`${prefix}_MODEL`]: config.model, [`${prefix}_TIMEOUT_MS`]: String(config.timeoutMs),
  }) }
}

export function updateEnv(text: string, values: Record<string, string>): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const seen = new Set<string>()
  const lines = text.split(/\r?\n/).flatMap((line) => {
    const key = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]
    if (!key || !Object.hasOwn(values, key)) return [line]
    if (seen.has(key)) return []
    seen.add(key)
    return [`${key}=${values[key]}`]
  })
  for (const [key, value] of Object.entries(values)) if (!seen.has(key)) lines.push(`${key}=${value}`)
  const result = lines.join(eol).replace(/(?:\r?\n)*$/, '') + eol
  // Refuse to corrupt unusual multiline dotenv values while editing known keys.
  const before = parseEnv(text)
  const after = parseEnv(result)
  for (const [key, value] of Object.entries(before)) {
    if (!Object.hasOwn(values, key) && after[key] !== value) throw new Error('.env biçimi güvenli biçimde düzenlenemiyor; dosya değiştirilmedi.')
  }
  for (const [key, value] of Object.entries(after)) {
    if (!Object.hasOwn(values, key) && before[key] !== value) throw new Error('.env biçimi güvenli biçimde düzenlenemiyor; dosya değiştirilmedi.')
  }
  for (const [key, value] of Object.entries(values)) if (after[key] !== value) throw new Error('.env değerleri doğrulanamadı.')
  return result
}

export function normalizeDigest(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:sha256:)?[a-fA-F0-9]{64}$/.test(value)) throw new Error('Model envanterinde geçerli SHA256 digest bulunamadı.')
  return value.replace(/^sha256:/, '').toLowerCase()
}

export function parseLock(text: string): ModelLock {
  const value = JSON.parse(text) as Partial<ModelLock>
  if (value.schemaVersion !== 1 || typeof value.model !== 'string') throw new Error('Model kilit dosyası geçersiz.')
  localAiConfig({ LOCAL_AI_MODEL: value.model })
  if (!value.model) throw new Error('Model kilidinde model adı eksik.')
  return { schemaVersion: 1, model: value.model, digest: normalizeDigest(value.digest) }
}

export function checkLock(lock: ModelLock | null, model: InstalledModel, update: boolean): ModelLock {
  if (model.remote_host || model.remote_model) throw new Error('Bu model uzak/bulut modelidir; yerel kurulum için reddedildi.')
  const candidate: ModelLock = { schemaVersion: 1, model: model.name, digest: normalizeDigest(model.digest) }
  if (lock && (lock.model !== candidate.model || lock.digest !== candidate.digest) && !update) {
    throw new Error('Model adı/digest kilitle uyuşmuyor. Kökeni inceleyin; bilinçli güncelleme için --update-lock kullanın.')
  }
  return candidate
}

async function boundedJson(response: Response, limit = 262_144): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new Error(`Ollama isteği başarısız (HTTP ${response.status}).`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.byteLength
      if (bytes > limit) { await reader.cancel(); throw new Error('Ollama yanıtı çok büyük.') }
      chunks.push(part.value)
    }
  } finally { reader.releaseLock() }
  const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Ollama JSON yanıtı geçersiz.')
  return data as Record<string, unknown>
}

export async function installedModel(config: LocalAiConfig): Promise<InstalledModel | null> {
  const data = await boundedJson(await fetch(`${config.baseUrl}/api/tags`, { redirect: 'error', signal: AbortSignal.timeout(5000) }))
  if (!Array.isArray(data.models)) throw new Error('Ollama model listesi geçersiz.')
  const found = data.models.find((item) => item && typeof item === 'object' && (item.name === config.model || item.name === `${config.model}:latest`))
  if (!found) return null
  return { name: config.model, digest: found.digest, remote_host: found.remote_host, remote_model: found.remote_model }
}

// Stream progress rather than collecting a potentially lengthy download response.
export async function pullModel(config: LocalAiConfig, progress: (percent: number | null) => void) {
  const response = await fetch(`${config.baseUrl}/api/pull`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
    signal: AbortSignal.timeout(30 * 60 * 1000), body: JSON.stringify({ model: config.model, stream: true }),
  })
  if (!response.ok || !response.body) throw new Error(`Model indirilemedi (HTTP ${response.status}).`)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let success = false
  let lastPercent = -1
  const consume = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as Record<string, unknown>
    if (event.error) throw new Error('Ollama indirmeyi reddetti. Model adını, erişim koşullarını ve boş disk alanını kontrol edin.')
    if (event.status === 'success') success = true
    if (typeof event.total === 'number' && event.total > 0 && typeof event.completed === 'number') {
      const percent = Math.max(0, Math.min(100, Math.floor(event.completed / event.total * 100)))
      if (percent !== lastPercent) { lastPercent = percent; progress(percent) }
    }
  }
  try {
    progress(null)
    while (true) {
      const part = await reader.read()
      buffer += decoder.decode(part.value, { stream: !part.done })
      let newline: number
      while ((newline = buffer.indexOf('\n')) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1) }
      if (buffer.length > 65_536) throw new Error('Ollama indirme yanıtı geçersiz.')
      if (part.done) break
    }
    consume(buffer)
    if (!success) throw new Error('Model indirmesi tamamlanmadı; tekrar çalıştırarak sürdürebilirsiniz.')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}

export type SmokeResult = { processor: 'gpu' | 'mixed' | 'cpu' | 'unknown'; elapsedMs: number }

export async function smokeTest(config: LocalAiConfig): Promise<SmokeResult> {
  const start = Date.now()
  const data = await boundedJson(await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error',
    signal: AbortSignal.timeout(config.timeoutMs),
    body: JSON.stringify({
      model: config.model, stream: false, keep_alive: '2m', think: false,
      messages: [{ role: 'user', content: 'This is a software connectivity test, not a medical question. Reply briefly with OK.' }],
      options: { temperature: 0, num_ctx: 4096, num_predict: 16 },
    }),
  }), 32_768)
  const message = data.message as Record<string, unknown> | undefined
  if (data.done !== true || typeof message?.content !== 'string' || !message.content.trim()) throw new Error('Model tamamlanmış bir metin yanıtı üretmedi.')
  const elapsedMs = Date.now() - start
  try {
    const loaded = await boundedJson(await fetch(`${config.baseUrl}/api/ps`, { redirect: 'error', signal: AbortSignal.timeout(5000) }))
    const model = Array.isArray(loaded.models) ? loaded.models.find((item) => item?.name === config.model || item?.name === `${config.model}:latest`) : undefined
    if (!model || typeof model.size_vram !== 'number' || typeof model.size !== 'number' || model.size <= 0 || model.size_vram < 0) return { processor: 'unknown', elapsedMs }
    return { processor: model.size_vram === 0 ? 'cpu' : model.size_vram >= model.size ? 'gpu' : 'mixed', elapsedMs }
  } catch { return { processor: 'unknown', elapsedMs } }
}

export async function optionalFile(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

export async function atomicWrite(path: string, value: string) {
  const temp = `${path}.setup-${randomUUID()}.tmp`
  try {
    await writeFile(temp, value, { mode: 0o600, flag: 'wx' })
    await rename(temp, path)
  } finally { await unlink(temp).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error }) }
}

export async function saveSetup(root: string, originalEnv: string | null, envText: string, originalLock: string | null, lock: ModelLock, role: ModelRole = 'medical') {
  const envPath = join(root, '.env')
  const lockPath = join(root, 'local-ai', role === 'medical' ? 'model-lock.json' : 'companion-model-lock.json')
  for (const path of [envPath, lockPath]) {
    try { if ((await lstat(path)).isSymbolicLink()) throw new Error('Ayar dosyası sembolik bağlantı; güvenlik için otomatik değiştirilmedi.') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  if (await optionalFile(envPath) !== originalEnv || await optionalFile(lockPath) !== originalLock) throw new Error('Kurulum sırasında ayarlar değişti; üzerine yazılmadı. Tekrar çalıştırın.')
  const lockText = JSON.stringify(lock, null, 2) + '\n'
  let backup: string | null = null
  if (originalEnv !== null && originalEnv !== envText) {
    backup = `${envPath}.setup-backup-${randomUUID()}`
    await writeFile(backup, originalEnv, { mode: 0o600, flag: 'wx' })
  }
  await mkdir(join(root, 'local-ai'), { recursive: true })
  if (originalLock !== lockText) await atomicWrite(lockPath, lockText)
  if (originalEnv !== envText) await atomicWrite(envPath, envText)
  return backup
}
