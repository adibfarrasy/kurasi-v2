import { AsyncLocalStorage } from 'node:async_hooks'

// Per-request context stored on the async stack so deeply-nested
// `console.log` calls automatically pick up the request id without
// every callee having to thread it through. Bun's runtime exposes the
// same node:async_hooks AsyncLocalStorage that Node does.
type LogContext = { reqId: string }
const als = new AsyncLocalStorage<LogContext>()

let installed = false

// Prepends `[ISO timestamp] [reqId]` to every console.log/info/warn/error
// call. Idempotent — safe to import from multiple entry points.
export function installRequestLogger() {
  if (installed) return
  installed = true

  const origLog = console.log.bind(console)
  const origInfo = console.info.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)

  function prefix(): string {
    const reqId = als.getStore()?.reqId ?? '-'
    return `[${new Date().toISOString()}] [${reqId}]`
  }

  console.log = (...args: unknown[]) => origLog(prefix(), ...args)
  console.info = (...args: unknown[]) => origInfo(prefix(), ...args)
  console.warn = (...args: unknown[]) => origWarn(prefix(), ...args)
  console.error = (...args: unknown[]) => origError(prefix(), ...args)
}

// Generates a short, URL-safe request id. Prefers the inbound
// `x-request-id` header so an upstream proxy / mobile client can pin a
// trace across hops; falls back to the first 8 hex chars of a UUIDv4.
export function deriveRequestId(req: Request): string {
  const inbound = req.headers.get('x-request-id')
  if (inbound && inbound.length > 0 && inbound.length <= 64) return inbound
  return crypto.randomUUID().slice(0, 8)
}

// Runs `fn` with `reqId` bound on the async-local stack so every
// console.* call inside (no matter how deeply nested) is tagged.
export function withRequestId<T>(reqId: string, fn: () => T): T {
  return als.run({ reqId }, fn)
}
