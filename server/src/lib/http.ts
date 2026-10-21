import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { z, ZodError } from 'zod';
import { env } from '../config/env.js';
import { db, schema } from '../db/client.js';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

export interface AuthUser { id: string; role: string }
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: AuthUser } }
}

export const signToken = (u: AuthUser) => jwt.sign({ sub: u.id, role: u.role }, env.jwtSecret, { expiresIn: '60d' });

export function verifyToken(token: string): AuthUser {
  const p = jwt.verify(token, env.jwtSecret) as { sub: string; role: string };
  return { id: p.sub, role: p.role };
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
    const u = verifyToken(h.slice(7));
    const [row] = await db().select({ blocked: schema.users.blocked, role: schema.users.role })
      .from(schema.users).where(eq(schema.users.id, u.id));
    if (!row) throw new HttpError(401, 'unauthorized');
    if (row.blocked) throw new HttpError(403, 'account_blocked');
    req.user = { id: u.id, role: row.role };
    next();
  } catch (e) {
    next(e instanceof HttpError ? e : new HttpError(401, 'unauthorized'));
  }
};

export const requireAdmin: RequestHandler = (req, _res, next) =>
  next(req.user?.role === 'admin' ? undefined : new HttpError(403, 'forbidden'));

/** Wrap async handlers and validate body/query with zod. */
export function handler<B extends z.ZodTypeAny = z.ZodAny, Q extends z.ZodTypeAny = z.ZodAny>(
  opts: { body?: B; query?: Q },
  fn: (ctx: { req: Request; res: Response; body: z.infer<B>; query: z.infer<Q>; user: AuthUser }) => Promise<unknown>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const body = (opts.body ? opts.body.parse(req.body ?? {}) : req.body) as z.infer<B>;
      const query = (opts.query ? opts.query.parse(req.query) : req.query) as z.infer<Q>;
      const out = await fn({ req, res, body, query, user: req.user as AuthUser });
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (e) { next(e); }
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'invalid_input', details: err.issues });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
  console.error(err);
  res.status(500).json({ error: 'server_error' });
}
