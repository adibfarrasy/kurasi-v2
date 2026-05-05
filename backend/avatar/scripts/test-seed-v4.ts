/**
 * Smoke test for fal seedream/v4 text-to-image.
 *
 * Usage:
 *   FAL_KEY=... bun backend/avatar/scripts/test-seed-v4.ts --prompt "your prompt"
 *
 * Output: backend/outputs/test-seed-v4.png
 */

import fs from 'node:fs/promises'
import { fal } from '@fal-ai/client'

const MODEL = 'fal-ai/bytedance/seedream/v4/text-to-image'
const OUTPUT_PATH = 'backend/outputs/test-seed-v4.png'

const args = process.argv.slice(2)
let prompt: string | undefined
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--prompt') prompt = args[++i]
  else {
    console.error(`Unknown arg: ${a}`)
    process.exit(1)
  }
}

if (!prompt) {
  console.error('Missing --prompt')
  process.exit(1)
}

if (!process.env.FAL_KEY) {
  console.error('Missing FAL_KEY env')
  process.exit(1)
}

await fs.mkdir('backend/outputs', { recursive: true })

console.log(`[seedream/v4] submitting to ${MODEL}...`)
const start = Date.now()
const result = await fal.subscribe(MODEL, {
  input: {
    prompt,
    image_size: { width: 832, height: 1248 },
    num_images: 1,
    enable_safety_checker: false,
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === 'IN_PROGRESS') {
      for (const m of update.logs?.map((l) => l.message) ?? []) {
        console.log(`  ${m}`)
      }
    }
  },
})

const data = result.data as { images?: Array<{ url: string }> }
const url = data.images?.[0]?.url
if (!url) {
  console.error('[seedream/v4] no output url', data)
  process.exit(1)
}
console.log(`[seedream/v4] generated in ${Date.now() - start}ms: ${url}`)

const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
await fs.writeFile(OUTPUT_PATH, buf)
console.log(`[seedream/v4] saved ${OUTPUT_PATH}`)
