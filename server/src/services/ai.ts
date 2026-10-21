import Anthropic from '@anthropic-ai/sdk';
import { asc, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { langInfo } from '../config/languages.js';
import { db, schema } from '../db/client.js';
import { chartSummary, transitHouses } from '../astro/interpret.js';
import { computeChart, currentDasha, vimshottari } from '../astro/engine.js';
import { NAKSHATRAS, SIGNS } from '../astro/constants.js';

const client = env.anthropicApiKey ? new Anthropic({ apiKey: env.anthropicApiKey }) : null;
export const aiEnabled = () => Boolean(client);

export function chartContext(profile: typeof schema.birthProfiles.$inferSelect) {
  const chart = computeChart({ date: profile.date, time: profile.timeAccuracy === 'unknown' ? null : profile.time, tzOffsetMinutes: profile.tzOffsetMinutes, lat: profile.lat, lon: profile.lon });
  const sum = chartSummary(chart);
  const dasha = currentDasha(vimshottari(chart));
  const transits = transitHouses(chart.moonSign);
  const lines = [
    `Name: ${profile.name}. Born ${profile.date}${profile.time && profile.timeAccuracy !== 'unknown' ? ` at ${profile.time} (${profile.timeAccuracy})` : ' (birth time unknown)'} in ${profile.placeName}.`,
    chart.lagna ? `Lagna: ${SIGNS[chart.lagna.sign].sa} (${SIGNS[chart.lagna.sign].en}).` : 'Lagna unknown — use Chandra Lagna (Moon sign) for houses.',
    `Rashi (Moon sign): ${SIGNS[chart.moonSign].sa}. Nakshatra: ${NAKSHATRAS[chart.nakshatra]} pada ${chart.pada}.`,
    'Planets (sidereal, Lahiri): ' + chart.planets.map((p) => `${p.planet} ${p.degreeInSign.toFixed(1)}° ${SIGNS[p.sign].sa} H${p.house}${p.retrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu' ? ' R' : ''}${p.dignity !== 'neutral' ? ` (${p.dignity})` : ''}`).join('; '),
    dasha.mahadasha ? `Current Vimshottari: ${dasha.mahadasha.lord} Mahadasha until ${dasha.mahadasha.end.slice(0, 10)}${dasha.antardasha ? `, ${dasha.antardasha.lord} Antardasha until ${dasha.antardasha.end.slice(0, 10)}` : ''}.` : '',
    `Manglik: ${sum.doshas.manglik.present ? 'yes' : 'no'}. Kaal Sarp: ${sum.doshas.kaalSarp.present ? 'yes' : 'no'}.`,
    'Today\'s transits from Moon sign: ' + transits.map((t) => `${t.planet} in H${t.house}`).join(', '),
  ];
  return lines.filter(Boolean).join('\n');
}

export function systemPrompt(lang: string, chartText: string | null) {
  const L = langInfo(lang);
  return `You are "Taara AI", a warm, knowledgeable Vedic astrology guide inside the Taara app. You are an AI, not a human Pandit; never claim otherwise.

Reply ONLY in ${L.english} (${L.native})${lang === 'hi' ? '; if the user writes in Hinglish (Hindi in Latin letters), you may reply in simple Hinglish' : ''}. Use simple everyday words. Explain any astrology term in one short phrase the first time you use it.

How to answer:
- Ground answers in the user's actual chart below (Lagna, Rashi, planets, current dasha, transits). Mention the 1–2 factors that matter most, then say plainly what it means for their question.
- Give timeframes as tendencies ("the coming months look more favourable for…"), never certainties.
- Offer one or two practical, harmless suggestions (reflection, timing, a simple traditional remedy such as a prayer, charity or mantra). Never suggest expensive rituals, gemstones as a must, or anything that creates fear.
- Keep replies short for chat: 3–6 sentences unless the user asks for detail. For voice, 2–4 spoken sentences, no lists or symbols.
- If the user's question is outside astrology, help briefly and kindly steer back.

Boundaries:
- Astrology is guidance and reflection, not a guaranteed prediction. Say so gently when a user seems to rely on it for a big decision.
- No medical diagnosis or treatment, no legal advice, no investment/trading tips, no predictions of death, illness or accidents, no pregnancy or gender-of-child predictions. Suggest the right professional instead.
- If someone expresses hopelessness or thoughts of self-harm, respond with care, set astrology aside, and encourage them to contact Tele-MANAS (14416) or someone they trust.
- Never ask for birth details already given below.

Palm reading, when the context includes one: describe what palmistry traditionally associates with the visible features; never claim it as fact; never predict lifespan, illness or death from any line.

${chartText ? `What you know about the user:\n${chartText}` : 'The user has not shared birth details. Answer generally and invite them to add birth details for a personal reading.'}`;
}

export async function history(sessionId: string, limit = 20) {
  const rows = await db().select().from(schema.messages).where(eq(schema.messages.sessionId, sessionId)).orderBy(asc(schema.messages.createdAt));
  return rows.filter((m) => m.sender === 'user' || m.sender === 'ai').slice(-limit)
    .map((m) => ({ role: m.sender === 'user' ? 'user' as const : 'assistant' as const, content: m.text }));
}

/** Streams a reply. `onDelta` receives text chunks; resolves to the full text. */
export async function aiReply(opts: { sessionId: string; lang: string; chartText: string | null; voice: boolean; onDelta?: (t: string) => void }) {
  const msgs = await history(opts.sessionId);
  if (!client) {
    const demo = demoReply(opts.lang);
    opts.onDelta?.(demo);
    return demo;
  }
  const stream = client.messages.stream({
    model: env.aiModel,
    max_tokens: opts.voice ? 400 : 900,
    system: systemPrompt(opts.lang, opts.chartText) + (opts.voice ? '\nThis is a spoken conversation: answer in natural speech.' : ''),
    messages: msgs.length ? msgs : [{ role: 'user', content: 'Namaste' }],
  });
  let full = '';
  stream.on('text', (t) => { full += t; opts.onDelta?.(t); });
  await stream.finalMessage();
  return full;
}

/** Single-shot completion used by horoscope generation, reports and translation. */
export async function complete(prompt: string, opts: { system?: string; maxTokens?: number; fast?: boolean } = {}) {
  if (!client) return null;
  const r = await client.messages.create({
    model: opts.fast ? env.aiFastModel : env.aiModel,
    max_tokens: opts.maxTokens ?? 1500,
    system: opts.system,
    messages: [{ role: 'user', content: prompt }],
  });
  return r.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
}

function demoReply(lang: string) {
  return lang === 'hi'
    ? 'नमस्ते! यह डेमो मोड है — असली AI उत्तर के लिए सर्वर पर ANTHROPIC_API_KEY सेट करें।'
    : 'Namaste! This is demo mode — set ANTHROPIC_API_KEY on the server for real AI answers.';
}
