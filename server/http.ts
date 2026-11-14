import type { IncomingMessage } from 'node:http'

export class RequestError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function readJson(req: IncomingMessage, maxBytes = 20_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0
    let rejected = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      if (rejected) return // Drain without retaining oversized bodies.
      size += chunk.length
      if (size > maxBytes) {
        rejected = true
        chunks.length = 0
        reject(new RequestError(413, 'Request body is too large.'))
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
        if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error()
        resolve(value as Record<string, unknown>)
      } catch {
        reject(new RequestError(400, 'Send a JSON object.'))
      }
    })
    req.on('error', reject)
    req.on('aborted', () => reject(new RequestError(400, 'Request was interrupted.')))
  })
}

export function rateLimiter(limit: number, windowMs: number) {
  const visitors = new Map<string, { count: number; until: number }>()
  return (key: string, now = Date.now()) => {
    for (const [id, entry] of visitors) if (entry.until <= now) visitors.delete(id)
    const entry = visitors.get(key) ?? { count: 0, until: now + windowMs }
    if (entry.count >= limit) return false
    // Bound memory even if this is later exposed behind a reverse proxy.
    if (!visitors.has(key) && visitors.size >= 10_000) return false
    entry.count++
    visitors.set(key, entry)
    return true
  }
}
