import express, { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { handler, requireAuth } from '../lib/http.js';
import { buyDetailed, createReading, own, publicReading } from '../services/palm.js';
import { track } from '../services/analytics.js';

export const palmRoutes = Router();

/** Body: the raw palm photo (image/jpeg, png or webp, ≤5 MB). Query: hand=left|right. Returns the free quick reading. */
palmRoutes.post('/palm/readings', requireAuth, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), handler({
  query: z.object({ hand: z.enum(['left', 'right']), lang: z.string().default('en') }),
}, async ({ req, query, user }) => {
  const r = await createReading(user.id, query.hand, req.body as Buffer, query.lang);
  await track(user.id, 'palm_reading_created', { hand: query.hand });
  return r;
}));

palmRoutes.get('/palm/readings', requireAuth, handler({}, async ({ user }) => {
  const rows = await db().select().from(schema.palmReadings).where(eq(schema.palmReadings.userId, user.id)).orderBy(desc(schema.palmReadings.createdAt)).limit(30);
  return rows.map(publicReading);
}));

palmRoutes.get('/palm/readings/:id', requireAuth, handler({}, async ({ req, user }) => publicReading(await own(user.id, String(req.params.id)))));

palmRoutes.post('/palm/readings/:id/detailed', requireAuth, handler({}, async ({ req, user }) => {
  const r = await buyDetailed(user.id, String(req.params.id));
  await track(user.id, 'palm_detailed_purchased');
  return r;
}));
