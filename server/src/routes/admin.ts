import express, { Router } from 'express';
import path from 'node:path';
import { and, desc, eq, gte, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { handler, HttpError, requireAdmin, requireAuth } from '../lib/http.js';
import { allSettings, DEFAULT_SETTINGS, setSetting, type SettingKey } from '../lib/settings.js';
import { movePanditMoney, moveUserMoney, platformEntry } from '../services/wallet.js';
import { notify, sendPush } from '../services/notify.js';
import { translate } from '../services/translate.js';
import { publicUser } from './account.js';
import { UPLOAD_DIR } from './reports.js';

export const adminRoutes = Router();
// Optional extra lock: ADMIN_IP_ALLOWLIST=1.2.3.4,5.6.7.8 restricts the admin API to office/VPN addresses.
const adminIps = (process.env.ADMIN_IP_ALLOWLIST ?? '').split(',').map((s) => s.trim()).filter(Boolean);
adminRoutes.use('/admin', (req, _res, next) => next(adminIps.length && !adminIps.includes(req.ip ?? '') ? new HttpError(403, 'forbidden') : undefined));
adminRoutes.use('/admin', requireAuth, requireAdmin);

// Audit trail: every state-changing admin request is recorded (who, what, when).
adminRoutes.use('/admin', (req, res, next) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    db().insert(schema.adminAudit).values({ adminId: req.user!.id, method: req.method, path: req.originalUrl.slice(0, 300), body: (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) ? req.body : {} })
      .catch((e) => console.error('audit', e));
  });
  next();
});

adminRoutes.get('/admin/audit', handler({}, async () =>
  db().select().from(schema.adminAudit).orderBy(desc(schema.adminAudit.createdAt)).limit(300)));

adminRoutes.use('/admin/files', express.static(path.join(UPLOAD_DIR, 'private'), { fallthrough: false }));

const sumSql = (col: unknown) => sql<number>`coalesce(sum(${col}),0)`;

adminRoutes.get('/admin/dashboard', handler({}, async () => {
  const d = (days: number) => new Date(Date.now() - days * 86_400_000);
  const count = async (q: Promise<{ c: number }[]>) => Number((await q)[0].c);
  const c = sql<number>`count(*)`;
  const revenue = async (from: Date) => Number((await db().select({ s: sumSql(schema.ledger.amountPaise) }).from(schema.ledger)
    .where(and(eq(schema.ledger.account, 'platform'), gte(schema.ledger.createdAt, from), sql`${schema.ledger.type} in ('session_charge','report_purchase')`)))[0].s);
  const topups = async (from: Date) => Number((await db().select({ s: sumSql(schema.payments.creditPaise) }).from(schema.payments)
    .where(and(eq(schema.payments.status, 'paid'), gte(schema.payments.paidAt, from))))[0].s);
  const daily = await db().execute(sql`
    select to_char(date_trunc('day', created_at at time zone 'Asia/Kolkata'), 'YYYY-MM-DD') as day,
           count(*) filter (where name = 'signup_completed') as signups,
           count(*) filter (where name = 'ai_session_started') as ai_sessions,
           count(*) filter (where name = 'pandit_session_started') as pandit_sessions,
           count(*) filter (where name = 'topup_completed') as topups
    from analytics_events where created_at > now() - interval '30 days' group by 1 order by 1`);
  const funnel = await db().execute(sql`
    select name, count(distinct user_id) as users from analytics_events
    where created_at > now() - interval '30 days'
      and name in ('signup_completed','birth_details_completed','horoscope_viewed','kundli_viewed','ai_session_started','pandit_session_requested','topup_completed','palm_reading_created')
    group by name`);
  return {
    users: { total: await count(db().select({ c }).from(schema.users)), last7: await count(db().select({ c }).from(schema.users).where(gte(schema.users.createdAt, d(7)))) },
    pandits: {
      approved: await count(db().select({ c }).from(schema.pandits).where(eq(schema.pandits.status, 'approved'))),
      pending: await count(db().select({ c }).from(schema.pandits).where(eq(schema.pandits.status, 'pending'))),
      online: await count(db().select({ c }).from(schema.pandits).where(eq(schema.pandits.online, true))),
    },
    liveSessions: await count(db().select({ c }).from(schema.sessions).where(eq(schema.sessions.status, 'active'))),
    revenuePaise: { today: await revenue(d(1)), last7: await revenue(d(7)), last30: await revenue(d(30)) },
    topupsPaise: { today: await topups(d(1)), last7: await topups(d(7)), last30: await topups(d(30)) },
    palmReadings: {
      last7: await count(db().select({ c }).from(schema.palmReadings).where(gte(schema.palmReadings.createdAt, d(7)))),
      detailedLast30: await count(db().select({ c }).from(schema.palmReadings).where(and(gte(schema.palmReadings.createdAt, d(30)), sql`${schema.palmReadings.detailed} is not null`))),
    },
    aiMinutes30: Number((await db().select({ s: sql<number>`coalesce(sum(${schema.sessions.paidSeconds}),0)` }).from(schema.sessions)
      .where(and(eq(schema.sessions.kind, 'ai'), gte(schema.sessions.requestedAt, d(30)))))[0].s) / 60 | 0,
    languages: (await db().execute(sql`select language, count(*)::int as users from users group by language order by 2 desc`) as unknown as { rows: unknown[] }).rows,
    openComplaints: await count(db().select({ c }).from(schema.complaints).where(eq(schema.complaints.status, 'open'))),
    daily: (daily as unknown as { rows: unknown[] }).rows ?? daily,
    funnel: (funnel as unknown as { rows: unknown[] }).rows ?? funnel,
  };
}));

// ---------- users ----------
adminRoutes.get('/admin/users', handler({ query: z.object({ q: z.string().optional() }) }, async ({ query }) => {
  const where = query.q ? or(ilike(schema.users.name, `%${query.q}%`), ilike(schema.users.phone, `%${query.q}%`), ilike(schema.users.email, `%${query.q}%`)) : undefined;
  const rows = await db().select().from(schema.users).where(where).orderBy(desc(schema.users.createdAt)).limit(100);
  return rows.map((u) => ({ ...publicUser(u), blocked: u.blocked }));
}));

adminRoutes.get('/admin/users/:id', handler({}, async ({ req }) => {
  const id = String(req.params.id);
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) throw new HttpError(404, 'not_found');
  const sessions = await db().select().from(schema.sessions).where(eq(schema.sessions.userId, id)).orderBy(desc(schema.sessions.requestedAt)).limit(50);
  const ledger = await db().select().from(schema.ledger).where(and(eq(schema.ledger.account, 'user'), eq(schema.ledger.ownerId, id))).orderBy(desc(schema.ledger.createdAt)).limit(100);
  const payments = await db().select().from(schema.payments).where(eq(schema.payments.userId, id)).orderBy(desc(schema.payments.createdAt));
  return { user: { ...publicUser(u), blocked: u.blocked, deviceId: u.deviceId }, sessions, ledger, payments };
}));

adminRoutes.post('/admin/users/:id/block', handler({ body: z.object({ blocked: z.boolean() }) }, async ({ req, body }) => {
  await db().update(schema.users).set({ blocked: body.blocked }).where(eq(schema.users.id, String(req.params.id)));
}));

adminRoutes.post('/admin/users/:id/wallet-adjust', handler({
  body: z.object({ amountPaise: z.number().int().refine((n) => n !== 0), reason: z.string().min(3), sessionId: z.string().uuid().optional() }),
}, async ({ req, body, user }) => {
  const id = String(req.params.id);
  const type = body.amountPaise > 0 ? 'refund' : 'adjustment';
  const balance = await db().transaction(async (tx) => {
    const b = await moveUserMoney(tx, id, body.amountPaise, type, { note: `${body.reason} (by admin ${user.id})`, sessionId: body.sessionId });
    await platformEntry(tx, -body.amountPaise, type, { note: body.reason, sessionId: body.sessionId });
    return b;
  });
  if (body.amountPaise > 0) await notify(id, 'payment', { title: 'Refund credited', body: `₹${(body.amountPaise / 100).toFixed(2)} has been added to your wallet.` });
  return { balancePaise: balance };
}));

// ---------- pandits & verification ----------
adminRoutes.get('/admin/pandits', handler({ query: z.object({ status: z.string().optional() }) }, async ({ query }) => {
  const rows = await db().select({ p: schema.pandits, phone: schema.users.phone }).from(schema.pandits)
    .innerJoin(schema.users, eq(schema.users.id, schema.pandits.userId))
    .where(query.status ? eq(schema.pandits.status, query.status) : undefined).orderBy(desc(schema.pandits.createdAt));
  return rows.map((r) => ({ ...r.p, phone: r.phone }));
}));

adminRoutes.get('/admin/pandits/:id', handler({}, async ({ req }) => {
  const id = String(req.params.id);
  const [p] = await db().select().from(schema.pandits).where(eq(schema.pandits.id, id));
  if (!p) throw new HttpError(404, 'not_found');
  const verifications = await db().select().from(schema.verifications).where(eq(schema.verifications.panditId, id)).orderBy(desc(schema.verifications.createdAt));
  const reviews = await db().select().from(schema.reviews).where(eq(schema.reviews.panditId, id)).orderBy(desc(schema.reviews.createdAt)).limit(50);
  return { pandit: p, verifications, reviews };
}));

adminRoutes.post('/admin/pandits/:id/review', handler({
  body: z.object({ decision: z.enum(['approved', 'rejected', 'suspended']), note: z.string().max(1000).optional() }),
}, async ({ req, body, user }) => {
  const id = String(req.params.id);
  const [p] = await db().update(schema.pandits).set({
    status: body.decision, approvedAt: body.decision === 'approved' ? new Date() : undefined, online: body.decision === 'approved' ? undefined : false,
  }).where(eq(schema.pandits.id, id)).returning();
  if (!p) throw new HttpError(404, 'not_found');
  const [v] = await db().select().from(schema.verifications).where(eq(schema.verifications.panditId, id)).orderBy(desc(schema.verifications.createdAt)).limit(1);
  if (v) await db().update(schema.verifications).set({ status: body.decision, reviewNote: body.note, reviewedBy: user.id, reviewedAt: new Date() }).where(eq(schema.verifications.id, v.id));
  const msg = body.decision === 'approved'
    ? { title: 'You are verified! ✓', body: 'Your Pandit profile is live. Switch to Pandit mode and go online to receive consultations.' }
    : body.decision === 'rejected'
      ? { title: 'Application update', body: `Your Pandit application needs changes${body.note ? `: ${body.note}` : '.'}` }
      : { title: 'Profile suspended', body: body.note ?? 'Please contact support.' };
  await notify(p.userId, 'pandit', msg);
  return p;
}));

adminRoutes.patch('/admin/pandits/:id', handler({
  body: z.object({ chatRatePaise: z.number().int().optional(), voiceRatePaise: z.number().int().optional(), videoRatePaise: z.number().int().optional(), participatesInFree: z.boolean().optional() }),
}, async ({ req, body }) => (await db().update(schema.pandits).set(body).where(eq(schema.pandits.id, String(req.params.id))).returning())[0]));

adminRoutes.get('/admin/payouts', handler({}, async () =>
  db().select({ po: schema.payouts, name: schema.pandits.displayName }).from(schema.payouts)
    .innerJoin(schema.pandits, eq(schema.pandits.id, schema.payouts.panditId)).orderBy(desc(schema.payouts.createdAt)).limit(200)));

adminRoutes.post('/admin/payouts/:id', handler({ body: z.object({ status: z.enum(['processing', 'paid', 'failed']), providerRef: z.string().optional() }) }, async ({ req, body }) =>
  db().transaction(async (tx) => {
    const [po] = await tx.select().from(schema.payouts).where(eq(schema.payouts.id, String(req.params.id))).for('update');
    if (!po) throw new HttpError(404, 'not_found');
    if (po.status === 'paid' || po.status === 'failed') throw new HttpError(409, 'payout_already_final');
    // A failed transfer returns the money to the Pandit's earnings balance.
    if (body.status === 'failed') await movePanditMoney(tx, po.panditId, po.amountPaise, 'adjustment', { note: `payout ${po.id} failed` });
    return (await tx.update(schema.payouts).set(body).where(eq(schema.payouts.id, po.id)).returning())[0];
  })));

// ---------- sessions, payments, complaints, reviews ----------
adminRoutes.get('/admin/sessions', handler({ query: z.object({ status: z.string().optional() }) }, async ({ query }) =>
  db().select().from(schema.sessions).where(query.status ? eq(schema.sessions.status, query.status) : undefined).orderBy(desc(schema.sessions.requestedAt)).limit(200)));

adminRoutes.get('/admin/sessions/:id/messages', handler({}, async ({ req }) =>
  db().select().from(schema.messages).where(eq(schema.messages.sessionId, String(req.params.id))).orderBy(schema.messages.createdAt)));

adminRoutes.get('/admin/payments', handler({ query: z.object({ status: z.string().optional() }) }, async ({ query }) =>
  db().select().from(schema.payments).where(query.status ? eq(schema.payments.status, query.status) : undefined).orderBy(desc(schema.payments.createdAt)).limit(200)));

adminRoutes.get('/admin/complaints', handler({}, async () =>
  db().select().from(schema.complaints).orderBy(desc(schema.complaints.createdAt)).limit(200)));

adminRoutes.post('/admin/complaints/:id', handler({ body: z.object({ status: z.enum(['open', 'resolved', 'rejected']), resolution: z.string().optional() }) }, async ({ req, body }) =>
  (await db().update(schema.complaints).set(body).where(eq(schema.complaints.id, String(req.params.id))).returning())[0]));

adminRoutes.post('/admin/reviews/:id/hide', handler({ body: z.object({ hidden: z.boolean() }) }, async ({ req, body }) => {
  await db().update(schema.reviews).set({ hidden: body.hidden }).where(eq(schema.reviews.id, String(req.params.id)));
}));

// ---------- pricing & promotions ----------
adminRoutes.get('/admin/settings', handler({}, async () => ({ values: await allSettings(), defaults: DEFAULT_SETTINGS })));

adminRoutes.put('/admin/settings', handler({ body: z.record(z.string(), z.unknown()) }, async ({ body }) => {
  for (const [k, v] of Object.entries(body)) {
    if (!(k in DEFAULT_SETTINGS)) throw new HttpError(400, 'unknown_setting', k);
    const def = DEFAULT_SETTINGS[k as SettingKey];
    if (typeof def !== typeof v || Array.isArray(def) !== Array.isArray(v)) throw new HttpError(400, 'bad_setting_type', k);
    if (typeof v === 'number' && (v < 0 || !Number.isFinite(v))) throw new HttpError(400, 'bad_setting_value', k);
    const ranges: Partial<Record<SettingKey, [number, number]>> = {
      'pandit.commission_pct': [0, 100], 'gst.pct': [0, 28], 'free.pandit_minutes': [0, 240], 'ai.idle_pause_seconds': [30, 1800],
      'ai.rate_per_min_paise': [0, 100_000], 'pandit.min_rate_paise': [100, 100_000], 'pandit.max_rate_paise': [100, 1_000_000],
    };
    const r = ranges[k as SettingKey];
    if (r && typeof v === 'number' && (v < r[0] || v > r[1])) throw new HttpError(400, 'bad_setting_value', `${k} must be ${r[0]}–${r[1]}`);
    await setSetting(k as SettingKey, v);
  }
  return allSettings();
}));

// ---------- broadcast notifications (each user gets it in their own language) ----------
adminRoutes.post('/admin/broadcast', handler({
  body: z.object({ title: z.string().min(2).max(80), body: z.string().min(2).max(240), language: z.string().optional() }),
}, async ({ body }) => {
  const users = await db().select({ id: schema.users.id, lang: schema.users.language, token: schema.users.pushToken, prefs: schema.users.notificationPrefs })
    .from(schema.users).where(and(eq(schema.users.blocked, false), body.language ? eq(schema.users.language, body.language) : undefined));
  const byLang = new Map<string, { title: string; body: string }>();
  for (const l of new Set(users.map((u) => u.lang))) byLang.set(l, { title: await translate(body.title, l, 'en'), body: await translate(body.body, l, 'en') });
  // Marketing is opt-in only (DPDP Act: separate, specific consent). Users who never turned it on get nothing.
  const pushes = users.filter((u) => u.token && u.prefs.campaigns === true).map((u) => ({ to: u.token!, ...byLang.get(u.lang)!, data: { kind: 'campaign' } }));
  for (let i = 0; i < pushes.length; i += 100) await sendPush(pushes.slice(i, i + 100));
  return { recipients: users.length, pushed: pushes.length };
}));
