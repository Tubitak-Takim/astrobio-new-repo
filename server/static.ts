// Serve only the public frontend tree: never expose .env, SQLite or model files.
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../frontend')
const voiceClient = resolve(root, '../clients/voice-client.js')
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.pdf': 'application/pdf',
}

export async function serveFrontend(req: IncomingMessage, res: ServerResponse, pathname: string) {
  if (pathname === '/api' || pathname.startsWith('/api/')) return false
  const fail = (status: number) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(req.method === 'HEAD' ? undefined : 'Not found.')
    return true
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405)
  let decoded: string
  try { decoded = decodeURIComponent(pathname) } catch { return fail(400) }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some((p) => p.startsWith('.') || p === '..')) return fail(404)
  const client = decoded === '/clients/voice-client.js'
  const file = client ? voiceClient : resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded))
  if (!client && !file.startsWith(root + sep)) return fail(404)
  const type = types[extname(file)]
  if (!type) return fail(404)
  try {
    // Reject symlinks escaping the public tree, too.
    const actual = await realpath(file)
    if (client ? actual !== voiceClient : !actual.startsWith(root + sep)) return fail(404)
    const info = await stat(actual)
    if (!info.isFile()) return fail(404)
    const content = req.method === 'HEAD' ? null : await readFile(actual)
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY', 'Permissions-Policy': 'microphone=(self), camera=()',
    })
    res.end(content)
    return true
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return fail(404)
    throw error
  }
}
