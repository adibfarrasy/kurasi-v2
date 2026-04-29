import { createFiremoon } from '@firemoon/ai-provider'
import { env } from '../env'

const _firemoon = createFiremoon({
  apiKey: env.FIREMOON_API_KEY,
})
