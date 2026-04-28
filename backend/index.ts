import { existsSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'
import { serve } from 'bun'
import { auth } from './auth'
import { db } from './db/db'
import { handler } from './orpc/orpc-router'

const CLOTHING_ROOT = resolve(import.meta.dir, '..', 'clothing articles')

const certPath = process.env.TLS_CERT_PATH
const keyPath = process.env.TLS_KEY_PATH
const tls =
  certPath && keyPath && existsSync(certPath) && existsSync(keyPath)
    ? { cert: Bun.file(certPath), key: Bun.file(keyPath) }
    : undefined

const server = serve({
  port: 8989,
  hostname: '0.0.0.0',
  ...(tls ? { tls } : {}),
  routes: {
    '/rpc/*': async (req) => {
      const { response, matched } = await handler.handle(req, {
        prefix: '/rpc',
        context: { db, auth, reqHeaders: req.headers },
      })

      if (matched) return response

      return new Response('Not found', { status: 404 })
    },

    '/api/auth/*': auth.handler,

    '/health': async () => {
      return Response.json({ status: 'ok' })
    },

    '/static/clothing/*': (req) => {
      const url = new URL(req.url)
      const rel = decodeURIComponent(url.pathname.replace(/^\/static\/clothing\//, ''))
      const target = normalize(join(CLOTHING_ROOT, rel))
      if (!target.startsWith(CLOTHING_ROOT)) {
        return new Response('Forbidden', { status: 403 })
      }
      const file = Bun.file(target)
      return new Response(file)
    },
  },
})

console.log(`🚀 Server running at ${server.url}`)
