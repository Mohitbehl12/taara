import { eq, sql } from 'drizzle-orm';
import { schema, type Tx } from '../db/client.js';
import { HttpError } from '../lib/http.js';

type LedgerType = typeof schema.ledger.$inferInsert['type'];

/** Locks the user row for the rest of the transaction and returns it. */
export async function lockUser(tx: Tx, userId: string) {
  const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, userId)).for('update');
  if (!u) throw new HttpError(404, 'user_not_found');
  return u;
}

export async function lockPandit(tx: Tx, panditId: string) {
  const [p] = await tx.select().from(schema.pandits).where(eq(schema.pandits.id, panditId)).for('update');
  if (!p) throw new HttpError(404, 'pandit_not_found');
  return p;
}

/** Adds a signed amount to a user's wallet and writes the ledger row. Refuses to go negative. */
export async function moveUserMoney(tx: Tx, userId: string, amountPaise: number, type: LedgerType,
  ref: { sessionId?: string; paymentId?: string; note?: string } = {}) {
  if (!Number.isInteger(amountPaise)) throw new Error('amount must be integer paise');
  if (amountPaise === 0) return null;
  const [row] = await tx.update(schema.users)
    .set({ balancePaise: sql`${schema.users.balancePaise} + ${amountPaise}` })
    .where(sql`${schema.users.id} = ${userId} and ${schema.users.balancePaise} + ${amountPaise} >= 0`)
    .returning({ balance: schema.users.balancePaise });
  if (!row) throw new HttpError(402, 'insufficient_balance');
  await tx.insert(schema.ledger).values({
    account: 'user', ownerId: userId, type, amountPaise, balanceAfter: row.balance, ...ref,
  });
  return row.balance;
}

export async function movePanditMoney(tx: Tx, panditId: string, amountPaise: number, type: LedgerType,
  ref: { sessionId?: string; note?: string } = {}) {
  if (amountPaise === 0) return null;
  const [row] = await tx.update(schema.pandits)
    .set({ earningsPaise: sql`${schema.pandits.earningsPaise} + ${amountPaise}` })
    .where(sql`${schema.pandits.id} = ${panditId} and ${schema.pandits.earningsPaise} + ${amountPaise} >= 0`)
    .returning({ balance: schema.pandits.earningsPaise });
  if (!row) throw new HttpError(402, 'insufficient_earnings');
  await tx.insert(schema.ledger).values({
    account: 'pandit', ownerId: panditId, type, amountPaise, balanceAfter: row.balance, ...ref,
  });
  return row.balance;
}

export async function platformEntry(tx: Tx, amountPaise: number, type: LedgerType, ref: { sessionId?: string; paymentId?: string; note?: string } = {}) {
  if (amountPaise === 0) return;
  await tx.insert(schema.ledger).values({ account: 'platform', ownerId: null, type, amountPaise, ...ref });
}
