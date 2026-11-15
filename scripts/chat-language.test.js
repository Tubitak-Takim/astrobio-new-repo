import { expect, it } from 'vitest';
import { replyLanguage } from '../frontend/js/chat-language.js';

it.each([
  ['Merhaba, türkçe konuşabilir misin?','en','tr'],
  ['Biraz baş ağrım var, bu konuda ne yapabilirim?','en','tr'],
  ['Turkce cevap verir misin?','en','tr'],
  ['Please reply in English.','tr','en'],
  ['How can I improve my sleep?','tr','en'],
  ['Hello','tr','en'],
  ['👍','tr','tr'],
])('chooses the conversation language without changing UI copy: %s',(text,previous,wanted)=>{
  expect(replyLanguage(text,previous)).toBe(wanted);
});
