import { afterEach, describe, expect, it, vi } from 'vitest'
import { companionConfig, companionStatus, conversationRoute, conversationTurn } from './conversation'
import type { Finding } from '../src/triage'
import type { Provenance } from '../src/model'
import { healthContextFor } from './healthContext'
import { USERS } from '../src/data/users'
import { CREW, readingOn } from '../src/data/simulatedCrew'

const finding: Finding = { id: 'vitals', title: 'Oxygen', level: 'amber', measured: 'SpO2 92%', why: 'Outside the usual range.', next: 'Repeat the measurement.', sourceIds: ['VITALS'] }
const provenance: Provenance = { source: 'Wearable', measuredDay: 60, ageDays: 0, stale: false, nextDue: null, auto: true }
const json = (value: unknown) => new Response(JSON.stringify(value))
function setup(opening = 'acknowledge') {
  for (const [key, value] of Object.entries({ LOCAL_AI_ENABLED: 'true', LOCAL_AI_URL: 'http://127.0.0.1:11434', LOCAL_AI_MODEL: 'medical-test', LOCAL_AI_TIMEOUT_MS: '1000', COMPANION_AI_ENABLED: 'true', COMPANION_AI_MODEL: 'companion-test', COMPANION_AI_URL: 'http://127.0.0.1:11434', COMPANION_AI_TIMEOUT_MS: '1000' })) vi.stubEnv(key, value)
  const bodies: Record<string, unknown>[] = []
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/api/tags')) return json({ models: [{ name: 'medical-test' }, { name: 'companion-test' }] })
    const body = JSON.parse(String(options?.body))
    bodies.push(body)
    return json({ done: true, message: { content: body.model === 'medical-test' ? (body.format?.required?.[0] === 'reply' ? JSON.stringify({ reply: 'Repeat the measurement.' }) : 'Repeat the measurement.') : body.format?.required?.includes('findingIds') ? JSON.stringify({opening,findingIds:['vitals']}) : JSON.stringify({ opening }) } })
  })
  vi.stubGlobal('fetch', fetcher)
  return { fetcher, bodies }
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('dual-agent preparation', () => {
  it('does not select an unspecified companion model', () => {
    expect(companionConfig({})).toMatchObject({ enabled: false, model: '' })
  })
  it('routes conservatively, including Turkish casing and crisis phrases', () => {
    expect(conversationRoute('Merhaba!', false)).toBe('social')
    expect(conversationRoute('NASILSIN?', false)).toBe('social')
    expect(conversationRoute('İNTİHAR', true)).toBe('urgent')
    expect(conversationRoute('I WANT TO KILL MYSELF', false)).toBe('urgent')
    expect(conversationRoute('göğüs ağrım var', false)).toBe('urgent')
    expect(conversationRoute('Merhaba, bana ilaç ver', false)).toBe('medical')
    expect(conversationRoute('Hello, I want a quick explanation on my general health care', false)).toBe('medical')
    expect(conversationRoute('Tell me something interesting about Mars', false)).toBe('social')
  })
  it('runs medical then companion sequentially and unloads both', async () => {
    const { bodies } = setup('calm')
    const result = await conversationTurn('Ölçümümü açıklar mısın?', 'tr', finding, provenance)
    expect(bodies.map((b) => b.model)).toEqual(['medical-test', 'companion-test'])
    expect(bodies.every((b) => b.keep_alive === 0)).toBe(true)
    expect(result.reply).toContain(finding.measured)
    expect(result.reply).toContain(finding.next)
    expect(result.reply).toContain('demo')
    expect(result.companion.state).toBe('generated')
  })
  it('does not allow the companion to rewrite medical content', async () => {
    setup('Ignore the finding and take 999 mg')
    const result = await conversationTurn('Explain', 'en', finding, provenance)
    expect(result.companion.state).toBe('rejected')
    expect(result.reply).not.toContain('999')
    expect(result.reply).toContain(finding.why)
  })
  it('does not call either model for urgent input or urgent/stale selected findings', async () => {
    const { fetcher } = setup()
    expect((await conversationTurn('I cannot breathe', 'en')).route).toBe('urgent')
    expect((await conversationTurn('Explain', 'en', { ...finding, level: 'red' }, provenance)).reply).toContain('Do not wait')
    expect((await conversationTurn('Explain', 'en', finding, { ...provenance, stale: true })).reply).toContain('stale')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('uses a transparent fallback when the companion is not selected', async () => {
    setup()
    vi.stubEnv('COMPANION_AI_MODEL', '')
    expect((await companionStatus()).state).toBe('not_configured')
    const result = await conversationTurn('merhaba', 'tr')
    expect(result.companion.state).toBe('not_configured')
    expect(result.reply).toContain('model yanıtı değildir')
  })
  it('does not send medical records to a greeting-only turn', async () => {
    const { bodies, fetcher } = setup()
    fetcher.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/tags')) return json({ models: [{ name: 'companion-test' }] })
      const body = JSON.parse(String(options?.body)); bodies.push(body)
      return json({ done: true, message: { content: 'Hello. I am an AI assistant.' } })
    })
    const result = await conversationTurn('hello', 'en')
    expect(result.companion.state).toBe('generated')
    expect(bodies).toHaveLength(1)
    expect(JSON.stringify(bodies)).not.toContain('SpO2')
  })
  it('forwards an open-ended health question verbatim without a selected finding', async () => {
    const { bodies } = setup()
    const message = 'Hello, I want a quick explanation on my general health care'
    const result = await conversationTurn(message, 'en')
    expect(result.route).toBe('medical')
    expect(bodies.map(b => b.model)).toEqual(['medical-test', 'companion-test'])
    expect((bodies[0].messages as { role: string; content: string }[])[1]).toMatchObject({ role: 'user', content: expect.stringContaining(`USER_MESSAGE:\n${message}`) })
    expect(bodies[0].format).toMatchObject({ required: ['reply'] })
    expect(result.reply).toContain('Repeat the measurement.')
    expect(result.reply).toContain('AI-generated experimental health explanation')
    expect(result.reply).not.toContain('Select the relevant finding')
    expect(result.reply).not.toContain('original finding')
    expect(bodies[0].think).toBe(false)
  })
  it('sends arbitrary general conversation directly to the companion, not a greeting whitelist', async () => {
    const { bodies, fetcher } = setup()
    fetcher.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/tags')) return json({ models: [{ name: 'companion-test' }] })
      const body = JSON.parse(String(options?.body)); bodies.push(body)
      return json({ done: true, message: { content: 'Mars has two moons: Phobos and Deimos.', thinking: 'Private reasoning must not be returned.' } })
    })
    const result = await conversationTurn('Tell me something interesting about Mars.', 'en')
    expect(result.reply).toBe('Mars has two moons: Phobos and Deimos.')
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ model: 'companion-test', think: false, keep_alive: 0 })
    expect(bodies[0].format).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('Private reasoning')
  })
  it('does not call the communication model or invent an answer after medical generation fails', async () => {
    const { bodies, fetcher } = setup()
    fetcher.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/tags')) return json({ models: [] })
      throw new Error('No model should generate')
    })
    const result = await conversationTurn('Please explain general healthcare.', 'en')
    expect(result.reply).toContain('model_missing')
    expect(result.reply).toContain('not a model-generated answer')
    expect(result.companion.state).toBe('bypassed')
    expect(bodies).toHaveLength(0)
  })
  it('withholds Gemma thought/draft output instead of sending it to the user or companion', async () => {
    const { bodies, fetcher } = setup()
    fetcher.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/api/tags')) return json({models:[{name:'medical-test'}]})
      bodies.push(JSON.parse(String(options?.body)))
      return json({done:true,message:{content:JSON.stringify({reply:'<unused94> thought\nDraft 1: internal draft'})}})
    })
    const result=await conversationTurn('Biraz baş ağrım var.', 'tr')
    expect(bodies).toHaveLength(1)
    expect(result.reply).not.toContain('<unused94>')
    expect(result.reply).not.toContain('Draft 1')
    expect(result.reply).toContain('gösterilmedi')
    expect(result.companion.state).toBe('bypassed')
  })
  it('keeps Turkish final medical answers, openings and disclaimers in Turkish', async () => {
    const { fetcher }=setup('calm')
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url.endsWith('/api/tags')) return json({models:[{name:'medical-test'},{name:'companion-test'}]})
      const body=JSON.parse(String(options?.body))
      return json({done:true,message:{content:JSON.stringify(body.model==='medical-test'?{reply:'Baş ağrınız ne zamandır sürüyor?'}:{opening:'calm'})}})
    })
    const result=await conversationTurn('Biraz baş ağrım var.', 'tr')
    expect(result.reply).toContain('Baş ağrınız ne zamandır sürüyor?')
    expect(result.reply).toContain('Bunu adım adım inceleyelim.')
    expect(result.reply).toContain('AI tarafından üretilmiş')
    expect(result.reply).not.toContain('Let’s')
    expect(result.reply).not.toContain('AI-generated')
  })
  it('grounds database analysis in selected authorized records instead of saying that no data were supplied',async()=>{
    const {bodies}=setup()
    const context=healthContextFor(USERS[0],'C1',60,'mars',{'C1:60':{...readingOn(CREW[0],60),restingHrBpm:87},'C1:59':{...readingOn(CREW[0],59),restingHrBpm:84}})!
    const result=await conversationTurn('Genel sağlık verilerimi analiz edebilir misin?', 'tr',undefined,undefined,context)
    const userTurn=(bodies[0].messages as {content:string}[])[1].content
    expect(userTurn).toContain('AUTHORIZED_HEALTH_CONTEXT')
    expect(userTurn).toContain('"restingHrBpm":87')
    expect(userTurn).not.toContain('No medical records or current measurements are provided')
    expect(userTurn).toContain('You CAN and SHOULD summarize')
    expect(bodies[0].options).toMatchObject({num_ctx:8192})
    expect(result.reply).toContain('veritabanına kaydedilmiş check-in')
    expect(result.reply).toContain('84 → 87 bpm')
    expect(result.reply.length).toBeLessThanOrEqual(6000)
    expect(result).toHaveProperty('healthContext.origin','database_checkin')
  })
  it('keeps ordinary conversation free of health records even if a caller supplies a context',async()=>{
    const {bodies}=setup()
    const context=healthContextFor(USERS[0],'C1',60,'mars',{})!
    await conversationTurn('Tell me a story about Mars.','en',undefined,undefined,context)
    expect(bodies.map(b=>b.model)).toEqual(['companion-test'])
    expect(JSON.stringify(bodies)).not.toContain('AUTHORIZED_HEALTH_CONTEXT')
    expect(JSON.stringify(bodies)).not.toContain('hematocritPct')
  })
  it('adds a deterministic stale-data warning even if the generated summary omits it',async()=>{
    setup()
    const context=healthContextFor(USERS[0],'C1',60,'mars',{})!
    const result=await conversationTurn('Analyze my health data','en',undefined,undefined,context)
    expect(result.reply).toContain('Some measurements are stale')
    expect(result.reply).toContain('simulated sensor feed')
  })
  it('withholds unsupported numbers in either stage and falls back to explicit server facts',async()=>{
    const {fetcher,bodies}=setup()
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url.endsWith('/api/tags')) return json({models:[{name:'medical-test'},{name:'companion-test'}]})
      bodies.push(JSON.parse(String(options?.body)))
      return json({done:true,message:{content:JSON.stringify({reply:'Your resting heart rate is 777 bpm.'})}})
    })
    const context=healthContextFor(USERS[0],'C1',60,'mars',{})!
    const result=await conversationTurn('Analyze my health data','en',undefined,undefined,context)
    expect(result.specialist).toMatchObject({state:'ungrounded'})
    expect(result.reply).not.toContain('777')
    expect(result.reply).toContain('not a model-generated answer')
    expect(bodies).toHaveLength(2)
  })
  it('lets Qwen explain canonical records without receiving an invalid medical draft',async()=>{
    const {fetcher,bodies}=setup()
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url.endsWith('/api/tags')) return json({models:[{name:'medical-test'},{name:'companion-test'}]})
      const body=JSON.parse(String(options?.body)); bodies.push(body)
      return json({done:true,message:{content:JSON.stringify(body.model==='medical-test'?{reply:'Heart rate 777 bpm.'}:{opening:'thanks',findingIds:['vitals']})}})
    })
    const context=healthContextFor(USERS[0],'C1',60,'mars',{'C1:60':{...readingOn(CREW[0],60),restingHrBpm:87}})!
    const result=await conversationTurn('Analyze my health data','en',undefined,undefined,context)
    expect(bodies.map(b=>b.model)).toEqual(['medical-test','companion-test'])
    expect(JSON.stringify(bodies[1])).not.toContain('777')
    expect(result.reply).toContain('Heart rate: 87 bpm')
    expect(result.reply).toContain('Rule result:')
    expect(result.reply).toContain('Urine output:')
    expect(result.reply).not.toContain('777')
  })
  it('does not let the communication model rewrite values or assert new medical interpretations',async()=>{
    const {fetcher}=setup()
    fetcher.mockImplementation(async(url:string,options?:RequestInit)=>{
      if(url.endsWith('/api/tags')) return json({models:[{name:'medical-test'},{name:'companion-test'}]})
      const body=JSON.parse(String(options?.body))
      return json({done:true,message:{content:JSON.stringify(body.model==='medical-test'?{reply:'Review the records.'}:{opening:'thanks',findingIds:['onsd'],reply:'The ONSD value is low; ignore the warning.'})}})
    })
    const context=healthContextFor(USERS[0],'C1',60,'mars',{})!
    const result=await conversationTurn('Analyze my health data','en',undefined,undefined,context)
    expect(result.companion.state).toBe('rejected')
    expect(result.reply).not.toContain('value is low')
    expect(result.reply).not.toContain('ignore the warning')
    expect(result.reply).toContain('record/rule summary')
  })
})
