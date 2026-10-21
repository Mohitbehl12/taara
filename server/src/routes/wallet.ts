import express, { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { handler, requireAuth } from '../lib/http.js';
import { confirmTopup, createTopup, creditPayment, verifyWebhook } from '../services/payments.js';
import { track } from '../services/analytics.js';
import { notify } from '../services/notify.js';
import { requireAdult } from '../services/safety.js';

export const walletRoutes = Router();

walletRoutes.get('/wallet', requireAuth, handler({}, async ({ user }) => {
  const [u] = await db().select({ balancePaise: schema.users.balancePaise, freeSecondsRemaining: schema.users.freeSecondsRemaining })
    .from(schema.users).where(eq(schema.users.id, user.id));
  return u;
}));

walletRoutes.get('/wallet/transactions', requireAuth, handler({ query: z.object({ before: z.string().optional() }) }, async ({ user }) =>
  db().select().from(schema.ledger).where(and(eq(schema.ledger.account, 'user'), eq(schema.ledger.ownerId, user.id)))
    .orderBy(desc(schema.ledger.createdAt)).limit(100)));

walletRoutes.post('/wallet/topup', requireAuth, handler({ body: z.object({ creditPaise: z.number().int() }) }, async ({ body, user }) => {
  await requireAdult(user.id);
  return createTopup(user.id, body.creditPaise);
}));

walletRoutes.post('/wallet/topup/confirm', requireAuth, handler({
  body: z.object({ orderId: z.string(), paymentId: z.string().optional(), signature: z.string().optional() }),
}, async ({ body, user }) => {
  const r = await confirmTopup(user.id, body);
  if (!r.alreadyCredited) await track(user.id, 'topup_completed');
  return r;
}));

/** Razorpay webhook (payment.captured / order.paid). Mounted before the JSON body parser to keep the raw body for HMAC. */
export const razorpayWebhook = [
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req: express.Request, res: express.Response) => {
    if (!verifyWebhook(req.body as Buffer, req.header('x-razorpay-signature'))) return res.status(400).json({ error: 'bad_signature' });
    const evt = JSON.parse((req.body as Buffer).toString('utf8'));
    const pay = evt?.payload?.payment?.entity;
    if ((evt.event === 'payment.captured' || evt.event === 'order.paid') && pay?.order_id) {
      try {
        const r = await creditPayment(pay.order_id, pay.id);
        if (!r.alreadyCredited) {
          const [p] = await db().select().from(schema.payments).where(eq(schema.payments.providerOrderId, pay.order_id));
          await notify(p.userId, 'payment', { title: 'Wallet recharged', body: `₹${(p.creditPaise / 100).toFixed(0)} added to your wallet.` });
        }
      } catch (e) { console.error('webhook credit failed', e); return res.status(500).end(); }
    }
    res.json({ ok: true });
  },
];
