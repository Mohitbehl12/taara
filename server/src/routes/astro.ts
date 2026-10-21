import { Router } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { LANGUAGES } from '../config/languages.js';
import { db, schema } from '../db/client.js';
import { computeChart } from '../astro/engine.js';
import { chartSummary, dailyEnergy } from '../astro/interpret.js';
import { gunaMilan } from '../astro/matching.js';
import { panchang } from '../astro/panchang.js';
import { choghadiya, numerology, saturnCycle } from '../astro/tools.js';
import { transitHouses } from '../astro/interpret.js';
import { NAKSHATRAS, SIGNS } from '../astro/constants.js';
import { handler, HttpError, requireAuth } from '../lib/http.js';
import { allSettings } from '../lib/settings.js';
import { assertCoords, searchCities, tzOffsetAt } from '../services/places.js';
import { getHoroscope, periodKey, type Period } from '../services/horoscope.js';
import { translateObject } from '../services/translate.js';
import { track } from '../services/analytics.js';
import { voiceEnabled } from '../services/voice.js';
import { aiEnabled } from '../services/ai.js';

export const astroRoutes = Router();

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Public app config: languages, prices, feature flags. The app never hard-codes prices. */
astroRoutes.get('/meta', handler({}, async () => {
  const s = await allSettings();
  return {
    languages: LANGUAGES,
    signs: SIGNS, nakshatras: NAKSHATRAS,
    pricing: {
      aiBillingMode: s['ai.billing_mode'], aiRatePerMinPaise: s['ai.rate_per_min_paise'], aiRatePerMessagePaise: s['ai.rate_per_message_paise'],
      freePanditMinutes: s['free.pandit_minutes'], topupsPaise: s['wallet.topups_paise'], gstPct: s['gst.pct'],
      reportPricesPaise: s['reports.price_paise'], panditMinRatePaise: s['pandit.min_rate_paise'], panditMaxRatePaise: s['pandit.max_rate_paise'],
      commissionPct: s['pandit.commission_pct'], palmDetailedPricePaise: s['palm.detailed_price_paise'], palmFreePerDay: s['palm.free_readings_per_day'],
    },
    features: { ai: aiEnabled(), voice: voiceEnabled(), panditCalls: false },
  };
}));

astroRoutes.get('/places/search', handler({ query: z.object({ q: z.string() }) }, async ({ query }) => searchCities(query.q)));

astroRoutes.get('/places/tz', handler({
  query: z.object({ lat: z.coerce.number(), lon: z.coerce.number(), date: z.string().regex(dateRe), time: z.string().regex(timeRe).optional() }),
}, async ({ query }) => { assertCoords(query.lat, query.lon); return tzOffsetAt(query.lat, query.lon, query.date, query.time); }));

// ---------- birth profiles ----------
const profileBody = z.object({
  name: z.string().min(1).max(80),
  relation: z.string().max(30).default('self'),
  date: z.string().regex(dateRe),
  time: z.string().regex(timeRe).nullable().optional(),
  timeAccuracy: z.enum(['exact', 'approx', 'unknown']).default('exact'),
  placeName: z.string().min(1).max(160),
  lat: z.number().min(-66).max(66),
  lon: z.number().min(-180).max(180),
  tzOffsetMinutes: z.number().int().min(-720).max(840).optional(),
  isPrimary: z.boolean().optional(),
});

astroRoutes.post('/profiles', requireAuth, handler({ body: profileBody }, async ({ body, user }) => {
  const tz = body.tzOffsetMinutes ?? tzOffsetAt(body.lat, body.lon, body.date, body.time ?? '12:00').tzOffsetMinutes;
  const existing = await db().select({ id: schema.birthProfiles.id }).from(schema.birthProfiles).where(eq(schema.birthProfiles.userId, user.id));
  if (existing.length >= 20) throw new HttpError(400, 'too_many_profiles');
  const primary = body.isPrimary ?? existing.length === 0;
  if (primary) await db().update(schema.birthProfiles).set({ isPrimary: false }).where(eq(schema.birthProfiles.userId, user.id));
  const [p] = await db().insert(schema.birthProfiles).values({
    ...body, time: body.timeAccuracy === 'unknown' ? null : body.time ?? null, tzOffsetMinutes: tz, isPrimary: primary, userId: user.id,
  }).returning();
  if (primary) {
    await db().update(schema.users).set({ name: body.relation === 'self' ? body.name : undefined }).where(eq(schema.users.id, user.id));
    await track(user.id, 'birth_details_completed', { accuracy: body.timeAccuracy });
  }
  return p;
}));

astroRoutes.patch('/profiles/:id', requireAuth, handler({ body: profileBody.partial() }, async ({ req, body, user }) => {
  const p = await ownProfile(String(req.params.id), user.id);
  if (body.isPrimary) await db().update(schema.birthProfiles).set({ isPrimary: false }).where(eq(schema.birthProfiles.userId, user.id));
  const merged = { ...p, ...body };
  const tz = body.tzOffsetMinutes ?? (body.lat !== undefined || body.date || body.time
    ? tzOffsetAt(merged.lat, merged.lon, merged.date, merged.time ?? '12:00').tzOffsetMinutes : p.tzOffsetMinutes);
  const [u] = await db().update(schema.birthProfiles).set({ ...body, tzOffsetMinutes: tz, time: merged.timeAccuracy === 'unknown' ? null : merged.time })
    .where(eq(schema.birthProfiles.id, p.id)).returning();
  return u;
}));

astroRoutes.delete('/profiles/:id', requireAuth, handler({}, async ({ req, user }) => {
  const p = await ownProfile(String(req.params.id), user.id);
  await db().delete(schema.birthProfiles).where(eq(schema.birthProfiles.id, p.id));
}));

export async function ownProfile(id: string, userId: string) {
  const [p] = await db().select().from(schema.birthProfiles).where(and(eq(schema.birthProfiles.id, id), eq(schema.birthProfiles.userId, userId)));
  if (!p) throw new HttpError(404, 'profile_not_found');
  return p;
}

export const chartOf = (p: typeof schema.birthProfiles.$inferSelect) =>
  computeChart({ date: p.date, time: p.timeAccuracy === 'unknown' ? null : p.time, tzOffsetMinutes: p.tzOffsetMinutes, lat: p.lat, lon: p.lon });

astroRoutes.get('/profiles/:id/kundli', requireAuth, handler({ query: z.object({ lang: z.string().default('en') }) }, async ({ req, query, user }) => {
  const p = await ownProfile(String(req.params.id), user.id);
  const chart = chartOf(p);
  const summary = chartSummary(chart);
  await track(user.id, 'kundli_viewed');
  // Explanations are composed on the device from locale strings, so the chart needs no translation round-trip.
  void query.lang;
  return {
    profile: p, chart, basics: summary.basics, placements: summary.placements, doshas: summary.doshas, note: summary.note,
    dasha: { periods: summary.dasha.periods, current: summary.dasha.current, simple: summary.dasha.simple },
  };
}));

// ---------- matching ----------
astroRoutes.post('/match', requireAuth, handler({
  body: z.object({ groomProfileId: z.string().uuid(), brideProfileId: z.string().uuid(), lang: z.string().default('en') }),
}, async ({ body, user }) => {
  const g = chartOf(await ownProfile(body.groomProfileId, user.id));
  const b = chartOf(await ownProfile(body.brideProfileId, user.id));
  const result = gunaMilan({ moonSign: g.moonSign, nakshatra: g.nakshatra }, { moonSign: b.moonSign, nakshatra: b.nakshatra });
  await track(user.id, 'match_generated', { total: result.total });
  // Simple 0–100 area scores derived from the kootas, for the friendly view.
  const k = Object.fromEntries(result.kootas.map((x) => [x.key, x.score / x.max]));
  const pct = (v: number) => Math.round(v * 100);
  const areas = {
    overall: result.percent,
    emotional: pct((k.bhakoot + k.graha_maitri) / 2),
    communication: pct((k.graha_maitri + k.vashya) / 2),
    love: pct((k.yoni + k.vashya) / 2),
    marriage: pct((k.nadi + k.bhakoot + k.gana) / 3),
    financial: pct((k.bhakoot + k.tara) / 2),
    longTerm: pct((k.nadi + k.tara + k.gana) / 3),
  };
  const manglik = { groom: chartSummary(g).doshas.manglik.present, bride: chartSummary(b).doshas.manglik.present };
  return translateObject({ ...result, areas, manglik }, body.lang);
}));

// ---------- panchang, horoscope, home ----------
astroRoutes.get('/panchang', handler({
  query: z.object({ date: z.string().regex(dateRe), lat: z.coerce.number().default(28.6139), lon: z.coerce.number().default(77.209), tz: z.coerce.number().default(330) }),
}, async ({ query }) => panchang({ date: query.date, lat: query.lat, lon: query.lon, tzOffsetMinutes: query.tz })));

astroRoutes.get('/horoscope/:sign', handler({
  query: z.object({ period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('daily'), day: z.enum(['yesterday', 'today', 'tomorrow']).default('today'), lang: z.string().default('en') }),
}, async ({ req, query }) => {
  const sign = Number(req.params.sign);
  if (!(sign >= 0 && sign < 12)) throw new HttpError(400, 'invalid_sign');
  const shift = { yesterday: -1, today: 0, tomorrow: 1 }[query.day];
  const at = new Date(Date.now() + shift * 86_400_000);
  const key = periodKey(query.period as Period, query.period === 'daily' ? at : new Date());
  if (req.user) await track(req.user.id, 'horoscope_viewed', { period: query.period });
  return getHoroscope(sign, query.period as Period, query.lang, key);
}));

astroRoutes.get('/home', requireAuth, handler({ query: z.object({ lang: z.string().default('en') }) }, async ({ query, user }) => {
  const [p] = await db().select().from(schema.birthProfiles).where(and(eq(schema.birthProfiles.userId, user.id), eq(schema.birthProfiles.isPrimary, true)));
  if (!p) return { profile: null };
  const chart = chartOf(p);
  const energy = dailyEnergy(chart.moonSign);
  const horoscope = await getHoroscope(chart.moonSign, 'daily', query.lang);
  const today = new Date(Date.now() + p.tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
  return {
    profile: { id: p.id, name: p.name, timeKnown: chart.timeKnown },
    basics: {
      rashi: chart.moonSign, sunSign: chart.sunSign, lagna: chart.lagna?.sign ?? null,
      nakshatra: chart.nakshatra, pada: chart.pada,
    },
    energy: { overall: energy.overall, love: energy.love, career: energy.career, money: energy.money, health: energy.health, family: energy.family },
    highlights: energy.transits.filter((t) => ['Jupiter', 'Saturn', 'Moon'].includes(t.planet)),
    horoscope,
    panchang: panchang({ date: today, lat: p.lat, lon: p.lon, tzOffsetMinutes: p.tzOffsetMinutes }),
  };
}));

// ---------- tools ----------
astroRoutes.get('/tools/sade-sati', requireAuth, handler({ query: z.object({ profileId: z.string().uuid() }) }, async ({ query, user }) => {
  const p = await ownProfile(query.profileId, user.id);
  const chart = chartOf(p);
  const birth = new Date(chart.utc);
  const to = new Date(birth.getTime() + 100 * 365.25 * 86_400_000);
  return { moonSign: chart.moonSign, ...saturnCycle(chart.moonSign, birth, to) };
}));

astroRoutes.get('/tools/gochar', requireAuth, handler({ query: z.object({ profileId: z.string().uuid() }) }, async ({ query, user }) => {
  const chart = chartOf(await ownProfile(query.profileId, user.id));
  return { moonSign: chart.moonSign, at: new Date().toISOString(), transits: transitHouses(chart.moonSign) };
}));

astroRoutes.get('/tools/choghadiya', handler({
  query: z.object({ date: z.string().regex(dateRe), lat: z.coerce.number().default(28.6139), lon: z.coerce.number().default(77.209), tz: z.coerce.number().default(330) }),
}, async ({ query }) => {
  const c = choghadiya({ date: query.date, lat: query.lat, lon: query.lon, tzOffsetMinutes: query.tz });
  if (!c) throw new HttpError(422, 'no_sunrise');
  return c;
}));

astroRoutes.get('/tools/numerology', handler({
  query: z.object({ date: z.string().regex(dateRe), name: z.string().max(80).optional() }),
}, async ({ query }) => numerology(query.date, query.name)));
