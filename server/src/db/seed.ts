// Demo data for local testing: an admin and six sample Pandits. Do NOT run against production.
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { connectPglite, connectPostgres, db, schema } from './client.js';

export async function seed() {
  const adminPhone = env.adminPhones[0] ?? '+919999999999';
  const [admin] = await db().select().from(schema.users).where(eq(schema.users.phone, adminPhone));
  if (!admin) await db().insert(schema.users).values({ phone: adminPhone, name: 'Admin', role: 'admin', language: 'en' });

  const demo = [
    { name: 'Pt. Raghav Sharma (Demo)', langs: ['hi', 'en', 'pa'], spec: ['vedic', 'career', 'marriage'], exp: 18, rate: 2000, reply: 'hi' },
    { name: 'Acharya Lakshmi Iyer (Demo)', langs: ['ta', 'te', 'en'], spec: ['kundli', 'marriage', 'remedies'], exp: 22, rate: 3500, reply: 'ta' },
    { name: 'Pt. Subrata Ghosh (Demo)', langs: ['bn', 'hi', 'as'], spec: ['vedic', 'finance', 'prashna'], exp: 12, rate: 1500, reply: 'bn' },
    { name: 'Jyotishi Meera Desai (Demo)', langs: ['gu', 'hi', 'mr'], spec: ['love', 'marriage', 'numerology'], exp: 9, rate: 1000, reply: 'gu' },
    { name: 'Pt. Anil Kulkarni (Demo)', langs: ['mr', 'kn', 'kok', 'hi'], spec: ['career', 'vastu', 'muhurat'], exp: 25, rate: 5000, reply: 'mr' },
    { name: 'Acharya Nadeem Qadri (Demo)', langs: ['ur', 'hi', 'ks'], spec: ['vedic', 'health', 'remedies'], exp: 15, rate: 2500, reply: 'ur' },
  ];
  for (const [i, d] of demo.entries()) {
    const phone = `+91900000000${i}`;
    const [exists] = await db().select().from(schema.users).where(eq(schema.users.phone, phone));
    if (exists) continue;
    const [u] = await db().insert(schema.users).values({ phone, name: d.name, language: d.reply }).returning();
    await db().insert(schema.pandits).values({
      userId: u.id, displayName: d.name, bio: `${d.exp} years of practice. Demo profile for testing — remove before launch.`,
      experienceYears: d.exp, specializations: d.spec, languages: d.langs, replyLanguage: d.reply, status: 'approved', approvedAt: new Date(),
      chatRatePaise: d.rate, voiceRatePaise: d.rate + 500, videoRatePaise: d.rate + 1000, online: i % 3 !== 2,
      ratingSum: [48, 47, 45, 49, 46, 44][i], ratingCount: 10, totalSessions: 40 + i * 13, // ratings average 4.4–4.9
    });
  }
  console.log(`Seeded. Admin phone: ${adminPhone}. Demo pandit phones: +919000000000…+919000000005`);
}

if (import.meta.url === `file://${process.argv[1]}` && env.nodeEnv === 'production') {
  console.log('seed: skipped in production (demo data must never reach a real database)');
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (env.databaseUrl) await connectPostgres(env.databaseUrl); else await connectPglite('./.data/db');
  await seed();
  process.exit(0);
}
