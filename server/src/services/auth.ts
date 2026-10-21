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

export async function sendOtp(rawPhone: string) {
  const phone = normalisePhone(rawPhone);
  const code = String(randomInt(100000, 1000000));
  await db().insert(schema.otpCodes).values({ phone, codeHash: hash(code), expiresAt: new Date(Date.now() + 5 * 60_000), attempts: 0 })
    .onConflictDoUpdate({ target: schema.otpCodes.phone, set: { codeHash: hash(code), expiresAt: new Date(Date.now() + 5 * 60_000), attempts: 0 } });
  if (env.otpDevCode) { console.log(`[dev] OTP for ${phone}: ${code} (or ${env.otpDevCode})`); return { phone }; }
  if (!env.msg91AuthKey) throw new HttpError(503, 'sms_not_configured');
  const r = await fetch('https://control.msg91.com/api/v5/flow', {
    method: 'POST',
    headers: { authkey: env.msg91AuthKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: env.msg91TemplateId, recipients: [{ mobiles: phone.slice(1), otp: code }] }),
  });
  if (!r.ok) throw new HttpError(502, 'sms_failed');
  return { phone };
}

export async function verifyOtp(rawPhone: string, code: string, deviceId?: string) {
  const phone = normalisePhone(rawPhone);
  const devOk = !isProd && env.otpDevCode && code === env.otpDevCode;
  if (!devOk) {
    const [row] = await db().select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
    if (!row || row.expiresAt < new Date()) throw new HttpError(400, 'otp_expired');
    if (row.attempts >= 5) throw new HttpError(429, 'too_many_attempts');
    await db().update(schema.otpCodes).set({ attempts: row.attempts + 1 }).where(eq(schema.otpCodes.phone, phone));
    const ok = timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(hash(code)));
    if (!ok) throw new HttpError(400, 'otp_invalid');
    await db().delete(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
  }
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
  let deviceUsed = false;
  if (deviceId) {
    const others = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.deviceId, deviceId));
    deviceUsed = others.some((o) => o.id !== userId);
  }
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
  return { token: signToken({ id: u.id, role: u.role }), isNew, user: u };
}

export async function linkPhone(userId: string, rawPhone: string, code: string, deviceId?: string) {
  const phone = normalisePhone(rawPhone);
  const devOk = !isProd && env.otpDevCode && code === env.otpDevCode;
  if (!devOk) {
    const [row] = await db().select().from(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
    if (!row || row.expiresAt < new Date() || row.codeHash !== hash(code)) throw new HttpError(400, 'otp_invalid');
    await db().delete(schema.otpCodes).where(eq(schema.otpCodes.phone, phone));
  }
  const [taken] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phone, phone));
  if (taken && taken.id !== userId) throw new HttpError(409, 'phone_in_use');
  await db().update(schema.users).set({ phone }).where(eq(schema.users.id, userId));
  await grantFreeMinutes(userId, deviceId);
}
