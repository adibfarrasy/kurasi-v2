import { authMiddleware } from './middlewares/auth'
import { base } from './orpc-base'

export const authed = base.use(authMiddleware)
