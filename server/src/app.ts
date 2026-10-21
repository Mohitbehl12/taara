import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './lib/http.js';
import { accountRoutes } from './routes/account.js';
import { astroRoutes } from './routes/astro.js';
import { walletRoutes, razorpayWebhook } from './routes/wallet.js';
import { consultRoutes } from './routes/consult.js';
import { panditRoutes } from './routes/pandit.js';
import { reportRoutes, UPLOAD_DIR } from './routes/reports.js';
import { adminRoutes } from './routes/admin.js';
import { palmRoutes } from './routes/palm.js';

export function buildApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.corsOrigins === '*' ? true : env.corsOrigins.split(',') }));

  // Raw body routes must come before express.json()
  app.post('/webhooks/razorpay', ...razorpayWebhook);

  app.use(express.json({ limit: '1mb' }));
  app.use('/auth', rateLimit({ windowMs: 10 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }));
  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/files', express.static(path.join(UPLOAD_DIR, 'public'), { maxAge: '7d', fallthrough: false }));

  for (const r of [accountRoutes, astroRoutes, walletRoutes, consultRoutes, panditRoutes, reportRoutes, palmRoutes, adminRoutes]) app.use(r);

  // Admin panel (built static files), if present
  const adminDist = path.resolve(process.env.ADMIN_DIST ?? '../admin/dist');
  app.use('/admin-panel', express.static(adminDist));
  app.get('/admin-panel/*splat', (_req, res) => res.sendFile(path.join(adminDist, 'index.html'), (err) => err && res.status(404).end()));

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }));
  app.use(errorHandler);
  return app;
}
