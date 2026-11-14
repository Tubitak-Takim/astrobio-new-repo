import { PassThrough } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { rateLimiter, readJson } from './http'

describe('HTTP helpers', () => {
  it('parses UTF-8 split across chunks', async () => {
    const stream = new PassThrough()
    const parsed = readJson(stream as unknown as IncomingMessage)
    const data = Buffer.from('{"text":"Işıkhan"}')
    for (const byte of data) stream.write(Buffer.from([byte]))
    stream.end()
    await expect(parsed).resolves.toEqual({ text: 'Işıkhan' })
  })

  it('rejects oversized and non-object bodies', async () => {
    const stream = new PassThrough()
    const parsed = readJson(stream as unknown as IncomingMessage, 3)
    const checked = expect(parsed).rejects.toMatchObject({ status: 413 })
    stream.end('1234')
    await checked
    const array = new PassThrough()
    const invalid = readJson(array as unknown as IncomingMessage)
    array.end('[]')
    await expect(invalid).rejects.toMatchObject({ status: 400 })
  })

  it('limits attempts per visitor and expires the window', () => {
    const allow = rateLimiter(2, 1000)
    expect(allow('a', 1000)).toBe(true)
    expect(allow('a', 1001)).toBe(true)
    expect(allow('a', 1002)).toBe(false)
    expect(allow('b', 1002)).toBe(true)
    expect(allow('a', 2000)).toBe(true)
  })
})
