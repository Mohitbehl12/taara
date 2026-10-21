import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { env } from '../config/env.js';
import { db, schema } from '../db/client.js';
import { handler, HttpError, requireAuth } from '../lib/http.js';
import { getSetting } from '../lib/settings.js';
import { purchaseReport, REPORT_INFO, type ReportKind } from '../services/reports.js';
import { track } from '../services/analytics.js';
import { requireAdult, rateLimit } from '../services/safety.js';
import { LANGUAGE_CODES } from '../config/languages.js';

export const reportRoutes = Router();

reportRoutes.get('/reports/catalog', handler({}, async () => {
  const prices = await getSetting('reports.price_paise');
  return (Object.keys(REPORT_INFO) as ReportKind[]).map((k) => ({ kind: k, ...REPORT_INFO[k], pricePaise: prices[k] }));
}));

reportRoutes.post('/reports', requireAuth, handler({
  body: z.object({
    kind: z.enum(['birth_chart', 'marriage', 'career', 'finance', 'yearly', 'compatibility']), profileId: z.string().uuid(),
    partnerProfileId: z.string().uuid().optional(), lang: z.enum(LANGUAGE_CODES as [string, ...string[]]).default('en'),
  }),
}, async ({ body, user }) => {
  await requireAdult(user.id);
  const r = await purchaseReport(user.id, body.profileId, body.kind, body.lang, body.partnerProfileId);
  await track(user.id, 'report_purchased', { kind: body.kind });
  return r;
}));

reportRoutes.get('/reports', requireAuth, handler({}, async ({ user }) =>
  db().select({ id: schema.reports.id, kind: schema.reports.kind, status: schema.reports.status, createdAt: schema.reports.createdAt, profileId: schema.reports.profileId })
    .from(schema.reports).where(eq(schema.reports.userId, user.id)).orderBy(desc(schema.reports.createdAt))));

reportRoutes.get('/reports/:id', requireAuth, handler({}, async ({ req, user }) => {
  const [r] = await db().select().from(schema.reports).where(and(eq(schema.reports.id, String(req.params.id)), eq(schema.reports.userId, user.id)));
  if (!r) throw new HttpError(404, 'report_not_found');
  return r;
}));

// ---------- uploads (profile photos are public; ID documents are private, admin-only) ----------
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR ?? '.data/uploads');
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

reportRoutes.post('/uploads', requireAuth, express.raw({ type: Object.keys(TYPES), limit: '6mb' }), handler({
  query: z.object({ visibility: z.enum(['public', 'private']).default('public') }),
}, async ({ req, query, user }) => {
  const ext = TYPES[req.header('content-type') ?? ''];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'unsupported_file');
  // Trust the file's bytes, not the declared type. Public files may only be images (no PDFs or anything else).
  if (sniff(req.body) !== ext) throw new HttpError(400, 'unsupported_file');
  if (query.visibility === 'public' && ext === 'pdf') throw new HttpError(400, 'unsupported_file');
  rateLimit(`upload:${user.id}`, 10, 10);
  const name = `${user.id.slice(0, 8)}-${randomUUID()}.${ext}`;
  const dir = path.join(UPLOAD_DIR, query.visibility);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), req.body);
  return { url: `${env.publicUrl}/${query.visibility === 'public' ? 'files' : 'admin/files'}/${name}` };
}));

/** Identifies a file by its magic bytes. */
export function sniff(b: Buffer): 'jpg' | 'png' | 'webp' | 'pdf' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.length > 5 && b.toString('ascii', 0, 5) === '%PDF-') return 'pdf';
  return null;
}
