// Bounded, stateless, local-only generation for free-text chat. Never downloads
// weights, sends database records implicitly or exposes reasoning tokens.
import { acquireInference } from './inference.ts'
import { probeLocalModel, readLocalJson, type LocalAiConfig } from './localAi.ts'

export async function directChat(config: LocalAiConfig, message: string, instruction: string, structured = false) {
  const base = { value: null as string | null, model: config.model || null }
  if (!config.enabled) return { ...base, state: 'disabled' }
  if (!config.model) return { ...base, state: 'not_configured' }
  const release = acquireInference()
  if (!release) return { ...base, state: 'busy' }
  const signal = AbortSignal.timeout(config.timeoutMs)
  try {
    const state = await probeLocalModel(config, signal)
    if (state !== 'ready') return { ...base, state }
    const data = await readLocalJson(await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal,
      body: JSON.stringify({
        model: config.model, stream: false, keep_alive: 0, think: false,
        ...(structured ? { format: { type: 'object', properties: { opening: { type: 'string', enum: ['acknowledge', 'calm', 'thanks'] } }, required: ['opening'], additionalProperties: false } } : {}),
        messages: [{ role: 'system', content: instruction }, { role: 'user', content: message }],
        options: { temperature: structured ? 0 : 0.3, num_ctx: 4096, num_predict: structured ? 64 : 512 },
      }),
    }), 65_536)
    const output = data.message as Record<string, unknown> | undefined
    // Qwen thinking lives in message.thinking; only final content is returned.
    const value = typeof output?.content === 'string' ? output.content.trim() : ''
    // Leave space for the medical label/disclaimer within the 6000-char speech receipt.
    if (data.done !== true || !value || value.length > 5200 || /<\/?think\b/i.test(value)) return { ...base, state: 'rejected' }
    return { ...base, state: 'generated', value }
  } catch { return { ...base, state: signal.aborted ? 'timeout' : 'unavailable' } }
  finally { release() }
}
