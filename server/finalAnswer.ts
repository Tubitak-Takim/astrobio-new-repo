// Fail closed on recognizable analysis/draft output. This is a presentation
// guard, not a proof of factual or clinical correctness; never pick "Draft 2".
export function isFinalAnswer(text: string) {
  if (!text || text.length > 5200) return false
  if (/<\/?(?:think|analysis|reasoning)\b|<\|[^>]*\|>|<(?:unused\d+|start_of_turn|end_of_turn)>/i.test(text)) return false
  if (/^\s*(?:#{1,6}\s*)?(?:\*{1,2})?(?:draft\s*\d*|critique\s*\d*|revise\s*\d*|analysis|thought(?:s)?|internal reasoning|taslak\s*\d*|düşünce(?:ler)?|iç düşünce)(?:\s*\([^\n)]{1,40}\))?(?:\*{1,2})?\s*[:：\n]/im.test(text)) return false
  if (/\b(?:the user is (?:asking|requesting)|i need to (?:provide|respond|answer)|let me (?:think|draft)|my (?:analysis|reasoning))\b/i.test(text)) return false
  return true
}
