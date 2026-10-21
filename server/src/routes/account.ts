import { Router } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { LANGUAGE_CODES } from '../config/languages.js';
import { db, schema } from '../db/client.js';
import { handler, HttpError, requireAuth } from '../lib/http.js';
import { linkPhone, sendOtp, socialLogin, verifyOtp } from '../services/auth.js';
import { track } from '../services/analytics.js';

export const accountRoutes = Router();

accountRoutes.post('/auth/otp/send', handler({ body: z.object({ phone: z.string() }) }, ({ body }) => sendOtp(body.phone)));

accountRoutes.post('/auth/otp/verify', handler({
  body: z.object({ phone: z.string(), code: z.string().min(4).max(8), deviceId: z.string().max(200).optional() }),
}, async ({ body }) => {
  const r = await verifyOtp(body.phone, body.code, body.deviceId);
  if (r.isNew) await track(r.user.id, 'signup_completed', { method: 'phone' });
  return { token: r.token, isNew: r.isNew, user: publicUser(r.user) };
}));

accountRoutes.post('/auth/social', handler({
  body: z.object({ provider: z.enum(['google', 'apple']), idToken: z.string(), name: z.string().max(100).optional() }),
}, async ({ body }) => {
  const r = await socialLogin(body.provider, body.idToken, body.name);
  if (r.isNew) await track(r.user.id, 'signup_completed', { method: body.provider });
  return { token: r.token, isNew: r.isNew, user: publicUser(r.user) };
}));

accountRoutes.post('/auth/link-phone', requireAuth, handler({
  body: z.object({ phone: z.string(), code: z.string(), deviceId: z.string().optional() }),
}, async ({ body, user }) => { await linkPhone(user.id, body.phone, body.code, body.deviceId); return me(user.id); }));

accountRoutes.get('/me', requireAuth, handler({}, ({ user }) => me(user.id)));

accountRoutes.patch('/me', requireAuth, handler({
  body: z.object({
    name: z.string().min(1).max(80).optional(),
    gender: z.enum(['male', 'female', 'other', 'prefer_not']).nullable().optional(),
    language: z.enum(LANGUAGE_CODES as [string, ...string[]]).optional(),
    theme: z.enum(['light', 'dark', 'system']).optional(),
    goal: z.string().max(40).nullable().optional(),
    notificationPrefs: z.record(z.string(), z.boolean()).optional(),
    aiProfileConsent: z.boolean().optional(),
  }),
}, async ({ body, user }) => {
  await db().update(schema.users).set(body).where(eq(schema.users.id, user.id));
  return me(user.id);
}));

accountRoutes.post('/me/push-token', requireAuth, handler({ body: z.object({ token: z.string().max(300).nullable() }) }, async ({ body, user }) => {
  await db().update(schema.users).set({ pushToken: body.token }).where(eq(schema.users.id, user.id));
}));

/** App Store / Play require in-app account deletion. Personal data is removed; ledger rows are kept (anonymised) for tax law. */
accountRoutes.delete('/me', requireAuth, handler({}, async ({ user }) => {
  const [open] = await db().select({ id: schema.sessions.id }).from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.endedAt)));
  if (open) throw new HttpError(409, 'end_session_first');
  await db().transaction(async (tx) => {
    await tx.update(schema.sessions).set({ profileId: null }).where(eq(schema.sessions.userId, user.id));
    await tx.delete(schema.reports).where(eq(schema.reports.userId, user.id));
    await tx.delete(schema.birthProfiles).where(eq(schema.birthProfiles.userId, user.id));
    const palms = await tx.delete(schema.palmReadings).where(eq(schema.palmReadings.userId, user.id)).returning({ path: schema.palmReadings.imagePath });
    const { rm } = await import('node:fs/promises');
    for (const p of palms) await rm(p.path, { force: true });
    await tx.delete(schema.messages).where(sql`${schema.messages.sessionId} in (select id from sessions where user_id = ${user.id})`);
  });
  await db().update(schema.users).set({
    phone: null, email: null, googleSub: null, appleSub: null, name: 'Deleted user', pushToken: null, deviceId: null, blocked: true,
  }).where(eq(schema.users.id, user.id));
}));

accountRoutes.get('/notifications', requireAuth, handler({}, async ({ user }) =>
  db().select().from(schema.notifications).where(eq(schema.notifications.userId, user.id)).orderBy(desc(schema.notifications.createdAt)).limit(50)));

accountRoutes.post('/notifications/read', requireAuth, handler({}, async ({ user }) => {
  await db().update(schema.notifications).set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
}));

accountRoutes.post('/events', requireAuth, handler({
  body: z.object({ name: z.string().max(60), props: z.record(z.string(), z.unknown()).optional() }),
}, async ({ body, user }) => { await track(user.id, body.name, body.props ?? {}); }));

export async function me(userId: string) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  const [pandit] = await db().select({ id: schema.pandits.id, status: schema.pandits.status }).from(schema.pandits).where(eq(schema.pandits.userId, userId));
  const profiles = await db().select().from(schema.birthProfiles).where(eq(schema.birthProfiles.userId, userId));
  return { ...publicUser(u), pandit: pandit ?? null, profiles };
}

export function publicUser(u: typeof schema.users.$inferSelect) {
  return {
    id: u.id, name: u.name, phone: u.phone, email: u.email, gender: u.gender, language: u.language, theme: u.theme, goal: u.goal,
    role: u.role, balancePaise: u.balancePaise, freeSecondsRemaining: u.freeSecondsRemaining, notificationPrefs: u.notificationPrefs,
    aiProfileConsent: u.aiProfileConsent, createdAt: u.createdAt,
  };
}
