import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { computeChart } from '../astro/engine.js';
import { chartSummary } from '../astro/interpret.js';
import { gunaMilan } from '../astro/matching.js';
import { HttpError } from '../lib/http.js';
import { getSetting } from '../lib/settings.js';
import { chartContext, complete } from './ai.js';
import { translateObject } from './translate.js';
import { moveUserMoney, platformEntry } from './wallet.js';

export type ReportKind = 'birth_chart' | 'marriage' | 'career' | 'finance' | 'yearly' | 'compatibility';
export const REPORT_INFO: Record<ReportKind, { title: string; sections: string[] }> = {
  birth_chart: { title: 'Complete Birth Chart Report', sections: ['Your personality', 'Strengths', 'Challenges to work on', 'Key planets in your chart', 'Your current dasha period', 'Simple remedies'] },
  marriage: { title: 'Marriage Report', sections: ['Your approach to relationships', 'The 7th house and Venus', 'Favourable periods', 'What to look for in a partner', 'Simple remedies'] },
  career: { title: 'Career Report', sections: ['Natural talents', 'Suitable fields', 'The 10th house and Saturn', 'Favourable periods for growth', 'Practical guidance'] },
  finance: { title: 'Finance Report', sections: ['Your money nature', 'Sources of income in your chart', 'Saving and spending', 'Favourable periods', 'Practical guidance'] },
  yearly: { title: 'Yearly Prediction', sections: ['The year at a glance', 'Career and money', 'Love and family', 'Health and wellbeing', 'Month-by-month highlights', 'Advice for the year'] },
  compatibility: { title: 'Compatibility Report', sections: ['Guna Milan summary', 'Emotional bond', 'Communication', 'Long-term outlook', 'Suggestions for harmony'] },
};

export async function purchaseReport(userId: string, profileId: string, kind: ReportKind, lang: string, partnerProfileId?: string) {
  const prices = await getSetting('reports.price_paise');
  const price = prices[kind];
  const [profile] = await db().select().from(schema.birthProfiles).where(eq(schema.birthProfiles.id, profileId));
  if (!profile || profile.userId !== userId) throw new HttpError(404, 'profile_not_found');
  let partner: typeof profile | undefined;
  if (kind === 'compatibility') {
    if (!partnerProfileId) throw new HttpError(400, 'partner_required');
    [partner] = await db().select().from(schema.birthProfiles).where(eq(schema.birthProfiles.id, partnerProfileId));
    if (!partner || partner.userId !== userId) throw new HttpError(404, 'profile_not_found');
  }
  const report = await db().transaction(async (tx) => {
    const [r] = await tx.insert(schema.reports).values({ userId, profileId, partnerProfileId, kind, lang, pricePaise: price }).returning();
    await moveUserMoney(tx, userId, -price, 'report_purchase', { note: `${kind} report ${r.id}` });
    await platformEntry(tx, price, 'report_purchase', { note: r.id });
    return r;
  });
  // Generate in the background; the app polls GET /reports/:id.
  generate(report.id, profile, kind, lang, partner).catch(async (e) => {
    console.error('report failed', e);
    await db().transaction(async (tx) => {
      await tx.update(schema.reports).set({ status: 'failed' }).where(eq(schema.reports.id, report.id));
      await moveUserMoney(tx, userId, price, 'refund', { note: `report ${report.id} failed` });
      await platformEntry(tx, -price, 'refund', { note: report.id });
    });
  });
  return report;
}

async function generate(id: string, profile: typeof schema.birthProfiles.$inferSelect, kind: ReportKind, lang: string,
  partner?: typeof schema.birthProfiles.$inferSelect) {
  const info = REPORT_INFO[kind];
  const chart = computeChart({ date: profile.date, time: profile.timeAccuracy === 'unknown' ? null : profile.time, tzOffsetMinutes: profile.tzOffsetMinutes, lat: profile.lat, lon: profile.lon });
  const summary = chartSummary(chart);
  let extra = '';
  let matching: ReturnType<typeof gunaMilan> | null = null;
  if (partner) {
    const pc = computeChart({ date: partner.date, time: partner.timeAccuracy === 'unknown' ? null : partner.time, tzOffsetMinutes: partner.tzOffsetMinutes, lat: partner.lat, lon: partner.lon });
    matching = gunaMilan({ moonSign: chart.moonSign, nakshatra: chart.nakshatra }, { moonSign: pc.moonSign, nakshatra: pc.nakshatra });
    extra = `\nPartner chart:\n${chartContext(partner)}\nGuna Milan: ${matching.total}/36 (${matching.kootas.map((k) => `${k.name} ${k.score}/${k.max}`).join(', ')}).`;
  }
  const ai = await complete(
    `Write a "${info.title}" for this person.\n${chartContext(profile)}${extra}\n
Return strict JSON: {"summary": string, "sections": [{"title": string, "paragraphs": string[]}]} with these section titles in order: ${info.sections.join(' | ')}.
Each section 2–4 short paragraphs. Ground every statement in the chart factors given. Plain language for beginners; mention the astrological reason in brackets once per section.
No fear, no guaranteed outcomes, no medical/legal/investment advice. Remedies must be simple and free or low-cost (no gemstones as a must, no paid rituals).
Never predict death, lifespan, serious illness, accidents, divorce as certain, pregnancy, or the gender of a child. For marriage reports, never tell anyone not to marry because of a dosha; describe compatibility factors gently and suggest open conversation.`,
    { system: 'You are a senior Vedic astrologer writing a clear, kind, chart-grounded report. Output JSON only.', maxTokens: 4000 },
  );
  let body: { summary: string; sections: { title: string; paragraphs: string[] }[] };
  try { body = JSON.parse(ai!.slice(ai!.indexOf('{'), ai!.lastIndexOf('}') + 1)); } catch {
    body = {
      summary: 'Your report, built from your birth chart.',
      sections: summary.placements.map((p) => ({ title: p.planet, paragraphs: [p.simple, p.detailed] })),
    };
  }
  const content = { title: info.title, kind, profileName: profile.name, partnerName: partner?.name ?? null, basics: summary.basics,
    placements: summary.placements.map(({ planet, sign, house, degreeInSign, nakshatra, retrograde, dignity }) => ({ planet, sign, house, degreeInSign, nakshatra, retrograde, dignity })),
    matching, ...body, disclaimer: 'Astrology offers guidance for reflection, not guaranteed predictions.' };
  const localized = await translateObject(content, lang);
  await db().update(schema.reports).set({ status: 'ready', content: localized }).where(eq(schema.reports.id, id));
}
