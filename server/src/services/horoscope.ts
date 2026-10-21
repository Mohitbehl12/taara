import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { NAKSHATRAS, SIGNS } from '../astro/constants.js';
import { dailyEnergy, transitHouses } from '../astro/interpret.js';
import { complete } from './ai.js';
import { translateObject } from './translate.js';

export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface HoroscopeContent {
  sign: number; period: Period; periodKey: string;
  general: string; love: string; career: string; finance: string; health: string; family: string; growth: string; advice: string;
  luckyNumber: number; luckyColor: string; compatibleSign: number;
  energy: { overall: number; love: number; career: number; money: number; health: number; family: number };
}

const IST = 330;
export function periodKey(period: Period, at = new Date()) {
  const d = new Date(at.getTime() + IST * 60_000);
  const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), day = String(d.getUTCDate()).padStart(2, '0');
  if (period === 'daily') return `${y}-${m}-${day}`;
  if (period === 'monthly') return `${y}-${m}`;
  if (period === 'yearly') return `${y}`;
  const jan1 = Date.UTC(y, 0, 1);
  const week = Math.ceil(((d.getTime() - jan1) / 86_400_000 + new Date(jan1).getUTCDay() + 1) / 7);
  return `${y}-W${String(week).padStart(2, '0')}`;
}

export function keyToDate(period: Period, key: string) {
  if (period === 'daily') return new Date(`${key}T06:00:00+05:30`);
  if (period === 'monthly') return new Date(`${key}-15T06:00:00+05:30`);
  if (period === 'yearly') return new Date(`${key}-07-01T06:00:00+05:30`);
  const [y, w] = key.split('-W').map(Number);
  return new Date(Date.UTC(y, 0, 1 + (w - 1) * 7 + 3));
}

const COLORS = ['Red', 'White', 'Green', 'Silver', 'Orange', 'Light green', 'Pink', 'Maroon', 'Yellow', 'Navy blue', 'Sky blue', 'Sea green'];

// Deterministic seed so lucky number/colour are stable for a sign and day.
const seed = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

async function generateEnglish(sign: number, period: Period, key: string): Promise<HoroscopeContent> {
  const at = keyToDate(period, key);
  const energy = dailyEnergy(sign, at);
  const tr = transitHouses(sign, at);
  const sd = seed(`${sign}${period}${key}`);
  const base = {
    sign, period, periodKey: key,
    luckyNumber: (sd % 9) + 1, luckyColor: COLORS[(sd >> 3) % 12], compatibleSign: (sign + [4, 8, 6, 2][(sd >> 5) % 4]) % 12,
    energy: { overall: energy.overall, love: energy.love, career: energy.career, money: energy.money, health: energy.health, family: energy.family },
  };
  const S = SIGNS[sign];
  const transitText = tr.map((t) => `${t.planet} transiting the ${t.house}th house from Moon (${t.favourable ? 'favourable' : 'challenging'})`).join('; ');
  const ai = await complete(
    `Write the ${period} horoscope (${key}) for Moon sign ${S.sa} (${S.en}) using these actual sidereal transits: ${transitText}.
Energy scores (0-100): ${JSON.stringify(base.energy)}.
Return strict JSON with string fields: general, love, career, finance, health, family, growth, advice.
Each field 1–3 short sentences, warm and practical, plain English a beginner understands, no astrology jargon except naming a planet,
no fear, no guaranteed outcomes, no medical claims. "advice" is one actionable line for the ${period === 'daily' ? 'day' : period.replace('ly', '')}.`,
    { system: 'You are a careful Vedic astrology writer. Output JSON only.', maxTokens: 900, fast: true },
  );
  if (ai) {
    try {
      const j = JSON.parse(ai.slice(ai.indexOf('{'), ai.lastIndexOf('}') + 1));
      return { ...base, ...j };
    } catch { /* fall through to template */ }
  }
  return { ...base, ...templateText(sign, energy, tr) };
}

function templateText(sign: number, e: ReturnType<typeof dailyEnergy>, tr: ReturnType<typeof transitHouses>) {
  const tone = (n: number, good: string, mid: string, low: string) => (n >= 70 ? good : n >= 50 ? mid : low);
  const jup = tr.find((t) => t.planet === 'Jupiter')!;
  const sat = tr.find((t) => t.planet === 'Saturn')!;
  return {
    general: `For ${SIGNS[sign].sa}, ${tone(e.overall, 'the energy is supportive — a good time to move forward on plans.', 'things move at a steady pace; small consistent steps work best.', 'go slow and keep your plans flexible; patience pays.')}`,
    love: tone(e.love, 'Warmth and understanding come easily — share what you feel.', 'Relationships are steady; listen more than you speak.', 'Small misunderstandings are possible; stay calm and kind.'),
    career: tone(e.career, 'Your efforts get noticed. Take initiative.', 'Routine work goes well; finish pending tasks.', 'Avoid big confrontations at work; focus on quality.'),
    finance: tone(e.money, 'A favourable time for planned financial decisions.', 'Keep spending balanced and stick to your budget.', 'Avoid impulsive purchases and lending money today.'),
    health: tone(e.health, 'Good energy — use it for exercise or outdoor time.', 'Keep a regular routine and sleep on time.', 'Rest well and do not overwork.'),
    family: tone(e.family, 'Happy moments with family are likely.', 'Spend a little quality time at home.', 'Be patient with elders and avoid arguments.'),
    growth: jup.favourable ? 'Jupiter supports learning and new perspectives.' : sat.favourable ? 'Saturn rewards disciplined effort now.' : 'Reflection and steady habits bring growth.',
    advice: tone(e.overall, 'Start the important task you have been postponing.', 'Make a short list and finish one thing well.', 'Pause before reacting; a calm mind finds the answer.'),
  };
}

/** Returns a cached horoscope or generates it (English first, then the requested language). */
export async function getHoroscope(sign: number, period: Period, lang: string, key = periodKey(period)): Promise<HoroscopeContent> {
  const find = async (l: string) => (await db().select().from(schema.horoscopes).where(and(
    eq(schema.horoscopes.sign, sign), eq(schema.horoscopes.period, period), eq(schema.horoscopes.periodKey, key), eq(schema.horoscopes.lang, l),
  )))[0]?.content as HoroscopeContent | undefined;
  const hit = await find(lang);
  if (hit) return hit;
  let en = await find('en');
  if (!en) {
    en = await generateEnglish(sign, period, key);
    await db().insert(schema.horoscopes).values({ sign, period, periodKey: key, lang: 'en', content: en }).onConflictDoNothing();
  }
  if (lang === 'en') return en;
  const tr = await translateObject(en, lang);
  if (tr !== en) await db().insert(schema.horoscopes).values({ sign, period, periodKey: key, lang, content: tr }).onConflictDoNothing();
  return tr;
}

/** Pre-generate today's horoscopes for all signs in English and Hindi (cron). Other languages fill lazily. */
export async function pregenerateDaily(langs = ['en', 'hi']) {
  for (let sign = 0; sign < 12; sign++) for (const l of langs) await getHoroscope(sign, 'daily', l);
}

export const nakshatraNames = NAKSHATRAS;
