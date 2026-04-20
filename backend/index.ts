import { serve } from 'bun'
import { auth } from './auth'
import { db } from './db/db'
import { handler } from './orpc/orpc-router'

const server = serve({
  port: 8989,
  hostname: '0.0.0.0',
  tls: {
    cert: Bun.file('argus-mbp.auroch-gray.ts.net.crt'),
    key: Bun.file('argus-mbp.auroch-gray.ts.net.key'),
  },
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
  },
})

console.log(`🚀 Server running at ${server.url}`)
