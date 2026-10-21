import { db, schema } from '../db/client.js';

// Every price and promotional rule lives here and is editable from the admin panel.
export const DEFAULT_SETTINGS = {
  'ai.billing_mode': 'per_minute' as 'per_minute' | 'per_message',
  'ai.rate_per_min_paise': 500,           // ₹5/min
  'ai.rate_per_message_paise': 200,       // ₹2/message (only in per_message mode)
  'ai.idle_pause_seconds': 120,           // per-minute AI sessions pause when the user is idle
  'free.pandit_minutes': 60,
  'free.warn_at_minutes': [10, 5, 1],
  'free.consent_timeout_seconds': 60,     // time to confirm "continue at ₹X/min" after free time ends
  'free.pandit_payout_paise_per_min': 300,
  'pandit.min_rate_paise': 500,
  'pandit.max_rate_paise': 20000,
  'pandit.commission_pct': 30,
  'pandit.request_timeout_seconds': 60,
  'pandit.min_payout_paise': 50000,
  'wallet.topups_paise': [10000, 25000, 50000, 100000],
  'wallet.low_balance_minutes': 3,
  'gst.pct': 18,
  'palm.free_readings_per_day': 3,
  'palm.detailed_price_paise': 9900,
  'reports.price_paise': { birth_chart: 9900, marriage: 19900, career: 14900, finance: 14900, yearly: 19900, compatibility: 14900 },
};
export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type SettingValue<K extends SettingKey> = (typeof DEFAULT_SETTINGS)[K];

let cache: { at: number; values: Partial<Record<SettingKey, unknown>> } | null = null;

export async function allSettings(): Promise<typeof DEFAULT_SETTINGS> {
  if (!cache || Date.now() - cache.at > 15_000) {
    const rows = await db().select().from(schema.settings);
    cache = { at: Date.now(), values: Object.fromEntries(rows.map((r) => [r.key, r.value])) };
  }
  return { ...DEFAULT_SETTINGS, ...(cache.values as object) };
}

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  return (await allSettings())[key];
}

export async function setSetting(key: SettingKey, value: unknown) {
  await db().insert(schema.settings).values({ key, value }).onConflictDoUpdate({
    target: schema.settings.key, set: { value, updatedAt: new Date() },
  });
  cache = null;
}

export function clearSettingsCache() { cache = null; }
