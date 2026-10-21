import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { langInfo } from '../config/languages.js';
import { db, schema } from '../db/client.js';
import { complete } from './ai.js';

const SYSTEM = `You are a professional translator for an Indian astrology app. Translate the user's text faithfully.
Rules: keep meaning exactly, do not add, soften, or remove anything; keep names, numbers, dates and astrology terms
(e.g. Rahu, Shani, Kundli, Nakshatra) recognisable; use the language's native script; output ONLY the translation.`;

/** Translates text; cached by content hash. Returns the original text if translation is unavailable. */
export async function translate(text: string, to: string, from?: string): Promise<string> {
  if (!text.trim() || from === to) return text;
  const hash = createHash('sha256').update(`${to}|${text}`).digest('hex');
  const [hit] = await db().select().from(schema.translationCache).where(eq(schema.translationCache.hash, hash));
  if (hit) return hit.result;
  const target = langInfo(to);
  const out = await complete(`Translate into ${target.english} (${target.native}):\n\n${text}`, { system: SYSTEM, fast: true, maxTokens: 2000 });
  if (!out) return text;
  const result = out.trim();
  await db().insert(schema.translationCache).values({ hash, result }).onConflictDoNothing();
  return result;
}

/** Translates every string leaf of a JSON object (used for horoscopes, chart explanations, reports). */
export async function translateObject<T>(obj: T, to: string): Promise<T> {
  if (to === 'en') return obj;
  if (typeof obj === 'string') return (await translate(obj, to, 'en')) as T;
  if (Array.isArray(obj)) return Promise.all(obj.map((v) => translateObject(v, to))) as Promise<T>;
  if (obj && typeof obj === 'object') {
    const entries = await Promise.all(Object.entries(obj).map(async ([k, v]) => [k, TRANSLATABLE.has(k) ? await translateObject(v, to) : v]));
    return Object.fromEntries(entries) as T;
  }
  return obj;
}
// Only these keys carry human-readable prose; everything else (ids, numbers, enums) stays as is.
// Container keys (placements, doshas, …) are walked so their prose children get translated too.
const TRANSLATABLE = new Set([
  'simple', 'detailed', 'text', 'summary', 'advice', 'general', 'love', 'career', 'finance', 'health', 'family', 'note',
  'sections', 'title', 'body', 'paragraphs', 'growth', 'disclaimer',
  'placements', 'doshas', 'manglik', 'kaalSarp', 'dasha', 'matching', 'kootas',
]);
