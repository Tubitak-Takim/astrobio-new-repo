import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Explicit foreground launcher; does not install packages, download voices or
// forward unrelated API keys into the optional Python service.
const env: NodeJS.ProcessEnv = {}
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith('VOICE_') || ['PATH', 'HOME', 'SYSTEMROOT', 'SystemRoot', 'TEMP', 'TMP', 'VIRTUAL_ENV', 'STT_MODEL_DIR', 'TTS_MODEL_PATH'].includes(key)) env[key] = value
}
env.HF_HUB_OFFLINE = '1'
env.TRANSFORMERS_OFFLINE = '1'
env.PYTHONUTF8 = '1'
env.PYTHONIOENCODING = 'utf-8'
const child = spawn(process.env.VOICE_PYTHON || 'python3', [fileURLToPath(new URL('../tools/voice/server.py', import.meta.url))], { stdio: 'inherit', env, cwd: resolve(fileURLToPath(new URL('..', import.meta.url))) })
child.on('error', () => { console.error('Voice runtime could not start. Configure VOICE_PYTHON and install the optional venv dependencies.'); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal))
child.on('exit', (code) => { process.exitCode = code ?? 1 })
