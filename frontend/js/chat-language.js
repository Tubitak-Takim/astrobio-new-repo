// UI copy stays English; conversational replies may follow the user's language.
// This lightweight heuristic is not a general-purpose language classifier.
export function replyLanguage(text, previous = 'en') {
  const normalized = String(text).toLowerCase().normalize('NFKD').replace(/\p{M}/gu,'').replace(/ı/g,'i');
  if (/\b(?:in english|speak english|reply in english|ingilizce)\b/.test(normalized)) return 'en';
  if (/\b(?:in turkish|speak turkish|reply in turkish|turkce)\b/.test(normalized)) return 'tr';
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text) || /\b(?:merhaba|selam|basim|agrim|agriyor|nasil|biraz|lutfen|evet|hayir|tesekkur|konusabilir|hissediyorum)\b/.test(normalized)) return 'tr';
  if (/\b(?:hello|hi|please|what|why|how|can|could|would|my|i am|tell me|thank you)\b/.test(normalized)) return 'en';
  return previous;
}
