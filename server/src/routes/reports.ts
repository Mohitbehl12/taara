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

export const reportRoutes = Router();

reportRoutes.get('/reports/catalog', handler({}, async () => {
  const prices = await getSetting('reports.price_paise');
  return (Object.keys(REPORT_INFO) as ReportKind[]).map((k) => ({ kind: k, ...REPORT_INFO[k], pricePaise: prices[k] }));
}));

reportRoutes.post('/reports', requireAuth, handler({
  body: z.object({
    kind: z.enum(['birth_chart', 'marriage', 'career', 'finance', 'yearly', 'compatibility']), profileId: z.string().uuid(),
    partnerProfileId: z.string().uuid().optional(), lang: z.string().default('en'),
  }),
}, async ({ body, user }) => {
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
  const name = `${user.id.slice(0, 8)}-${randomUUID()}.${ext}`;
  const dir = path.join(UPLOAD_DIR, query.visibility);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), req.body);
  return { url: `${env.publicUrl}/${query.visibility === 'public' ? 'files' : 'admin/files'}/${name}` };
}));
