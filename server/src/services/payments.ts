import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import Razorpay from 'razorpay';
import { env } from '../config/env.js';
import { db, schema } from '../db/client.js';
import { HttpError } from '../lib/http.js';
import { getSetting } from '../lib/settings.js';
import { moveUserMoney, platformEntry } from './wallet.js';

const rzp = env.razorpayKeyId ? new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret }) : null;

/** Creates a Razorpay order for a wallet top-up. The user pays credit + GST; the wallet receives the credit amount. */
export async function createTopup(userId: string, creditPaise: number) {
  const allowed = await getSetting('wallet.topups_paise');
  if (!allowed.includes(creditPaise) && (creditPaise < 5000 || creditPaise > 1_000_000)) throw new HttpError(400, 'invalid_amount');
  const gstPct = await getSetting('gst.pct');
  const gstPaise = Math.round((creditPaise * gstPct) / 100);
  const totalPaise = creditPaise + gstPaise;

  let orderId: string;
  if (rzp) {
    const order = await rzp.orders.create({ amount: totalPaise, currency: 'INR', notes: { userId, creditPaise: String(creditPaise) } });
    orderId = order.id;
  } else {
    orderId = `demo_order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
  const [p] = await db().insert(schema.payments).values({ userId, providerOrderId: orderId, creditPaise, gstPaise, totalPaise }).returning();
  return { paymentId: p.id, orderId, keyId: env.razorpayKeyId || null, creditPaise, gstPaise, totalPaise, demo: !rzp };
}

const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Called by the app after checkout; the webhook does the same thing and whichever arrives first credits once. */
export async function confirmTopup(userId: string, body: { orderId: string; paymentId?: string; signature?: string }) {
  const [p] = await db().select().from(schema.payments).where(eq(schema.payments.providerOrderId, body.orderId));
  if (!p || p.userId !== userId) throw new HttpError(404, 'payment_not_found');
  if (rzp) {
    const expected = createHmac('sha256', env.razorpayKeySecret).update(`${body.orderId}|${body.paymentId}`).digest('hex');
    if (!body.signature || !safeEq(expected, body.signature)) throw new HttpError(400, 'bad_signature');
  } else if (env.nodeEnv === 'production') {
    throw new HttpError(503, 'payments_not_configured');
  }
  return creditPayment(body.orderId, body.paymentId ?? 'demo');
}

export async function creditPayment(orderId: string, providerPaymentId: string) {
  return db().transaction(async (tx) => {
    const [p] = await tx.select().from(schema.payments).where(eq(schema.payments.providerOrderId, orderId)).for('update');
    if (!p) throw new HttpError(404, 'payment_not_found');
    if (p.status === 'paid') {
      const [u] = await tx.select({ b: schema.users.balancePaise }).from(schema.users).where(eq(schema.users.id, p.userId));
      return { balancePaise: u.b, alreadyCredited: true };
    }
    await tx.update(schema.payments).set({ status: 'paid', providerPaymentId, paidAt: new Date() }).where(eq(schema.payments.id, p.id));
    const balancePaise = await moveUserMoney(tx, p.userId, p.creditPaise, 'topup', { paymentId: p.id });
    await platformEntry(tx, -p.creditPaise, 'topup', { paymentId: p.id, note: 'wallet liability' });
    return { balancePaise, alreadyCredited: false };
  });
}

export function verifyWebhook(rawBody: Buffer, signature: string | undefined) {
  if (!env.razorpayWebhookSecret || !signature) return false;
  const expected = createHmac('sha256', env.razorpayWebhookSecret).update(rawBody).digest('hex');
  return safeEq(expected, signature);
}

export async function refundToWallet(userId: string, amountPaise: number, note: string, sessionId?: string) {
  return db().transaction((tx) => moveUserMoney(tx, userId, amountPaise, 'refund', { note, sessionId }));
}
