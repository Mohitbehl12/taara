import { db, schema } from '../db/client.js';

export const TRACKED_EVENTS = [
  'app_opened', 'signup_completed', 'birth_details_completed', 'horoscope_viewed', 'kundli_viewed', 'match_generated',
  'report_purchased', 'ai_session_started', 'pandit_session_requested', 'pandit_session_started', 'topup_completed',
  'pandit_applied', 'language_changed',
];

export async function track(userId: string | null, name: string, props: Record<string, unknown> = {}) {
  try { await db().insert(schema.analyticsEvents).values({ userId, name, props }); } catch (e) { console.error('track', e); }
}
