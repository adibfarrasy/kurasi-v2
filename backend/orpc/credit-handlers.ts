import { ORPCError } from '@orpc/server'
import { eq, sql } from 'drizzle-orm'
import * as z from 'zod'
import { creditAccount, creditGrant } from '../db/schema'
import { authed } from './authed'

// Spec: specs/credits.allium — CreditAccount entity, AIBalance surface,
// GrantPurchasedCredits rule.
//
// Every active user has a credit_account row created by the
// user.create.after hook in backend/auth.ts.

const getBalance = authed.handler(async ({ context }) => {
  const { db, user } = context
  const rows = await db
    .select({ balance: creditAccount.balance })
    .from(creditAccount)
    .where(eq(creditAccount.userId, user.id))
  return { balance: rows[0]?.balance ?? 0 }
})

// PurchaseCredits (specs/credits.allium GrantPurchasedCredits, lines
// 173-188). Mock payment for now — no IAP receipt validation. Records
// the grant in credit_grant with source='purchase' and increments the
// balance atomically. Returns the new balance.
const purchase = authed
  .input(z.object({ amount: z.number().int().positive() }))
  .handler(async ({ context, input }) => {
    const { db, user } = context
    const { amount } = input

    const result = await db.transaction(async (tx) => {
      const updated = await tx
        .update(creditAccount)
        .set({ balance: sql`${creditAccount.balance} + ${amount}` })
        .where(eq(creditAccount.userId, user.id))
        .returning({ balance: creditAccount.balance })
      const row = updated[0]
      if (!row) {
        throw new ORPCError('NOT_FOUND', { message: 'Credit account not found' })
      }
      await tx.insert(creditGrant).values({
        userId: user.id,
        amount,
        source: 'purchase',
      })
      return row
    })

    console.log(`[GrantPurchasedCredits] user=${user.id} amount=${amount}`)
    return { balance: result.balance }
  })

export const creditHandlers = {
  getBalance,
  purchase,
}
