// Palm reading with Claude vision. Readings are written in the user's language and framed as traditional
// interpretation, never as fact. Images are stored privately and only sent to the AI provider for analysis.
import Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, gte, sql } from 'drizzle-orm';
import { env } from '../config/env.js';
import { langInfo } from '../config/languages.js';
import { db, schema } from '../db/client.js';
import { HttpError } from '../lib/http.js';
import { allSettings } from '../lib/settings.js';
import { moveUserMoney, platformEntry } from './wallet.js';

const client = env.anthropicApiKey ? new Anthropic({ apiKey: env.anthropicApiKey }) : null;
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? '.data/uploads');
const MAX_BYTES = 5 * 1024 * 1024;
const MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
type Media = (typeof MEDIA)[number];

export interface PalmFinding { key: string; visible: boolean; observation: string; meaning: string }
export interface QuickReading {
  isPalm: boolean; imageIssue: string | null; handShape: { type: string; observation: string; meaning: string };
  lines: PalmFinding[]; summary: string;
}
export interface DetailedReading {
  mounts: PalmFinding[]; fingers: { observation: string; meaning: string }; markings: PalmFinding[];
  sections: { key: 'personality' | 'love' | 'career' | 'wellbeing' | 'advice'; title: string; paragraphs: string[] }[];
}

const SYSTEM = (lang: string) => `You are an experienced traditional palmist (Hast Rekha Shastra) inside an Indian app.
Write ONLY in ${langInfo(lang).english} (${langInfo(lang).native}), in simple warm language a beginner understands.
Describe only what is actually visible in the photo; if a line is unclear, say so (visible=false) rather than inventing it.
Always present meanings as what palmistry traditionally associates, never as fact or certainty.
Never predict death, illness, accidents, lifespan, pregnancy or the gender of a child; for the life line describe vitality and life changes, not length of life.
No medical, legal or financial advice. Output strict JSON only, no prose around it.`;

function parseJson<T>(text: string): T {
  return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as T;
}

type VisionFn = (image: Buffer, mediaType: Media, lang: string, instruction: string, maxTokens: number) => Promise<unknown>;
let visionOverride: VisionFn | null = null;
/** Tests replace the AI call with a stub. */
export function setVisionForTests(fn: VisionFn | null) { visionOverride = fn; }

async function vision<T>(image: Buffer, mediaType: Media, lang: string, instruction: string, maxTokens: number): Promise<T> {
  if (visionOverride) return (await visionOverride(image, mediaType, lang, instruction, maxTokens)) as T;
  if (!client) throw new HttpError(503, 'ai_not_configured');
  const r = await client.messages.create({
    model: env.aiModel,
    max_tokens: maxTokens,
    system: SYSTEM(lang),
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: image.toString('base64') } },
      { type: 'text', text: instruction },
    ] }],
  });
  return parseJson<T>(r.content.map((b) => (b.type === 'text' ? b.text : '')).join(''));
}

const QUICK_PROMPT = (hand: string) => `This is the user's ${hand} palm. Return JSON:
{"isPalm": boolean (false if this is not a clear photo of an open palm),
 "imageIssue": null | "blurry" | "too_dark" | "fingers_cut" | "not_flat" | "not_a_palm",
 "handShape": {"type": "earth"|"air"|"fire"|"water", "observation": "1 sentence", "meaning": "1-2 sentences"},
 "lines": [ for each of life, head, heart, fate, sun: {"key": "life"|"head"|"heart"|"fate"|"sun", "visible": boolean, "observation": "what you see, 1 sentence", "meaning": "what this traditionally represents, 1-2 sentences"} ],
 "summary": "3 sentences, encouraging and balanced"}`;

const DETAILED_PROMPT = (hand: string, quick: QuickReading) => `This is the user's ${hand} palm. A quick reading already said: ${JSON.stringify(quick.lines.map((l) => ({ key: l.key, observation: l.observation })))}.
Now give a detailed reading. Return JSON:
{"mounts": [ for jupiter, saturn, apollo, mercury, venus, moon, mars: {"key": string, "visible": boolean, "observation": string, "meaning": string} ],
 "fingers": {"observation": "finger length/shape, thumb", "meaning": string},
 "markings": [ any clearly visible special marks (cross, star, island, chain, fork, triangle) with {"key","visible":true,"observation","meaning"}; empty array if none ],
 "sections": [
   {"key":"personality","title":string,"paragraphs":[2-3 paragraphs]},
   {"key":"love","title":string,"paragraphs":[2 paragraphs]},
   {"key":"career","title":string,"paragraphs":[2 paragraphs]},
   {"key":"wellbeing","title":string,"paragraphs":[1-2 paragraphs about energy and balance — no medical claims]},
   {"key":"advice","title":string,"paragraphs":[1-2 practical, kind paragraphs]}
 ]}`;

export function sniffMedia(buf: Buffer): Media | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('hex') === '89504e47') return 'image/png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

export async function createReading(userId: string, hand: 'left' | 'right', image: Buffer, lang: string) {
  if (!image.length || image.length > MAX_BYTES) throw new HttpError(400, 'image_too_large');
  const mediaType = sniffMedia(image);
  if (!mediaType) throw new HttpError(400, 'unsupported_image');
  const s = await allSettings();
  const since = new Date(Date.now() - 86_400_000);
  const [{ n }] = await db().select({ n: sql<number>`count(*)` }).from(schema.palmReadings)
    .where(and(eq(schema.palmReadings.userId, userId), gte(schema.palmReadings.createdAt, since)));
  if (Number(n) >= s['palm.free_readings_per_day']) throw new HttpError(429, 'palm_daily_limit');

  const quick = await vision<QuickReading>(image, mediaType, lang, QUICK_PROMPT(hand), 1800);
  if (!quick.isPalm) throw new HttpError(422, 'palm_not_clear', quick.imageIssue ?? 'not_a_palm');

  const dir = path.join(UPLOAD_DIR, 'palms');
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${randomUUID()}.${mediaType.split('/')[1]}`);
  await writeFile(file, image);
  const [row] = await db().insert(schema.palmReadings).values({ userId, hand, imagePath: file, mediaType, lang, quick }).returning();
  return publicReading(row);
}

/** Paid detailed reading. Money is taken first and refunded automatically if generation fails. */
export async function buyDetailed(userId: string, id: string) {
  const row = await own(userId, id);
  if (row.detailed) return publicReading(row);
  if (row.status === 'detailed_generating') throw new HttpError(409, 'already_generating');
  const price = (await allSettings())['palm.detailed_price_paise'];
  if (!row.imagePath) throw new HttpError(410, 'palm_photo_expired'); // photo removed under the retention policy
  await db().transaction(async (tx) => {
    await moveUserMoney(tx, userId, -price, 'report_purchase', { note: `palm ${id}` });
    await platformEntry(tx, price, 'report_purchase', { note: `palm ${id}` });
    await tx.update(schema.palmReadings).set({ status: 'detailed_generating', detailedPricePaise: price }).where(eq(schema.palmReadings.id, id));
  });
  try {
    const image = await readFile(row.imagePath);
    const detailed = await vision<DetailedReading>(image, row.mediaType as Media, row.lang, DETAILED_PROMPT(row.hand, row.quick as QuickReading), 4000);
    const [u] = await db().update(schema.palmReadings).set({ detailed, status: 'ready' }).where(eq(schema.palmReadings.id, id)).returning();
    return publicReading(u);
  } catch (e) {
    await db().transaction(async (tx) => {
      await moveUserMoney(tx, userId, price, 'refund', { note: `palm ${id} failed` });
      await platformEntry(tx, -price, 'refund', { note: `palm ${id}` });
      await tx.update(schema.palmReadings).set({ status: 'ready', detailedPricePaise: null }).where(eq(schema.palmReadings.id, id));
    });
    throw e instanceof HttpError ? e : new HttpError(502, 'palm_failed');
  }
}

export async function own(userId: string, id: string) {
  const [row] = await db().select().from(schema.palmReadings).where(and(eq(schema.palmReadings.id, id), eq(schema.palmReadings.userId, userId)));
  if (!row) throw new HttpError(404, 'palm_not_found');
  return row;
}

export function publicReading(r: typeof schema.palmReadings.$inferSelect) {
  return { id: r.id, hand: r.hand, lang: r.lang, quick: r.quick as QuickReading, detailed: (r.detailed as DetailedReading | null) ?? null, status: r.status, createdAt: r.createdAt };
}

/** Text context given to the AI Palm Expert chat, so it can answer follow-up questions about this palm. */
export async function palmContext(id: string) {
  const [r] = await db().select().from(schema.palmReadings).where(eq(schema.palmReadings.id, id));
  if (!r) return null;
  const q = r.quick as QuickReading;
  const d = r.detailed as DetailedReading | null;
  return [
    `Palm reading of the user's ${r.hand} hand (from their photo).`,
    `Hand shape: ${q.handShape.type} — ${q.handShape.observation}`,
    ...q.lines.map((l) => `${l.key} line: ${l.visible ? l.observation : 'not clearly visible'}`),
    ...(d ? [...d.mounts.map((m) => `Mount of ${m.key}: ${m.observation}`), `Fingers: ${d.fingers.observation}`, ...d.markings.map((m) => `Marking ${m.key}: ${m.observation}`)] : []),
  ].join('\n');
}
