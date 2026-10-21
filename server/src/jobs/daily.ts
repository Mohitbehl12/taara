import { and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { sendPush } from '../services/notify.js';
import { translate } from '../services/translate.js';

/** Morning push in each user's language: "Your daily horoscope is ready". */
export async function dailyHoroscopePush() {
  const users = await db().select({ token: schema.users.pushToken, lang: schema.users.language, prefs: schema.users.notificationPrefs })
    .from(schema.users).where(and(eq(schema.users.blocked, false), isNotNull(schema.users.pushToken)));
  const text = new Map<string, { title: string; body: string }>();
  for (const l of new Set(users.map((u) => u.lang))) {
    text.set(l, { title: await translate('Namaste 🙏', l, 'en'), body: await translate('Your daily horoscope is ready.', l, 'en') });
  }
  const msgs = users.filter((u) => u.prefs.daily_horoscope !== false).map((u) => ({ to: u.token!, ...text.get(u.lang)!, data: { kind: 'daily_horoscope' } }));
  for (let i = 0; i < msgs.length; i += 100) await sendPush(msgs.slice(i, i + 100));
}
