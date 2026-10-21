import express, { Router } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { handler, HttpError, requireAuth } from '../lib/http.js';
import { consentToPaid, endSession, publicSession, recordActivity, startSession } from '../services/billing.js';
import { aiReply, chartContext } from '../services/ai.js';
import { speechToText, textToSpeech } from '../services/voice.js';
import { track } from '../services/analytics.js';
import { ownProfile } from './astro.js';
import { own as ownPalm, palmContext } from '../services/palm.js';
import { isBlocked, maskContacts, rateLimit, requireAdult, stripCare, waiveSession } from '../services/safety.js';
import { authenticate } from '../lib/http.js';

/** Reads the token if present (for public endpoints that personalise when signed in). */
async function optionalUser(req: express.Request) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return authenticate(h.slice(7)).catch(() => null);
}

export const consultRoutes = Router();

export function publicPandit(p: typeof schema.pandits.$inferSelect) {
  return {
    id: p.id, displayName: p.displayName, photoUrl: p.photoUrl, bio: p.bio, experienceYears: p.experienceYears,
    specializations: p.specializations, languages: p.languages, verified: p.status === 'approved',
    chatRatePaise: p.chatRatePaise, voiceRatePaise: p.voiceRatePaise, videoRatePaise: p.videoRatePaise,
    participatesInFree: p.participatesInFree, online: p.online, busy: p.busy,
    rating: p.ratingCount ? Math.round((p.ratingSum / p.ratingCount) * 10) / 10 : null, ratingCount: p.ratingCount,
    totalSessions: p.totalSessions, weeklyAvailability: p.weeklyAvailability,
  };
}

consultRoutes.get('/pandits', handler({
  query: z.object({
    lang: z.string().optional(), specialty: z.string().optional(), online: z.enum(['true', 'false']).optional(),
    free: z.enum(['true', 'false']).optional(), sort: z.enum(['recommended', 'price_low', 'price_high', 'rating', 'experience']).default('recommended'),
    q: z.string().optional(),
  }),
}, async ({ query, req }) => {
  let rows = await db().select().from(schema.pandits).where(eq(schema.pandits.status, 'approved'));
  const me = await optionalUser(req);
  if (me) {
    const blocked = new Set((await db().select({ id: schema.userBlocks.panditId }).from(schema.userBlocks).where(eq(schema.userBlocks.userId, me.id))).map((b) => b.id));
    rows = rows.filter((p) => !blocked.has(p.id) && p.userId !== me.id);
  }
  if (query.lang) rows = rows.filter((p) => p.languages.includes(query.lang!));
  if (query.specialty) rows = rows.filter((p) => p.specializations.includes(query.specialty!));
  if (query.online === 'true') rows = rows.filter((p) => p.online);
  if (query.free === 'true') rows = rows.filter((p) => p.participatesInFree);
  if (query.q) { const q = query.q.toLowerCase(); rows = rows.filter((p) => p.displayName.toLowerCase().includes(q)); }
  const rating = (p: typeof rows[number]) => (p.ratingCount ? p.ratingSum / p.ratingCount : 0);
  const sorters: Record<string, (a: typeof rows[number], b: typeof rows[number]) => number> = {
    recommended: (a, b) => Number(b.online && !b.busy) - Number(a.online && !a.busy) || rating(b) - rating(a) || b.totalSessions - a.totalSessions,
    price_low: (a, b) => a.chatRatePaise - b.chatRatePaise,
    price_high: (a, b) => b.chatRatePaise - a.chatRatePaise,
    rating: (a, b) => rating(b) - rating(a),
    experience: (a, b) => b.experienceYears - a.experienceYears,
  };
  return rows.sort(sorters[query.sort]).map(publicPandit);
}));

consultRoutes.get('/pandits/:id', handler({}, async ({ req }) => {
  const [p] = await db().select().from(schema.pandits).where(and(eq(schema.pandits.id, String(req.params.id)), eq(schema.pandits.status, 'approved')));
  if (!p) throw new HttpError(404, 'pandit_not_found');
  const reviews = await db().select({ rating: schema.reviews.rating, text: schema.reviews.text, createdAt: schema.reviews.createdAt, name: schema.users.name })
    .from(schema.reviews).innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .where(and(eq(schema.reviews.panditId, p.id), eq(schema.reviews.hidden, false))).orderBy(desc(schema.reviews.createdAt)).limit(30);
  return { ...publicPandit(p), reviews: reviews.map((r) => ({ ...r, name: r.name ? r.name.split(' ')[0] : 'User' })) };
}));

consultRoutes.get('/favorites', requireAuth, handler({}, async ({ user }) => {
  const favs = await db().select({ panditId: schema.favorites.panditId }).from(schema.favorites).where(eq(schema.favorites.userId, user.id));
  if (!favs.length) return [];
  const rows = await db().select().from(schema.pandits).where(inArray(schema.pandits.id, favs.map((f) => f.panditId)));
  return rows.map(publicPandit);
}));
consultRoutes.put('/favorites/:panditId', requireAuth, handler({}, async ({ req, user }) => {
  await db().insert(schema.favorites).values({ userId: user.id, panditId: z.string().uuid().parse(req.params.panditId) }).onConflictDoNothing();
}));
consultRoutes.delete('/favorites/:panditId', requireAuth, handler({}, async ({ req, user }) => {
  await db().delete(schema.favorites).where(and(eq(schema.favorites.userId, user.id), eq(schema.favorites.panditId, String(req.params.panditId))));
}));

// ---------- sessions ----------
consultRoutes.post('/sessions', requireAuth, handler({
  body: z.object({
    kind: z.enum(['ai', 'pandit']), mode: z.enum(['chat', 'voice', 'video']),
    panditId: z.string().uuid().optional(), profileId: z.string().uuid().optional(), palmReadingId: z.string().uuid().optional(),
  }),
}, async ({ body, user }) => {
  if (body.profileId) await ownProfile(body.profileId, user.id);
  if (body.palmReadingId) await ownPalm(user.id, body.palmReadingId);
  if (body.kind === 'pandit' && body.mode !== 'chat') throw new HttpError(501, 'calls_coming_soon');
  await requireAdult(user.id);
  if (body.kind === 'pandit') {
    if (!body.panditId) throw new HttpError(400, 'pandit_required');
    if (await isBlocked(user.id, body.panditId)) throw new HttpError(403, 'pandit_blocked');
    const [p] = await db().select({ userId: schema.pandits.userId }).from(schema.pandits).where(eq(schema.pandits.id, body.panditId));
    if (p?.userId === user.id) throw new HttpError(400, 'cannot_consult_self');
  }
  const s = await startSession({ userId: user.id, ...body });
  await track(user.id, body.kind === 'ai' ? 'ai_session_started' : 'pandit_session_requested', { mode: body.mode });
  return s;
}));

consultRoutes.get('/sessions', requireAuth, handler({}, async ({ user }) => {
  const rows = await db().select({ s: schema.sessions, panditName: schema.pandits.displayName, panditPhoto: schema.pandits.photoUrl })
    .from(schema.sessions).leftJoin(schema.pandits, eq(schema.pandits.id, schema.sessions.panditId))
    .where(eq(schema.sessions.userId, user.id)).orderBy(desc(schema.sessions.requestedAt)).limit(50);
  return rows.map((r) => ({ ...r.s, panditName: r.panditName, panditPhoto: r.panditPhoto }));
}));

consultRoutes.get('/sessions/:id', requireAuth, handler({}, async ({ req, user }) => {
  const s = await accessible(String(req.params.id), user.id);
  let pandit = null;
  if (s.panditId) { const [p] = await db().select().from(schema.pandits).where(eq(schema.pandits.id, s.panditId)); pandit = publicPandit(p); }
  const [u] = await db().select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, s.userId));
  // A pandit sees the user's first name, never their wallet balance.
  const forPandit = s.userId !== user.id;
  return { ...s, pandit, userName: u?.name?.split(' ')[0] ?? 'User', ...(forPandit ? { balancePaise: undefined, freeSecondsRemaining: undefined } : {}) };
}));

consultRoutes.get('/sessions/:id/messages', requireAuth, handler({}, async ({ req, user }) => {
  await accessible(String(req.params.id), user.id);
  return db().select().from(schema.messages).where(eq(schema.messages.sessionId, String(req.params.id))).orderBy(asc(schema.messages.createdAt));
}));

consultRoutes.post('/sessions/:id/consent', requireAuth, handler({ body: z.object({ accept: z.boolean() }) }, ({ req, body, user }) =>
  consentToPaid(user.id, String(req.params.id), body.accept)));

consultRoutes.post('/sessions/:id/end', requireAuth, handler({}, ({ req, user }) => endSession(String(req.params.id), user.id, 'ended_by_participant')));

consultRoutes.post('/sessions/:id/review', requireAuth, handler({
  body: z.object({ rating: z.number().int().min(1).max(5), text: z.string().max(1000).optional() }),
}, async ({ req, body, user }) => {
  const [s] = await db().select().from(schema.sessions).where(eq(schema.sessions.id, String(req.params.id)));
  if (!s || s.userId !== user.id || !s.panditId) throw new HttpError(404, 'session_not_found');
  if (s.status !== 'ended') throw new HttpError(409, 'session_not_ended');
  await db().transaction(async (tx) => {
    // Reviews are public: strip contact details and links.
    const text = body.text ? maskContacts(body.text).text : undefined;
    await tx.insert(schema.reviews).values({ sessionId: s.id, userId: user.id, panditId: s.panditId!, rating: body.rating, text });
    await tx.update(schema.pandits).set({
      ratingSum: sql`${schema.pandits.ratingSum} + ${body.rating}`, ratingCount: sql`${schema.pandits.ratingCount} + 1`,
    }).where(eq(schema.pandits.id, s.panditId!));
  });
}));

consultRoutes.post('/complaints', requireAuth, handler({
  body: z.object({
    sessionId: z.string().uuid().optional(), messageId: z.string().uuid().optional(), reviewId: z.string().uuid().optional(),
    panditId: z.string().uuid().optional(),
    category: z.enum(['billing', 'pandit_behaviour', 'ai_answer', 'technical', 'abusive_message', 'fake_review', 'privacy', 'other']),
    text: z.string().trim().min(5).max(2000),
  }),
}, async ({ body, user }) => {
  rateLimit(`complaint:${user.id}`, 5, 5);
  if (body.sessionId) await accessible(body.sessionId, user.id);
  const [c] = await db().insert(schema.complaints).values({ ...body, userId: user.id }).returning();
  // IT Rules 2021: complaints are acknowledged within 24 hours; we acknowledge instantly with a reference number.
  return { id: c.id, reference: c.id.slice(0, 8).toUpperCase(), acknowledgedAt: c.createdAt };
}));

consultRoutes.get('/complaints', requireAuth, handler({}, async ({ user }) =>
  db().select().from(schema.complaints).where(eq(schema.complaints.userId, user.id)).orderBy(desc(schema.complaints.createdAt)).limit(50)));

// ---------- blocking (App Store 1.2 / Play UGC policy) ----------
consultRoutes.get('/blocks', requireAuth, handler({}, async ({ user }) => {
  const rows = await db().select({ id: schema.pandits.id, displayName: schema.pandits.displayName, photoUrl: schema.pandits.photoUrl })
    .from(schema.userBlocks).innerJoin(schema.pandits, eq(schema.pandits.id, schema.userBlocks.panditId)).where(eq(schema.userBlocks.userId, user.id));
  return rows;
}));
consultRoutes.put('/blocks/:panditId', requireAuth, handler({}, async ({ req, user }) => {
  const panditId = z.string().uuid().parse(req.params.panditId);
  await db().insert(schema.userBlocks).values({ userId: user.id, panditId }).onConflictDoNothing();
  await db().delete(schema.favorites).where(and(eq(schema.favorites.userId, user.id), eq(schema.favorites.panditId, panditId)));
  // End any open session with this Pandit right away.
  const open = await db().select({ id: schema.sessions.id }).from(schema.sessions).where(and(eq(schema.sessions.userId, user.id), eq(schema.sessions.panditId, panditId),
    inArray(schema.sessions.status, ['requested', 'active', 'awaiting_consent', 'paused'])));
  for (const o of open) await endSession(o.id, user.id, 'blocked_by_user');
}));
consultRoutes.delete('/blocks/:panditId', requireAuth, handler({}, async ({ req, user }) => {
  await db().delete(schema.userBlocks).where(and(eq(schema.userBlocks.userId, user.id), eq(schema.userBlocks.panditId, String(req.params.panditId))));
}));

/** AI voice turn: audio in → transcript → AI reply → speech out. Body is the raw audio (audio/m4a or audio/wav). */
consultRoutes.post('/sessions/:id/voice', requireAuth, express.raw({ type: 'audio/*', limit: '8mb' }), handler({}, async ({ req, user }) => {
  const s = await accessible(String(req.params.id), user.id);
  if (s.kind !== 'ai' || s.mode !== 'voice') throw new HttpError(400, 'not_ai_voice_session');
  if (s.status !== 'active' && s.status !== 'paused') throw new HttpError(409, 'session_not_active');
  const audio = req.body as Buffer;
  if (!Buffer.isBuffer(audio) || audio.length < 1000) throw new HttpError(400, 'audio_missing');
  const { transcript } = await speechToText(audio, req.header('content-type') ?? 'audio/m4a', s.userLanguage);
  if (!transcript) return { transcript: '', reply: null, audioBase64: null };
  await recordActivity(s.id, 'user'); // resumes a paused session
  await db().insert(schema.messages).values({ sessionId: s.id, sender: 'user', text: transcript, lang: s.userLanguage });
  const chartText = await chartFor(s);
  rateLimit(`voice:${user.id}`, 12, 4);
  const { reply, care } = stripCare(await aiReply({ sessionId: s.id, lang: s.userLanguage, chartText, voice: true }));
  if (care) await waiveSession(s.id);
  const audioBase64 = await textToSpeech(reply, s.userLanguage).catch(() => null);
  const [m] = await db().insert(schema.messages).values({ sessionId: s.id, sender: 'ai', text: reply, lang: s.userLanguage }).returning();
  return { transcript, reply, messageId: m.id, audioBase64, care, session: await publicSession(s.id) };
}));

/** Everything the AI may know for this session: the birth chart (if the user allows it) and, for palm chats, the palm reading. */
export async function chartFor(s: { userId: string; profileId: string | null; palmReadingId?: string | null }) {
  const palm = s.palmReadingId ? await palmContext(s.palmReadingId) : null;
  const chart = await birthChartFor(s);
  if (!palm) return chart;
  return `${palm}\nThe user wants to talk about this palm reading; answer as a palm-reading guide, and use the chart below only if relevant.\n\n${chart ?? ''}`;
}

async function birthChartFor(s: { userId: string; profileId: string | null }) {
  const [u] = await db().select({ consent: schema.users.aiProfileConsent }).from(schema.users).where(eq(schema.users.id, s.userId));
  if (!u?.consent) return null;
  const [p] = s.profileId
    ? await db().select().from(schema.birthProfiles).where(eq(schema.birthProfiles.id, s.profileId))
    : await db().select().from(schema.birthProfiles).where(and(eq(schema.birthProfiles.userId, s.userId), eq(schema.birthProfiles.isPrimary, true)));
  return p ? chartContext(p) : null;
}

export async function accessible(sessionId: string, userId: string) {
  const s = await publicSession(sessionId);
  if (s.userId !== userId && s.panditUserId !== userId) throw new HttpError(404, 'session_not_found');
  return s;
}
