// Extra tools: Sade Sati / Dhaiya, Choghadiya, Abhijit Muhurat, Numerology.
import * as A from 'astronomy-engine';
import { siderealLongitude } from './engine.js';

const DAY = 86_400_000;
const saturnSign = (t: number) => Math.floor(siderealLongitude('Saturn', new Date(t)) / 30);

// ---------- Sade Sati & Dhaiya ----------
export type SaturnPhase = 'rising' | 'peak' | 'setting' | 'kantak' | 'ashtam';
export interface SaturnPeriod { phase: SaturnPhase; kind: 'sade_sati' | 'dhaiya'; sign: number; start: string; end: string }

function phaseFor(sign: number, moonSign: number): SaturnPhase | null {
  const d = (sign - moonSign + 12) % 12;
  if (d === 11) return 'rising';   // 12th from Moon
  if (d === 0) return 'peak';      // over the Moon
  if (d === 1) return 'setting';   // 2nd from Moon
  if (d === 3) return 'kantak';    // 4th: small panoti
  if (d === 7) return 'ashtam';    // 8th
  return null;
}

/** Finds the exact day Saturn changes sign between t0 (sign a) and t1. */
function refine(t0: number, t1: number) {
  const a = saturnSign(t0);
  while (t1 - t0 > DAY) {
    const m = Math.floor((t0 + t1) / 2);
    if (saturnSign(m) === a) t0 = m; else t1 = m;
  }
  return t1;
}

/** All Saturn sign stays in [from, to], sampled every 10 days and refined to the day (catches retrograde re-entries). */
export function saturnIngresses(from: Date, to: Date) {
  const step = 10 * DAY;
  const out: { sign: number; start: number; end: number }[] = [];
  let t = from.getTime();
  let cur = { sign: saturnSign(t), start: t, end: t };
  for (t += step; t <= to.getTime() + step; t += step) {
    const s = saturnSign(t);
    if (s !== cur.sign) {
      const change = refine(t - step, t);
      cur.end = change;
      out.push(cur);
      cur = { sign: s, start: change, end: change };
    }
  }
  cur.end = to.getTime();
  out.push(cur);
  return out;
}

// Saturn's stays are the same for everyone: compute 1920–2120 once per process and slice.
let cachedStays: ReturnType<typeof saturnIngresses> | null = null;
function staysBetween(from: Date, to: Date) {
  cachedStays ??= saturnIngresses(new Date('1920-01-01'), new Date('2120-01-01'));
  return cachedStays.filter((s) => s.end > from.getTime() && s.start < to.getTime())
    .map((s) => ({ ...s, start: Math.max(s.start, from.getTime()), end: Math.min(s.end, to.getTime()) }));
}

export function saturnCycle(moonSign: number, from: Date, to: Date, now = new Date()) {
  const stays = staysBetween(from, to);
  const periods: SaturnPeriod[] = [];
  for (const s of stays) {
    const phase = phaseFor(s.sign, moonSign);
    if (!phase) continue;
    const kind = phase === 'kantak' || phase === 'ashtam' ? 'dhaiya' : 'sade_sati';
    const last = periods.at(-1);
    // merge back-to-back stays of the same phase (retrograde wobble)
    if (last && last.phase === phase && Date.parse(last.end) >= s.start - DAY) { last.end = new Date(s.end).toISOString(); continue; }
    periods.push({ phase, kind, sign: s.sign, start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() });
  }
  const t = now.getTime();
  const current = periods.find((p) => Date.parse(p.start) <= t && t < Date.parse(p.end)) ?? null;
  const next = periods.find((p) => Date.parse(p.start) > t && p.kind === 'sade_sati') ?? null;
  // Group consecutive rising→peak→setting into whole Sade Sati spans
  const spans: { start: string; end: string }[] = [];
  for (const p of periods.filter((x) => x.kind === 'sade_sati')) {
    const last = spans.at(-1);
    if (last && Date.parse(p.start) - Date.parse(last.end) < 400 * DAY) last.end = p.end; else spans.push({ start: p.start, end: p.end });
  }
  return { periods, current, next, sadeSatiSpans: spans };
}

// ---------- Choghadiya & Abhijit ----------
const DAY_SEQ = ['udveg', 'char', 'labh', 'amrit', 'kaal', 'shubh', 'rog'] as const;
const NIGHT_SEQ = ['shubh', 'amrit', 'char', 'rog', 'kaal', 'labh', 'udveg'] as const;
const DAY_START = ['udveg', 'amrit', 'rog', 'labh', 'shubh', 'char', 'kaal']; // Sun..Sat
const NIGHT_START = ['shubh', 'char', 'kaal', 'udveg', 'amrit', 'rog', 'labh'];
export const CHOGHADIYA_QUALITY: Record<string, 'good' | 'neutral' | 'bad'> = {
  amrit: 'good', shubh: 'good', labh: 'good', char: 'neutral', udveg: 'bad', rog: 'bad', kaal: 'bad',
};

export function choghadiya(opts: { date: string; tzOffsetMinutes: number; lat: number; lon: number }) {
  const [y, m, d] = opts.date.split('-').map(Number);
  const midnight = new Date(Date.UTC(y, m - 1, d) - opts.tzOffsetMinutes * 60_000);
  const obs = new A.Observer(opts.lat, opts.lon, 0);
  const sunrise = A.SearchRiseSet(A.Body.Sun, obs, +1, midnight, 1)?.date;
  const sunset = A.SearchRiseSet(A.Body.Sun, obs, -1, midnight, 1)?.date;
  const nextRise = sunset ? A.SearchRiseSet(A.Body.Sun, obs, +1, sunset, 1)?.date : undefined;
  if (!sunrise || !sunset || !nextRise) return null;
  const weekday = new Date(sunrise.getTime() + opts.tzOffsetMinutes * 60_000).getUTCDay();
  const slots = (from: Date, to: Date, seq: readonly string[], first: string, part: 'day' | 'night') => {
    const len = (to.getTime() - from.getTime()) / 8;
    const i0 = seq.indexOf(first);
    return Array.from({ length: 8 }, (_, i) => {
      const name = seq[(i0 + i) % 7];
      return { part, name, quality: CHOGHADIYA_QUALITY[name], start: new Date(from.getTime() + len * i).toISOString(), end: new Date(from.getTime() + len * (i + 1)).toISOString() };
    });
  };
  const muhurta = (sunset.getTime() - sunrise.getTime()) / 15;
  return {
    weekday,
    slots: [...slots(sunrise, sunset, DAY_SEQ, DAY_START[weekday], 'day'), ...slots(sunset, nextRise, NIGHT_SEQ, NIGHT_START[weekday], 'night')],
    abhijit: { start: new Date(sunrise.getTime() + muhurta * 7).toISOString(), end: new Date(sunrise.getTime() + muhurta * 8).toISOString(), avoidToday: weekday === 3 },
  };
}

// ---------- Numerology ----------
const CHALDEAN: Record<string, number> = {
  A: 1, I: 1, J: 1, Q: 1, Y: 1, B: 2, K: 2, R: 2, C: 3, G: 3, L: 3, S: 3, D: 4, M: 4, T: 4,
  E: 5, H: 5, N: 5, X: 5, U: 6, V: 6, W: 6, O: 7, Z: 7, F: 8, P: 8,
};
const reduce = (n: number) => { while (n > 9) n = String(n).split('').reduce((a, b) => a + Number(b), 0); return n; };
const digitsum = (s: string) => s.replace(/\D/g, '').split('').reduce((a, b) => a + Number(b), 0);
export const NUMBER_PLANET = ['', 'Sun', 'Moon', 'Jupiter', 'Rahu', 'Mercury', 'Venus', 'Ketu', 'Saturn', 'Mars'];
const FRIENDLY: Record<number, number[]> = { 1: [1, 2, 3, 9], 2: [1, 2, 7], 3: [1, 3, 6, 9], 4: [1, 5, 6], 5: [1, 5, 6], 6: [3, 5, 6, 9], 7: [1, 2, 7], 8: [5, 6, 8], 9: [1, 3, 6, 9] };

export function numerology(date: string, name?: string) {
  const [, m, d] = date.split('-').map(Number);
  const mulank = reduce(d);
  const bhagyank = reduce(digitsum(date));
  const latin = (name ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  const compound = latin ? latin.split('').reduce((a, ch) => a + (CHALDEAN[ch] ?? 0), 0) : null;
  const nameNumber = compound ? reduce(compound) : null;
  return {
    mulank, bhagyank, nameNumber, nameCompound: compound, nameSupported: !!latin,
    rulingPlanet: NUMBER_PLANET[mulank], destinyPlanet: NUMBER_PLANET[bhagyank],
    friendlyNumbers: FRIENDLY[mulank],
    nameHarmony: nameNumber ? (FRIENDLY[mulank].includes(nameNumber) ? 'good' : 'neutral') : null,
    personalYear: reduce(d + m + digitsum(String(new Date().getFullYear()))),
  };
}
