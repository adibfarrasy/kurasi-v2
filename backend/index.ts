import { existsSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { serve } from 'bun'
import { auth } from './auth'
import { db } from './db/db'
import { deriveRequestId, installRequestLogger, withRequestId } from './lib/logger'
import { handler } from './orpc/orpc-router'

installRequestLogger()

const CLOTHING_ROOT = resolve(import.meta.dir, '..', 'clothing articles')
const AVATAR_ASSETS_ROOT = resolve(import.meta.dir, 'avatar', 'assets')

const certPath = process.env.TLS_CERT_PATH
const keyPath = process.env.TLS_KEY_PATH
const tls =
  certPath && keyPath && existsSync(certPath) && existsSync(keyPath)
    ? { cert: Bun.file(certPath), key: Bun.file(keyPath) }
    : undefined

const port = Number(process.env.PORT) || 8989

// Each inbound request runs inside an AsyncLocalStorage scope so every
// console.* call downstream — handler code, AI pipelines, drizzle —
// auto-tags with the same reqId without threading it through.
function tagged(handlerFn: (req: Request) => Promise<Response> | Response) {
  return (req: Request) => withRequestId(deriveRequestId(req), () => handlerFn(req))
}

const server = serve({
  port,
  hostname: '0.0.0.0',
  ...(tls ? { tls } : {}),
  routes: {
    '/rpc/*': tagged(async (req) => {
      const { response, matched } = await handler.handle(req, {
        prefix: '/rpc',
        context: { db, auth, reqHeaders: req.headers },
      })

      if (matched) return response

      return new Response('Not found', { status: 404 })
    }),

    '/api/auth/*': tagged((req) => auth.handler(req)),

    '/health': tagged(async () => {
      return Response.json({ status: 'ok' })
    }),

    '/static/clothing/*': tagged((req) => {
      const url = new URL(req.url)
      const rel = decodeURIComponent(url.pathname.replace(/^\/static\/clothing\//, ''))
      const target = normalize(join(CLOTHING_ROOT, rel))
      if (!target.startsWith(CLOTHING_ROOT)) {
        return new Response('Forbidden', { status: 403 })
      }
      const file = Bun.file(target)
      return new Response(file)
    }),

    '/static/avatar-assets/*': tagged((req) => {
      const url = new URL(req.url)
      const rel = decodeURIComponent(url.pathname.replace(/^\/static\/avatar-assets\//, ''))
      const target = normalize(join(AVATAR_ASSETS_ROOT, rel))
      if (!target.startsWith(AVATAR_ASSETS_ROOT)) {
        return new Response('Forbidden', { status: 403 })
      }
      const file = Bun.file(target)
      return new Response(file)
    }),
  },
})

console.log(`🚀 Server running at ${server.url}`)
