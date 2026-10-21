import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env, isProd } from '../config/env.js';
import { db, schema } from '../db/client.js';
import { HttpError, signToken } from '../lib/http.js';
import { getSetting } from '../lib/settings.js';

const hash = (s: string) => createHash('sha256').update(`${env.jwtSecret}:${s}`).digest('hex');
export const normalisePhone = (p: string) => {
  const digits = p.replace(/\D/g, '');
  const n = digits.length === 10 ? `91${digits}` : digits;
  if (!/^\d{11,15}$/.test(n)) throw new HttpError(400, 'invalid_phone');
  return `+${n}`;
};

const RESEND_COOLDOWN_MS = 30_000;
const SEND_WINDOW_MS = 60 * 60_000;
const MAX_SENDS_PER_WINDOW = 5;

/** Sends a 6-digit code. Throttled per phone (30 s between sends, 5 per hour) to stop OTP bombing and SMS-pumping fraud. */
export async function sendOtp(rawPhone: string) {
  const phone = normalisePhone(rawPhone);
  const now = new Date();
  const [prev] = await db().select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
  const inWindow = prev?.windowStartedAt && now.getTime() - prev.windowStartedAt.getTime() < SEND_WINDOW_MS;
  if (prev?.lastSentAt && now.getTime() - prev.lastSentAt.getTime() < RESEND_COOLDOWN_MS) throw new HttpError(429, 'otp_cooldown');
  if (inWindow && prev.sendCount >= MAX_SENDS_PER_WINDOW) throw new HttpError(429, 'otp_limit');
  const code = String(randomInt(100000, 1000000));
  const row = {
    codeHash: hash(code), expiresAt: new Date(now.getTime() + 5 * 60_000), attempts: 0, lastSentAt: now,
    windowStartedAt: inWindow ? prev.windowStartedAt : now, sendCount: inWindow ? prev.sendCount + 1 : 1,
  };
  await db().insert(schema.otpCodes).values({ phone, ...row }).onConflictDoUpdate({ target: schema.otpCodes.phone, set: row });
  if (env.otpDevCode) return { phone }; // test mode: the shared test code works; never log real codes
  if (!env.msg91AuthKey) throw new HttpError(503, 'sms_not_configured');
  const r = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: env.msg91AuthKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: env.msg91TemplateId, recipients: [{ mobiles: phone.slice(1), otp: code }] }),
  });
  if (!r.ok) throw new HttpError(502, 'sms_failed');
  return { phone };
}

/** Checks a code with a 5-attempt limit and constant-time comparison. Used by login and by phone linking. */
async function checkOtp(phone: string, code: string) {
  const devOk = !isProd && env.otpDevCode && code === env.otpDevCode;
  if (devOk) return;
  const [row] = await db().select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
  if (!row || row.expiresAt < new Date()) throw new HttpError(400, 'otp_expired');
  if (row.attempts >= 5) throw new HttpError(429, 'too_many_attempts');
  await db().update(schema.otpCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.otpCodes.phone, phone));
  const ok = timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(hash(code)));
  if (!ok) throw new HttpError(400, 'otp_invalid');
  // Keep the throttle counters; just invalidate the code.
  await db().update(schema.otpCodes).set({ expiresAt: new Date(0) }).where(eq(schema.otpCodes.phone, phone));
}

export async function verifyOtp(rawPhone: string, code: string, deviceId?: string) {
  const phone = normalisePhone(rawPhone);
  await checkOtp(phone, code);
  let [user] = await db().select().from(schema.users).where(eq(schema.users.phone, phone));
  const isNew = !user;
  if (!user) {
    [user] = await db().insert(schema.users).values({ phone, deviceId, role: env.adminPhones.includes(phone) ? 'admin' : 'user' }).returning();
  }
  await grantFreeMinutes(user.id, deviceId);
  return session(user.id, isNew);
}

/** Free minutes are granted once per verified phone AND device, to limit abuse with throwaway numbers. */
async function grantFreeMinutes(userId: string, deviceId?: string) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (u.freeGranted || !u.phone) return;
  // A phone gets free minutes once, ever — even if the account is deleted and created again.
  const phoneHash = hash(`free:${u.phone}`);
  const [already] = await db().select().from(schema.freeGrants).where(eq(schema.freeGrants.phoneHash, phoneHash));
  let deviceUsed = Boolean(already);
  if (deviceId) {
    const others = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.deviceId, deviceId));
    deviceUsed = deviceUsed || others.some((o) => o.id !== userId);
  }
  if (!already) await db().insert(schema.freeGrants).values({ phoneHash }).onConflictDoNothing();
  const minutes = await getSetting('free.pandit_minutes');
  await db().update(schema.users).set({
    freeGranted: true, freeSecondsRemaining: deviceUsed ? 0 : minutes * 60, deviceId: deviceId ?? u.deviceId,
  }).where(eq(schema.users.id, userId));
}

const googleJwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const appleJwks = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export async function socialLogin(provider: 'google' | 'apple', idToken: string, name?: string) {
  const { payload } = provider === 'google'
    ? await jwtVerify(idToken, googleJwks, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: env.googleClientIds })
    : await jwtVerify(idToken, appleJwks, { issuer: 'https://appleid.apple.com', audience: env.appleBundleId });
  const sub = String(payload.sub);
  const email = typeof payload.email === 'string' ? payload.email : null;
  const col = provider === 'google' ? schema.users.googleSub : schema.users.appleSub;
  let [user] = await db().select().from(schema.users).where(eq(col, sub));
  const isNew = !user;
  if (!user) {
    [user] = await db().insert(schema.users).values({
      [provider === 'google' ? 'googleSub' : 'appleSub']: sub, email, name: name ?? (payload.name as string | undefined) ?? null,
    }).returning();
  }
  // Social sign-in does not grant free minutes until a phone number is verified (see /auth/link-phone).
  return session(user.id, isNew);
}

async function session(userId: string, isNew: boolean) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (u.blocked) throw new HttpError(403, 'account_blocked');
  return { token: signToken({ id: u.id, role: u.role, tv: u.tokenVersion }), isNew, user: u };
}

export async function linkPhone(userId: string, rawPhone: string, code: string, deviceId?: string) {
  const phone = normalisePhone(rawPhone);
  await checkOtp(phone, code);
  const [taken] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, phone));
  if (taken && taken.id !== userId) throw new HttpError(409, 'phone_in_use');
  await db().update(schema.users).set({ phone }).where(eq(schema.users.id, userId));
  await grantFreeMinutes(userId, deviceId);
}
