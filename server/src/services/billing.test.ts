import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { connectPglite, db, schema } from '../db/client.js';
import { clearSettingsCache, setSetting } from '../lib/settings.js';
import { consentToPaid, endSession, recordActivity, respondToRequest, startSession, tick } from './billing.js';

const T0 = new Date('2026-10-21T10:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

let userId: string, panditUserId: string, panditId: string;

async function user(balance: number, freeSeconds = 0) {
  const [u] = await db().insert(schema.users).values({ name: 'U', balancePaise: balance, freeSecondsRemaining: freeSeconds, freeGranted: true }).returning();
  return u.id;
}
const bal = async (id: string) => (await db().select().from(schema.users).where(eq(schema.users.id, id)))[0];
const earnings = async () => (await db().select().from(schema.pandits).where(eq(schema.pandits.id, panditId)))[0].earningsPaise;
const sess = async (id: string) => (await db().select().from(schema.sessions).where(eq(schema.sessions.id, id)))[0];
const ledgerSum = async (account: string) => Number((await db().execute(sql`select coalesce(sum(amount_paise),0) as s from ledger where account = ${account}`) as any).rows[0].s);

beforeAll(async () => { await connectPglite(); });
beforeEach(async () => {
  await db().execute(sql`truncate ledger, messages, sessions, pandits, users, settings cascade`);
  clearSettingsCache();
  panditUserId = await user(0);
  const [p] = await db().insert(schema.pandits).values({
    userId: panditUserId, displayName: 'Pandit Sharma', status: 'approved', online: true, chatRatePaise: 2000, languages: ['hi'],
  }).returning();
  panditId = p.id;
});

describe('AI per-minute billing', () => {
  it('charges ₹5/min pro-rata: 8m32s → ₹42.67', async () => {
    userId = await user(10000);
    const s = await startSession({ userId, kind: 'ai', mode: 'voice', now: T0 });
    // a user who keeps talking: activity every couple of minutes keeps the session running
    for (const [act, tk] of [[100, 200], [300, 400], [450, 512]]) { await recordActivity(s.id, 'user', at(act)); await tick(s.id, at(tk)); }
    expect((await sess(s.id)).chargedPaise).toBe(4267);
    expect((await bal(userId)).balancePaise).toBe(10000 - 4267);
  });

  it('is idempotent for repeated ticks at the same instant', async () => {
    userId = await user(10000);
    const s = await startSession({ userId, kind: 'ai', mode: 'voice', now: T0 });
    await tick(s.id, at(60)); await tick(s.id, at(60)); await tick(s.id, at(60));
    expect((await sess(s.id)).chargedPaise).toBe(500);
  });

  it('refuses to start without one minute of balance', async () => {
    userId = await user(499);
    await expect(startSession({ userId, kind: 'ai', mode: 'chat', now: T0 })).rejects.toMatchObject({ code: 'insufficient_balance' });
  });

  it('ends at zero balance and never goes negative', async () => {
    userId = await user(1000); // two minutes
    const s = await startSession({ userId, kind: 'ai', mode: 'voice', now: T0 });
    await recordActivity(s.id, 'user', at(100));
    await tick(s.id, at(200));
    const after = await sess(s.id);
    expect(after.status).toBe('ended');
    expect(after.endReason).toBe('insufficient_balance');
    expect((await bal(userId)).balancePaise).toBe(0);
    expect(after.chargedPaise).toBe(1000);
  });

  it('pauses idle text chat and stops charging', async () => {
    userId = await user(10000);
    const s = await startSession({ userId, kind: 'ai', mode: 'chat', now: T0 });
    await tick(s.id, at(1000)); // idle after 120s
    const p = await sess(s.id);
    expect(p.status).toBe('paused');
    expect(p.chargedPaise).toBe(1000); // 120s × ₹5/min
    await recordActivity(s.id, 'user', at(2000));
    await tick(s.id, at(2060));
    expect((await sess(s.id)).chargedPaise).toBe(1500);
  });

  it('per-message mode charges each user message', async () => {
    await setSetting('ai.billing_mode', 'per_message');
    userId = await user(1000);
    const s = await startSession({ userId, kind: 'ai', mode: 'chat', now: T0 });
    await recordActivity(s.id, 'user', at(5));
    await recordActivity(s.id, 'user', at(10));
    await tick(s.id, at(600));
    expect((await bal(userId)).balancePaise).toBe(600);
  });
});

describe('Pandit chat with 60 free minutes', () => {
  it('uses free minutes first, pays the pandit from platform budget, then waits for consent', async () => {
    userId = await user(0, 3600);
    const s = await startSession({ userId, kind: 'pandit', mode: 'chat', panditId, now: T0 });
    expect(s.status).toBe('requested');
    expect(s.freeEligible).toBe(true);
    await respondToRequest(panditUserId, s.id, true, T0);
    const ev1 = await tick(s.id, at(3000)); // 50 min
    expect(ev1.some((e) => e.type === 'free_warning')).toBe(true);
    expect((await bal(userId)).freeSecondsRemaining).toBe(600);
    const ev2 = await tick(s.id, at(3700));
    expect(ev2.some((e) => e.type === 'free_ended')).toBe(true);
    const cur = await sess(s.id);
    expect(cur.status).toBe('awaiting_consent');
    expect(cur.chargedPaise).toBe(0);
    expect(await earnings()).toBe(60 * 300); // ₹3/min × 60
    expect(await ledgerSum('platform')).toBe(-18000);
  });

  it('cannot continue to paid without balance', async () => {
    userId = await user(0, 60);
    const s = await startSession({ userId, kind: 'pandit', mode: 'chat', panditId, now: T0 });
    await respondToRequest(panditUserId, s.id, true, T0);
    await tick(s.id, at(90));
    const r = await consentToPaid(userId, s.id, true, at(95));
    expect(r.status).toBe('ended');
    expect(r.endReason).toBe('insufficient_balance');
  });

  it('after consent bills at the pandit rate and splits 70/30', async () => {
    userId = await user(10000, 60);
    const s = await startSession({ userId, kind: 'pandit', mode: 'chat', panditId, now: T0 });
    await respondToRequest(panditUserId, s.id, true, T0);
    await tick(s.id, at(60));
    await consentToPaid(userId, s.id, true, at(70));
    await tick(s.id, at(370)); // 5 paid minutes at ₹20
    const cur = await sess(s.id);
    expect(cur.chargedPaise).toBe(10000);
    expect((await bal(userId)).balancePaise).toBe(0);
    expect(await earnings()).toBe(300 + 7000);
    expect(cur.status).toBe('ended'); // wallet empty
    // money is conserved: user paid = pandit earned (paid part) + platform commission
    expect(await ledgerSum('user')).toBe(-10000);
    expect(await ledgerSum('pandit') + await ledgerSum('platform')).toBe(10000);
  });

  it('voice calls are not free and need balance', async () => {
    userId = await user(0, 3600);
    await expect(startSession({ userId, kind: 'pandit', mode: 'voice', panditId, now: T0 })).rejects.toMatchObject({ code: 'insufficient_balance' });
  });

  it('one open session per user; pandit busy until it ends', async () => {
    userId = await user(10000);
    const s = await startSession({ userId, kind: 'pandit', mode: 'chat', panditId, now: T0 });
    await expect(startSession({ userId, kind: 'ai', mode: 'chat', now: T0 })).rejects.toMatchObject({ code: 'session_already_open' });
    const other = await user(10000);
    await expect(startSession({ userId: other, kind: 'pandit', mode: 'chat', panditId, now: T0 })).rejects.toMatchObject({ code: 'pandit_busy' });
    await respondToRequest(panditUserId, s.id, true, T0);
    await endSession(s.id, userId, 'user_ended', at(120));
    const p = (await db().select().from(schema.pandits).where(eq(schema.pandits.id, panditId)))[0];
    expect(p.busy).toBe(false);
    expect(p.totalSessions).toBe(1);
    expect((await sess(s.id)).chargedPaise).toBe(4000);
  });
});
