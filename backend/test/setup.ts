import { afterAll } from 'bun:test'
import { spawn } from 'node:child_process'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'

const TEST_DB_NAME = 'kurasi_test'
const TEST_DB_USER = 'postgres'
const TEST_DB_PASSWORD = 'postgres'

function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`))
    })
  })
}

process.env.NODE_ENV ||= 'test'
process.env.BETTER_AUTH_SECRET ??= 'bilMpMhPQbdaQiXtXfB04593FVKRIKLD' // test-only secret
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
process.env.DATABASE_URL ??=
  'postgres://postgres:postgres@127.0.0.1:55432/__preload_env_placeholder'

let container: StartedTestContainer | null = null

console.log('Starting test container')
container = await new GenericContainer('postgres:18-alpine')
  .withEnvironment({
    POSTGRES_DB: TEST_DB_NAME,
    POSTGRES_USER: TEST_DB_USER,
    POSTGRES_PASSWORD: TEST_DB_PASSWORD,
  })
  .withExposedPorts(5432)
  .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2))
  .withStartupTimeout(60_000)
  .start()

const hostPort = container.getMappedPort(5432)
process.env.DATABASE_URL = `postgres://${TEST_DB_USER}:${TEST_DB_PASSWORD}@127.0.0.1:${hostPort}/${TEST_DB_NAME}`

console.log('Running migrations')

await runCommand('bun', ['run', 'drizzle-kit', 'migrate'], new URL('..', import.meta.url).pathname)

afterAll(async () => {
  await container?.stop()
})
