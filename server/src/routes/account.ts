import { Router } from 'express';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import path from 'node:path';
import { UPLOAD_DIR } from './reports.js';
import { z } from 'zod';
import { LANGUAGE_CODES } from '../config/languages.js';
import { db, schema } from '../db/client.js';
import { handler, HttpError, requireAuth } from '../lib/http.js';
import { linkPhone, sendOtp, socialLogin, verifyOtp } from '../services/auth.js';
import { track } from '../services/analytics.js';

export const accountRoutes = Router();

accountRoutes.post('/auth/otp/send', handler({ body: z.object({ phone: z.string().max(20) }) }, ({ body }) => sendOtp(body.phone)));

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
  body: z.object({ phone: z.string().max(20), code: z.string().min(4).max(8), deviceId: z.string().max(200).optional() }),
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

/** Current legal documents version. Bump when Terms/Privacy change materially; the app asks users to accept again. */
export const TERMS_VERSION = '2026-10-22';

/** Records the user's consent (DPDP Act s.6): terms + privacy notice, 18+ confirmation, and separate optional marketing. */
accountRoutes.post('/me/consent', requireAuth, handler({
  body: z.object({ termsVersion: z.literal(TERMS_VERSION), ageConfirmed: z.literal(true), marketing: z.boolean().default(false) }),
}, async ({ body, user }) => {
  const now = new Date();
  const [u] = await db().select({ prefs: schema.users.notificationPrefs }).from(schema.users).where(eq(schema.users.id, user.id));
  await db().update(schema.users).set({
    termsVersion: body.termsVersion, termsAcceptedAt: now, ageConfirmedAt: now, marketingConsent: body.marketing,
    notificationPrefs: { ...u.prefs, campaigns: body.marketing },
  }).where(eq(schema.users.id, user.id));
  await track(user.id, 'consent_given', { termsVersion: body.termsVersion, marketing: body.marketing });
  return me(user.id);
}));

/** Signs out every device by invalidating all existing tokens. */
accountRoutes.post('/me/logout-all', requireAuth, handler({}, async ({ user }) => {
  await db().update(schema.users).set({ tokenVersion: sql`${schema.users.tokenVersion} + 1`, pushToken: null }).where(eq(schema.users.id, user.id));
}));

/** DPDP Act s.11 right to access: a copy of everything we hold about the user, as JSON. */
accountRoutes.get('/me/export', requireAuth, handler({}, async ({ user, res }) => {
  const id = user.id;
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, id));
  const sessions = await db().select().from(schema.sessions).where(eq(schema.sessions.userId, id));
  const sessionIds = sessions.map((x) => x.id);
  const data = {
    exportedAt: new Date().toISOString(),
    account: { ...publicUser(u), termsVersion: u.termsVersion, termsAcceptedAt: u.termsAcceptedAt, ageConfirmedAt: u.ageConfirmedAt, marketingConsent: u.marketingConsent },
    birthProfiles: await db().select().from(schema.birthProfiles).where(eq(schema.birthProfiles.userId, id)),
    consultations: sessions,
    messages: sessionIds.length ? await db().select().from(schema.messages).where(inArray(schema.messages.sessionId, sessionIds)) : [],
    wallet: await db().select().from(schema.ledger).where(and(eq(schema.ledger.account, 'user'), eq(schema.ledger.ownerId, id))),
    payments: await db().select().from(schema.payments).where(eq(schema.payments.userId, id)),
    reports: await db().select().from(schema.reports).where(eq(schema.reports.userId, id)),
    palmReadings: (await db().select().from(schema.palmReadings).where(eq(schema.palmReadings.userId, id))).map(({ imagePath: _p, ...r }) => r),
    reviews: await db().select().from(schema.reviews).where(eq(schema.reviews.userId, id)),
    complaints: await db().select().from(schema.complaints).where(eq(schema.complaints.userId, id)),
    blockedPandits: await db().select().from(schema.userBlocks).where(eq(schema.userBlocks.userId, id)),
  };
  res.setHeader('Content-Disposition', `attachment; filename="taara-data-${new Date().toISOString().slice(0, 10)}.json"`);
  return data;
}));

accountRoutes.post('/me/push-token', requireAuth, handler({ body: z.object({ token: z.string().max(300).nullable() }) }, async ({ body, user }) => {
  await db().update(schema.users).set({ pushToken: body.token }).where(eq(schema.users.id, user.id));
}));

/** App Store / Play require in-app account deletion. Personal data is removed; ledger rows are kept (anonymised) for tax law. */
accountRoutes.delete('/me', requireAuth, handler({}, async ({ user }) => {
  const [open] = await db().select({ id: schema.sessions.id }).from(schema.sessions)
    .where(and(eq(schema.sessions.userId, user.id), isNull(schema.sessions.endedAt)));
  if (open) throw new HttpError(409, 'end_session_first');
  const { rm } = await import('node:fs/promises');
  const files: string[] = [];
  await db().transaction(async (tx) => {
    await tx.update(schema.sessions).set({ profileId: null }).where(eq(schema.sessions.userId, user.id));
    // Pandit side: take the profile down and erase identity documents (ID proof, address, certificates).
    const [p] = await tx.select().from(schema.pandits).where(eq(schema.pandits.userId, user.id));
    if (p) {
      const vs = await tx.delete(schema.verifications).where(eq(schema.verifications.panditId, p.id)).returning();
      for (const v of vs) files.push(v.idDocUrl, ...v.certificateUrls);
      if (p.photoUrl) files.push(p.photoUrl);
      await tx.update(schema.pandits).set({ status: 'deleted', online: false, displayName: 'Deleted Pandit', bio: '', photoUrl: null, weeklyAvailability: {} })
        .where(eq(schema.pandits.id, p.id));
    }
    await tx.delete(schema.favorites).where(eq(schema.favorites.userId, user.id));
    await tx.delete(schema.userBlocks).where(eq(schema.userBlocks.userId, user.id));
    await tx.delete(schema.notifications).where(eq(schema.notifications.userId, user.id));
    await tx.update(schema.analyticsEvents).set({ userId: null }).where(eq(schema.analyticsEvents.userId, user.id));
    await tx.update(schema.reviews).set({ text: null }).where(eq(schema.reviews.userId, user.id));
    await tx.delete(schema.reports).where(eq(schema.reports.userId, user.id));
    await tx.delete(schema.birthProfiles).where(eq(schema.birthProfiles.userId, user.id));
    const palms = await tx.delete(schema.palmReadings).where(eq(schema.palmReadings.userId, user.id)).returning({ path: schema.palmReadings.imagePath });
    for (const pr of palms) files.push(pr.path);
    await tx.delete(schema.messages).where(sql`${schema.messages.sessionId} in (select id from sessions where user_id = ${user.id})`);
  });
  await db().update(schema.users).set({
    phone: null, email: null, googleSub: null, appleSub: null, name: 'Deleted user', pushToken: null, deviceId: null, blocked: true,
    gender: null, goal: null, tokenVersion: sql`${schema.users.tokenVersion} + 1`,
  }).where(eq(schema.users.id, user.id));
  // Remove stored files (palm photos, ID documents, profile photo). URLs map back to the upload folder.
  for (const f of files) {
    const local = f.startsWith('http') ? uploadPathFromUrl(f) : f;
    if (local) await rm(local, { force: true }).catch(() => {});
  }
}));

function uploadPathFromUrl(url: string) {
  const name = url.split('/').pop();
  if (!name || name.includes('..')) return null;
  const vis = url.includes('/admin/files/') ? 'private' : 'public';
  return path.join(UPLOAD_DIR, vis, name);
}

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
    // The app shows the consent screen when this is false (new users, or after the terms change).
    consentCurrent: u.termsVersion === TERMS_VERSION && Boolean(u.ageConfirmedAt),
    marketingConsent: u.marketingConsent,
  };
}
