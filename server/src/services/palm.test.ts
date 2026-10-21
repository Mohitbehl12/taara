import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { connectPglite, db, schema } from '../db/client.js';
import { clearSettingsCache } from '../lib/settings.js';
import { buyDetailed, createReading, setVisionForTests } from './palm.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000)]);
const quick = { isPalm: true, imageIssue: null, handShape: { type: 'earth', observation: 'Square palm', meaning: 'Practical' },
  lines: [{ key: 'heart', visible: true, observation: 'Long and clear', meaning: 'Warm-hearted' }], summary: 'Balanced.' };
const detailed = { mounts: [], fingers: { observation: 'Long fingers', meaning: 'Patient' }, markings: [], sections: [{ key: 'love', title: 'Love', paragraphs: ['…'] }] };
let userId: string;
const bal = async () => (await db().select().from(schema.users).where(eq(schema.users.id, userId)))[0].balancePaise;

beforeAll(async () => { process.env.UPLOAD_DIR = '/tmp/claude-0/palm-test'; await connectPglite(); });
beforeEach(async () => {
  await db().execute(sql`truncate ledger, palm_readings, users, settings cascade`);
  clearSettingsCache();
  [{ id: userId }] = await db().insert(schema.users).values({ name: 'P', balancePaise: 20000 }).returning();
});

describe('palm reading', () => {
  it('rejects photos that are not a palm and does not count them', async () => {
    setVisionForTests(async () => ({ ...quick, isPalm: false, imageIssue: 'blurry' }));
    await expect(createReading(userId, 'right', JPEG, 'hi')).rejects.toMatchObject({ code: 'palm_not_clear', message: 'blurry' });
    expect((await db().select().from(schema.palmReadings)).length).toBe(0);
  });
  it('rejects non-image uploads', async () => {
    await expect(createReading(userId, 'right', Buffer.from('hello world'), 'hi')).rejects.toMatchObject({ code: 'unsupported_image' });
  });
  it('gives 3 free quick readings a day', async () => {
    setVisionForTests(async () => quick);
    for (let i = 0; i < 3; i++) await createReading(userId, 'left', JPEG, 'hi');
    await expect(createReading(userId, 'left', JPEG, 'hi')).rejects.toMatchObject({ code: 'palm_daily_limit' });
  });
  it('charges for the detailed reading once', async () => {
    setVisionForTests(async () => quick);
    const r = await createReading(userId, 'right', JPEG, 'hi');
    setVisionForTests(async () => detailed);
    const d = await buyDetailed(userId, r.id);
    expect(d.detailed?.fingers.observation).toBe('Long fingers');
    await buyDetailed(userId, r.id);
    expect(await bal()).toBe(20000 - 9900);
  });
  it('refunds when the detailed reading fails', async () => {
    setVisionForTests(async () => quick);
    const r = await createReading(userId, 'right', JPEG, 'hi');
    setVisionForTests(async () => { throw new Error('model down'); });
    await expect(buyDetailed(userId, r.id)).rejects.toMatchObject({ code: 'palm_failed' });
    expect(await bal()).toBe(20000);
  });
});
