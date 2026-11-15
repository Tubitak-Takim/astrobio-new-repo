import { expect, it } from 'vitest'
import { isFinalAnswer } from './finalAnswer'

it.each([
  '<unused94> thought\nInternal notes',
  '<unused95>final\nSome content',
  '<think>Internal notes</think>Response',
  '<|analysis|>Internal notes',
  '**Draft 1 (Turkish):**\nDraft text',
  '**Critique 1:** Try another draft',
  '**Revise 1:**\nRevision',
  'Draft 2:\nText',
  'The user is asking for medical advice.',
  'I need to provide a response.',
])('rejects recognizable internal planning: %s',text=>{
  expect(isFinalAnswer(text)).toBe(false)
})
it.each([
  'How long have you had the headache?',
  'Baş ağrınız ne zamandır sürüyor?',
  '1. Review the measurement.\n2. Consult the medical officer.',
  'Draft beer is different from bottled beer.',
])('accepts ordinary final prose, including numbered answers: %s',text=>{
  expect(isFinalAnswer(text)).toBe(true)
})
