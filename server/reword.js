// Optional: reword a handbook answer into friendlier English with Gemini.
// Internal Astrobio service, called by the authenticated Node /api/reword route.
//
// The API key is read from the server's environment (GEMINI_API_KEY). It is never sent to
// the browser. Without a key this feature is simply off and the app works as before.
//
// The model is instructed not to add facts, numbers or advice. This is not a guarantee.
// Clients must retain and display the original handbook text alongside its output.
// Needs internet, so it is not for use on a spacecraft.

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'

const RULES = [
  'You rewrite text for an astronaut who is not a doctor.',
  'Rewrite the HANDBOOK TEXT so it answers the QUESTION in plain, calm English.',
  'Use ONLY facts that are in the handbook text. Do not add facts, numbers, causes, diagnoses, medicines or advice.',
  'Keep every number exactly as written. Keep it under 90 words. No headings, no lists, no markdown.',
  'If the handbook text does not answer the question, say: "The handbook does not cover that."',
].join(' ')

export const rewordEnabled = () => Boolean(process.env.GEMINI_API_KEY)

// At most 6 rewordings a minute per visitor and 120 an hour in total (per running server).
const perVisitor = new Map()
let hourStart = 0
let hourCount = 0
export function allowed(who) {
  const now = Date.now()
  if (now - hourStart > 3_600_000) {
    hourStart = now
    hourCount = 0
  }
  const recent = (perVisitor.get(who) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= 6 || hourCount >= 120) return false
  recent.push(now)
  perVisitor.set(who, recent)
  hourCount++
  if (perVisitor.size > 500) perVisitor.clear()
  return true
}

export async function reword(question, text) {
  const key = process.env.GEMINI_API_KEY
  if (!key) return { ok: false, status: 503, error: 'Rewording is off: no Gemini key is set on the server.' }
  if (typeof question !== 'string' || typeof text !== 'string' || !text.trim() || question.length > 300 || text.length > 2500) {
    return { ok: false, status: 400, error: 'Nothing to reword.' }
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: RULES }] },
        contents: [{ role: 'user', parts: [{ text: `QUESTION: ${question}\n\nHANDBOOK TEXT:\n${text}` }] }],
        generationConfig: { maxOutputTokens: 300 },
      }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return { ok: false, status: 502, error: `Gemini did not answer (code ${res.status}).` }
    const data = await res.json()
    const out = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim()
    if (!out) return { ok: false, status: 502, error: 'Gemini returned an empty answer.' }
    return { ok: true, text: out.slice(0, 900) }
  } catch {
    return { ok: false, status: 502, error: 'Gemini could not be reached.' }
  }
}
