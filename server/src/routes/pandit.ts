import { Router } from 'express';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { LANGUAGE_CODES } from '../config/languages.js';
import { db, schema } from '../db/client.js';
import { handler, HttpError, requireAuth } from '../lib/http.js';
import { allSettings } from '../lib/settings.js';
import { respondToRequest } from '../services/billing.js';
import { movePanditMoney } from '../services/wallet.js';
import { track } from '../services/analytics.js';
import { publicPandit } from './consult.js';
import { env } from '../config/env.js';
import { requireAdult } from '../services/safety.js';

/** Uploaded files must be ours (from POST /uploads), never arbitrary external links. */
const ownUpload = z.string().url().refine((u) => u.startsWith(`${env.publicUrl}/`), 'must_be_uploaded_file');

export const panditRoutes = Router();
panditRoutes.use('/pandit', requireAuth);

const SPECIALTIES = ['vedic', 'kundli', 'marriage', 'career', 'finance', 'love', 'health', 'vastu', 'numerology', 'tarot', 'palmistry', 'prashna', 'muhurat', 'remedies'] as const;
const lang = z.enum(LANGUAGE_CODES as [string, ...string[]]);
const slot = z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) });

async function myPandit(userId: string) {
  const [p] = await db().select().from(schema.pandits).where(eq(schema.pandits.userId, userId));
  if (!p) throw new HttpError(404, 'not_a_pandit');
  return p;
}

async function checkRates(r: { chatRatePaise?: number; voiceRatePaise?: number; videoRatePaise?: number }) {
  const s = await allSettings();
  for (const v of [r.chatRatePaise, r.voiceRatePaise, r.videoRatePaise]) {
    if (v !== undefined && (v < s['pandit.min_rate_paise'] || v > s['pandit.max_rate_paise'])) {
      throw new HttpError(400, 'rate_out_of_range', `Rates must be between ₹${s['pandit.min_rate_paise'] / 100} and ₹${s['pandit.max_rate_paise'] / 100} per minute`);
    }
  }
}

panditRoutes.post('/pandit/apply', handler({
  body: z.object({
    displayName: z.string().min(2).max(80), bio: z.string().max(2000), experienceYears: z.number().int().min(0).max(70),
    specializations: z.array(z.enum(SPECIALTIES)).min(1), languages: z.array(lang).min(1), replyLanguage: lang,
    photoUrl: ownUpload.optional(),
    chatRatePaise: z.number().int(), voiceRatePaise: z.number().int(), videoRatePaise: z.number().int(),
    acceptConduct: z.literal(true), // Pandit Code of Conduct must be accepted
    verification: z.object({
      fullName: z.string().min(2), email: z.string().email().optional(), address: z.string().min(5),
      idDocType: z.enum(['aadhaar_masked', 'pan', 'passport', 'voter_id', 'driving_licence']), idDocUrl: ownUpload,
      certificateUrls: z.array(ownUpload).max(10).default([]),
      payoutAccountRef: z.string().max(100).optional(), payoutAccountHint: z.string().max(20).optional(),
    }),
  }),
}, async ({ body, user }) => {
  const [existing] = await db().select().from(schema.pandits).where(eq(schema.pandits.userId, user.id));
  if (existing && existing.status !== 'rejected') throw new HttpError(409, 'already_applied');
  await requireAdult(user.id);
  await checkRates(body);
  const { verification, acceptConduct: _ac, ...fields } = body;
  const profile = { ...fields, conductAcceptedAt: new Date() };
  const p = await db().transaction(async (tx) => {
    const [row] = existing
      ? await tx.update(schema.pandits).set({ ...profile, status: 'pending' }).where(eq(schema.pandits.id, existing.id)).returning()
      : await tx.insert(schema.pandits).values({ ...profile, userId: user.id, status: 'pending' }).returning();
    await tx.insert(schema.verifications).values({ ...verification, panditId: row.id });
    return row;
  });
  await track(user.id, 'pandit_applied');
  return publicPandit(p);
}));

panditRoutes.get('/pandit/me', handler({}, async ({ user }) => {
  const p = await myPandit(user.id);
  const [v] = await db().select({ status: schema.verifications.status, reviewNote: schema.verifications.reviewNote })
    .from(schema.verifications).where(eq(schema.verifications.panditId, p.id)).orderBy(desc(schema.verifications.createdAt)).limit(1);
  return { ...publicPandit(p), status: p.status, replyLanguage: p.replyLanguage, earningsPaise: p.earningsPaise, verification: v ?? null };
}));

panditRoutes.patch('/pandit/me', handler({
  body: z.object({
    bio: z.string().max(2000).optional(), photoUrl: ownUpload.nullable().optional(),
    specializations: z.array(z.enum(SPECIALTIES)).min(1).optional(), languages: z.array(lang).min(1).optional(), replyLanguage: lang.optional(),
    chatRatePaise: z.number().int().optional(), voiceRatePaise: z.number().int().optional(), videoRatePaise: z.number().int().optional(),
    participatesInFree: z.boolean().optional(), weeklyAvailability: z.record(z.string(), z.array(slot)).optional(),
  }),
}, async ({ body, user }) => {
  const p = await myPandit(user.id);
  await checkRates(body);
  const [u] = await db().update(schema.pandits).set(body).where(eq(schema.pandits.id, p.id)).returning();
  return publicPandit(u);
}));

panditRoutes.post('/pandit/online', handler({ body: z.object({ online: z.boolean() }) }, async ({ body, user }) => {
  const p = await myPandit(user.id);
  if (p.status !== 'approved') throw new HttpError(403, 'not_approved');
  await db().update(schema.pandits).set({ online: body.online }).where(eq(schema.pandits.id, p.id));
  return { online: body.online };
}));

panditRoutes.get('/pandit/sessions', handler({ query: z.object({ status: z.string().optional() }) }, async ({ query, user }) => {
  const p = await myPandit(user.id);
  const rows = await db().select({ s: schema.sessions, userName: schema.users.name }).from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(query.status ? and(eq(schema.sessions.panditId, p.id), eq(schema.sessions.status, query.status)) : eq(schema.sessions.panditId, p.id))
    .orderBy(desc(schema.sessions.requestedAt)).limit(100);
  return rows.map((r) => ({ ...r.s, userName: r.userName ?? 'User' }));
}));

panditRoutes.post('/pandit/sessions/:id/respond', handler({ body: z.object({ accept: z.boolean() }) }, async ({ req, body, user }) => {
  const s = await respondToRequest(user.id, String(req.params.id), body.accept);
  if (body.accept) await track(s.userId, 'pandit_session_started');
  return s;
}));

/** Birth details the user chose to share with the Pandit for this session. */
panditRoutes.get('/pandit/sessions/:id/client', handler({}, async ({ req, user }) => {
  const p = await myPandit(user.id);
  const [s] = await db().select().from(schema.sessions).where(and(eq(schema.sessions.id, String(req.params.id)), eq(schema.sessions.panditId, p.id)));
  if (!s) throw new HttpError(404, 'session_not_found');
  // Data minimisation: a Pandit sees shared birth details only during the consultation and for 7 days after.
  if (s.endedAt && Date.now() - s.endedAt.getTime() > 7 * 86_400_000) return { profile: null, expired: true };
  if (!s.profileId) return { profile: null };
  const [bp] = await db().select().from(schema.birthProfiles).where(eq(schema.birthProfiles.id, s.profileId));
  return { profile: bp ? { name: bp.name, date: bp.date, time: bp.time, timeAccuracy: bp.timeAccuracy, placeName: bp.placeName, lat: bp.lat, lon: bp.lon, tzOffsetMinutes: bp.tzOffsetMinutes } : null };
}));

panditRoutes.get('/pandit/earnings', handler({}, async ({ user }) => {
  const p = await myPandit(user.id);
  const since = (days: number) => new Date(Date.now() - days * 86_400_000);
  const sum = async (from: Date) => Number((await db().select({ s: sql<number>`coalesce(sum(${schema.ledger.amountPaise}),0)` }).from(schema.ledger)
    .where(and(eq(schema.ledger.account, 'pandit'), eq(schema.ledger.ownerId, p.id), gte(schema.ledger.createdAt, from), sql`${schema.ledger.amountPaise} > 0`)))[0].s);
  const ledger = await db().select().from(schema.ledger).where(and(eq(schema.ledger.account, 'pandit'), eq(schema.ledger.ownerId, p.id)))
    .orderBy(desc(schema.ledger.createdAt)).limit(100);
  const payouts = await db().select().from(schema.payouts).where(eq(schema.payouts.panditId, p.id)).orderBy(desc(schema.payouts.createdAt)).limit(20);
  const s = await allSettings();
  return {
    balancePaise: p.earningsPaise, todayPaise: await sum(since(1)), weekPaise: await sum(since(7)), monthPaise: await sum(since(30)),
    totalSessions: p.totalSessions, totalMinutes: Math.round(p.totalSeconds / 60), commissionPct: s['pandit.commission_pct'],
    minPayoutPaise: s['pandit.min_payout_paise'], ledger, payouts,
  };
}));

panditRoutes.post('/pandit/payouts', handler({}, async ({ user }) => {
  const p = await myPandit(user.id);
  const min = (await allSettings())['pandit.min_payout_paise'];
  if (p.earningsPaise < min) throw new HttpError(400, 'below_minimum_payout');
  return db().transaction(async (tx) => {
    const [po] = await tx.insert(schema.payouts).values({ panditId: p.id, amountPaise: p.earningsPaise }).returning();
    await movePanditMoney(tx, p.id, -p.earningsPaise, 'payout', { note: po.id });
    return po;
  });
}));
