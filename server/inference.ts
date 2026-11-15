// A single generation slot shared by both Ollama roles in this API process.
let active = false
export function acquireInference(): (() => void) | null {
  if (active) return null
  active = true
  return () => { active = false }
}
