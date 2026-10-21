import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db, schema } from '../db/client.js';
import { translate } from './translate.js';

/** Saves an in-app notification and sends an Expo push in the user's language (if they allowed this kind). */
export async function notify(userId: string, kind: string, en: { title: string; body: string }, data: Record<string, unknown> = {}) {
  const [u] = await db().select().from(schema.users).where(eq(schema.users.id, userId));
  if (!u) return;
  const title = await translate(en.title, u.language, 'en');
  const body = await translate(en.body, u.language, 'en');
  await db().insert(schema.notifications).values({ userId, kind, title, body, data });
  if (u.notificationPrefs[kind] === false || !u.pushToken) return;
  await sendPush([{ to: u.pushToken, title, body, data: { kind, ...data } }]);
}

export async function sendPush(messages: { to: string; title: string; body: string; data?: Record<string, unknown> }[]) {
  if (!messages.length) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(env.expoAccessToken ? { Authorization: `Bearer ${env.expoAccessToken}` } : {}) },
      body: JSON.stringify(messages.map((m) => ({ sound: 'default', ...m }))),
    });
  } catch (e) { console.error('push failed', e); }
}
