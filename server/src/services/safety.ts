// User-safety helpers: contact masking in Pandit chats, the AI "care" signal, age checks, and message rate limits.
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { HttpError } from '../lib/http.js';
import { moveUserMoney, platformEntry } from './wallet.js';

// ---------- contact masking ----------
// Pandit ↔ user chats stay on the platform: no phone numbers, emails, UPI IDs, links or messenger handles.
// This protects users from off-platform payment scams and harassment, and Pandits from being poached.
// Digits in any Indian script count (Devanagari ०-९, Bengali ০-৯, etc.), and spaced/dashed numbers are caught.
const DIGIT = '[0-9\\u0966-\\u096F\\u09E6-\\u09EF\\u0A66-\\u0A6F\\u0AE6-\\u0AEF\\u0B66-\\u0B6F\\u0BE6-\\u0BEF\\u0C66-\\u0C6F\\u0CE6-\\u0CEF\\u0D66-\\u0D6F\\u06F0-\\u06F9\\u0660-\\u0669\\u1C50-\\u1C59]';
const PATTERNS: RegExp[] = [
  /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gu,                                        // email
  /\b[\w.-]{2,}@(?:ok)?[a-z]{2,}\b/giu,                                     // UPI id (name@okaxis, 98xx@ybl)
  /\b(?:https?:\/\/|www\.)\S+/giu,                                          // links
  /\b[\w-]+\.(?:com|in|net|org|io|me|link|ly|app|xyz)\b(?:\/\S*)?/giu,      // bare domains
  /(?:wa\.me|t\.me|telegram\.me|chat\.whatsapp\.com)\S*/giu,
  // Indian mobile numbers (optionally +91/0, then 6-9 and 9 more digits, spaces/dashes allowed). Dates and times are not touched.
  new RegExp(`(?:(?:\\+|00)?(?:9[\\s-]?1)[\\s-]?|0)?[6-9\\u096C-\\u096F](?:[\\s-]?${DIGIT}){9}(?!${DIGIT})`, 'gu'),
];
export const MASK = '•••';

export function maskContacts(text: string): { text: string; masked: boolean } {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, MASK);
  return { text: out, masked: out !== text };
}

// ---------- AI care signal ----------
// The AI starts its reply with this marker when the user appears to be in crisis (self-harm, abuse, emergency).
// The server strips it, stops billing for the session, refunds what was charged, and the app shows helplines.
export const CARE_MARKER = '[[CARE]]';

export function stripCare(reply: string): { reply: string; care: boolean } {
  const i = reply.indexOf(CARE_MARKER);
  if (i === -1) return { reply, care: false };
  return { reply: (reply.slice(0, i) + reply.slice(i + CARE_MARKER.length)).trim(), care: true };
}

/** Stops all charges for a session and refunds anything charged so far (AI sessions only). Idempotent. */
export async function waiveSession(sessionId: string) {
  await db().transaction(async (tx) => {
    const [s] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).for('update');
    if (!s || s.billingWaived || s.kind !== 'ai') return;
    if (s.chargedPaise > 0) {
      await moveUserMoney(tx, s.userId, s.chargedPaise, 'refund', { sessionId, note: 'care: charges waived' });
      await platformEntry(tx, -s.chargedPaise, 'refund', { sessionId, note: 'care: charges waived' });
    }
    await tx.update(schema.sessions).set({ billingWaived: true }).where(eq(schema.sessions.id, sessionId));
  });
}

// ---------- age ----------
/** Age in whole years for a YYYY-MM-DD birth date, measured in India time. */
export function ageOn(dateIso: string, now = new Date()) {
  const [y, m, d] = dateIso.split('-').map(Number);
  const ist = new Date(now.getTime() + 330 * 60_000);
  let age = ist.getUTCFullYear() - y;
  if (ist.getUTCMonth() + 1 < m || (ist.getUTCMonth() + 1 === m && ist.getUTCDate() < d)) age--;
  return age;
}

/**
 * Paid features (wallet, consultations, paid readings) are for adults only: minors can't contract under Indian law,
 * and the DPDP Act requires verifiable parental consent for their data. The user must have confirmed they are 18+
 * and accepted the terms, and their own birth profile (if any) must not show them as under 18.
 */
export async function requireAdult(userId: string) {
  const [u] = await db().select({ age: schema.users.ageConfirmedAt, terms: schema.users.termsAcceptedAt }).from(schema.users).where(eq(schema.users.id, userId));
  if (!u?.terms) throw new HttpError(403, 'terms_not_accepted');
  if (!u.age) throw new HttpError(403, 'age_not_confirmed');
  const [self] = await db().select({ date: schema.birthProfiles.date }).from(schema.birthProfiles)
    .where(and(eq(schema.birthProfiles.userId, userId), eq(schema.birthProfiles.relation, 'self')));
  if (self && ageOn(self.date) < 18) throw new HttpError(403, 'age_restricted');
}

// ---------- rate limiting (in-memory, per process) ----------
const buckets = new Map<string, { tokens: number; at: number }>();
/** Token bucket: `perMinute` sustained, bursts up to `burst`. Throws 429 when exceeded. */
export function rateLimit(key: string, perMinute: number, burst = perMinute) {
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: burst, at: now };
  b.tokens = Math.min(burst, b.tokens + ((now - b.at) / 60_000) * perMinute);
  b.at = now;
  if (b.tokens < 1) { buckets.set(key, b); throw new HttpError(429, 'slow_down'); }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 50_000) buckets.clear();
}

/** True if the user has blocked this Pandit. */
export async function isBlocked(userId: string, panditId: string) {
  const [r] = await db().select().from(schema.userBlocks).where(and(eq(schema.userBlocks.userId, userId), eq(schema.userBlocks.panditId, panditId)));
  return Boolean(r);
}
