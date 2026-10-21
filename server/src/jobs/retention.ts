// Data retention (DPDP Act s.8(7): erase personal data once its purpose is served).
// Defaults keep data at least one year (DPDP Rules 2025, rule 8(3)) and can be changed with env vars after legal review.
import { rm } from 'node:fs/promises';
import { and, isNotNull, lt, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';

const days = (name: string, fallback: number) => Number(process.env[name] ?? fallback);
const ago = (d: number) => new Date(Date.now() - d * 86_400_000);

export async function runRetention() {
  // Palm photos: the written reading stays; the photo itself is deleted.
  const palms = await db().update(schema.palmReadings).set({ imagePath: '' })
    .where(and(lt(schema.palmReadings.createdAt, ago(days('RETAIN_PALM_PHOTO_DAYS', 365))), sql`${schema.palmReadings.imagePath} <> ''`))
    .returning({ id: schema.palmReadings.id }); // files were removed by removeOldPalmFiles() just before
  // Chat transcripts.
  const msgs = await db().delete(schema.messages).where(lt(schema.messages.createdAt, ago(days('RETAIN_CHAT_DAYS', 548)))).returning({ id: schema.messages.id });
  // In-app notifications and analytics events.
  await db().delete(schema.notifications).where(lt(schema.notifications.createdAt, ago(days('RETAIN_NOTIFICATION_DAYS', 180))));
  await db().update(schema.analyticsEvents).set({ userId: null }).where(and(isNotNull(schema.analyticsEvents.userId), lt(schema.analyticsEvents.createdAt, ago(days('RETAIN_ANALYTICS_DAYS', 365)))));
  // OTP rows (only throttle counters remain after a day).
  await db().delete(schema.otpCodes).where(lt(schema.otpCodes.expiresAt, ago(1)));
  return { palmPhotos: palms.length, messages: msgs.length };
}

/** Deletes photo files whose readings are older than the retention period. Runs before the DB update. */
export async function removeOldPalmFiles() {
  const rows = await db().select({ path: schema.palmReadings.imagePath }).from(schema.palmReadings)
    .where(and(lt(schema.palmReadings.createdAt, ago(days('RETAIN_PALM_PHOTO_DAYS', 365))), sql`${schema.palmReadings.imagePath} <> ''`));
  for (const r of rows) await rm(r.path, { force: true }).catch(() => {});
}
