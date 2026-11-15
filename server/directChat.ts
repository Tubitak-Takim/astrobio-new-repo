// Bounded, stateless, local-only generation for free-text chat. Never downloads
// weights, sends database records implicitly or exposes reasoning tokens.
import { acquireInference } from './inference.ts'
import { probeLocalModel, readLocalJson, type LocalAiConfig } from './localAi.ts'
import { isFinalAnswer } from './finalAnswer.ts'

export async function directChat(config: LocalAiConfig, message: string, instruction: string, format?: 'opening' | 'reply') {
  const base = { value: null as string | null, model: config.model || null }
  if (!config.enabled) return { ...base, state: 'disabled' }
  if (!config.model) return { ...base, state: 'not_configured' }
  const release = acquireInference()
  if (!release) return { ...base, state: 'busy' }
  const signal = AbortSignal.timeout(config.timeoutMs)
  try {
    const state = await probeLocalModel(config, signal)
    if (state !== 'ready') return { ...base, state }
    const finalInstruction = `${instruction} Output only the final user-facing answer. Never include internal reasoning, thought tokens, analysis, drafts, critiques or revision notes.${format === 'reply' ? ' Return JSON with exactly one field "reply", containing only the complete final answer as a string. Keep it under 180 words.' : ''}`
    const data = await readLocalJson(await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal,
      body: JSON.stringify({
        model: config.model, stream: false, keep_alive: 0, think: false,
        ...(format ? { format: { type: 'object', properties: format === 'opening' ? { opening: { type: 'string', enum: ['acknowledge', 'calm', 'thanks'] } } : { reply: { type: 'string' } }, required: [format], additionalProperties: false } } : {}),
        messages: [{ role: 'system', content: finalInstruction }, {
          role: 'user',
          // Some imported Gemma templates drop system messages. Repeat the
          // output contract inside the medical user turn; do not alter weights
          // or the user's existing Ollama template/model registration.
          content: format === 'reply' ? `${finalInstruction}\n\nUSER_MESSAGE:\n${message}` : message,
        }],
        options: { temperature: format ? 0 : 0.3, num_ctx: 4096, num_predict: format === 'opening' ? 64 : format === 'reply' ? 768 : 512 },
      }),
    }), 65_536)
    const output = data.message as Record<string, unknown> | undefined
    // Qwen thinking lives in message.thinking; only final content is returned.
    let value = typeof output?.content === 'string' ? output.content.trim() : ''
    if (data.done_reason === 'length') return { ...base, state: 'truncated' }
    if (format === 'reply') {
      const parsed: unknown = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...base, state: 'rejected' }
      const fields = parsed as Record<string, unknown>
      if (Object.keys(fields).length !== 1 || typeof fields.reply !== 'string') return { ...base, state: 'rejected' }
      value = fields.reply.trim()
    }
    // Leave space for the medical label/disclaimer within the 6000-char speech receipt.
    if (data.done !== true || !isFinalAnswer(value)) return { ...base, state: 'rejected' }
    return { ...base, state: 'generated', value }
  } catch (error) { return { ...base, state: signal.aborted ? 'timeout' : error instanceof SyntaxError ? 'rejected' : 'unavailable' } }
  finally { release() }
}
