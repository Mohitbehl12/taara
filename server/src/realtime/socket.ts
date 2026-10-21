import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/client.js';
import { HttpError, verifyToken } from '../lib/http.js';
import { billingEvents, publicSession, recordActivity, type BillingEvent } from '../services/billing.js';
import { aiReply } from '../services/ai.js';
import { translate } from '../services/translate.js';
import { notify } from '../services/notify.js';
import { accessible, chartFor } from '../routes/consult.js';

/**
 * Rooms: `user:<id>` (all devices of a user), `session:<id>` (both participants).
 * Client → server: session:join, message:send, typing
 * Server → client: session:update, session:ended, session:requested, free:warning, free:ended, balance:low,
 *                  message:new, ai:delta, typing, error
 */
export function attachSockets(http: HttpServer, corsOrigin: string) {
  const io = new Server(http, { cors: { origin: corsOrigin === '*' ? true : corsOrigin.split(',') }, pingInterval: 20_000 });

  io.use((socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      socket.data.user = verifyToken(token);
      next();
    } catch { next(new Error('unauthorized')); }
  });

  io.on('connection', (socket) => {
    const userId: string = socket.data.user.id;
    socket.join(`user:${userId}`);

    socket.on('session:join', async (sessionId: string, ack?: (r: unknown) => void) => {
      try {
        const s = await accessible(String(sessionId), userId);
        socket.join(`session:${s.id}`);
        ack?.({ ok: true, session: s });
      } catch (e) { ack?.({ ok: false, error: errCode(e) }); }
    });

    socket.on('message:send', (payload: unknown, ack?: (r: unknown) => void) => {
      onMessage(io, socket, userId, payload).then((m) => ack?.({ ok: true, message: m })).catch((e) => ack?.({ ok: false, error: errCode(e) }));
    });

    socket.on('typing', async (sessionId: string) => {
      if (socket.rooms.has(`session:${sessionId}`)) socket.to(`session:${sessionId}`).emit('typing', { sessionId, userId });
    });
  });

  billingEvents.on('event', (e: BillingEvent) => route(io, e).catch((err) => console.error('socket route', err)));
  return io;
}

const sendSchema = z.object({ sessionId: z.string().uuid(), text: z.string().trim().min(1).max(2000), clientId: z.string().max(64).optional() });

async function onMessage(io: Server, socket: Socket, userId: string, payload: unknown) {
  const { sessionId, text, clientId } = sendSchema.parse(payload);
  const s = await accessible(sessionId, userId);
  const sender: 'user' | 'pandit' = s.userId === userId ? 'user' : 'pandit';
  if (s.status === 'awaiting_consent') throw new HttpError(409, 'awaiting_consent');
  await recordActivity(sessionId, sender); // also resumes a paused AI chat and charges per-message mode

  // Language of this message: users write in their app language; pandits in their reply language.
  let lang = s.userLanguage;
  let otherLang = s.userLanguage;
  if (s.panditId) {
    const [p] = await db().select({ replyLanguage: schema.pandits.replyLanguage }).from(schema.pandits).where(eq(schema.pandits.id, s.panditId));
    if (sender === 'pandit') { lang = p.replyLanguage; otherLang = s.userLanguage; } else { otherLang = p.replyLanguage; }
  }
  const [m] = await db().insert(schema.messages).values({ sessionId, sender, text, lang }).returning();
  io.to(`session:${sessionId}`).emit('message:new', { ...m, clientId });

  // Translate for the other side when languages differ. The original is always kept and shown on toggle.
  if (s.kind === 'pandit' && otherLang !== lang) {
    translate(text, otherLang, lang).then(async (t) => {
      if (t === text) return;
      const translations = { [otherLang]: t };
      await db().update(schema.messages).set({ translations }).where(eq(schema.messages.id, m.id));
      io.to(`session:${sessionId}`).emit('message:translated', { id: m.id, sessionId, translations });
    }).catch((e) => console.error('translate', e));
  }

  if (s.kind === 'ai' && sender === 'user') {
    io.to(`session:${sessionId}`).emit('typing', { sessionId, userId: 'ai' });
    const chartText = await chartFor(s);
    const pendingId = `ai-${m.id}`;
    const reply = await aiReply({
      sessionId, lang: s.userLanguage, chartText, voice: false,
      onDelta: (t) => io.to(`session:${sessionId}`).emit('ai:delta', { sessionId, pendingId, text: t }),
    });
    const [am] = await db().insert(schema.messages).values({ sessionId, sender: 'ai', text: reply, lang: s.userLanguage }).returning();
    io.to(`session:${sessionId}`).emit('message:new', { ...am, pendingId });
  }
  return m;
}

async function route(io: Server, e: BillingEvent) {
  switch (e.type) {
    case 'session_requested': {
      io.to(`user:${e.panditUserId}`).emit('session:requested', e.session);
      await notify(e.panditUserId, 'consultation', { title: 'New consultation request', body: 'A user wants to chat with you. Respond within a minute.' }, { sessionId: e.session.id });
      break;
    }
    case 'session_update':
    case 'session_ended': {
      const s = e.session;
      const ev = e.type === 'session_ended' ? 'session:ended' : 'session:update';
      // Pandits must not see the user's wallet balance.
      io.to(`user:${s.userId}`).to(`session:${s.id}`).emit(ev, s);
      if (s.panditUserId) io.to(`user:${s.panditUserId}`).emit(ev, { ...s, balancePaise: undefined, freeSecondsRemaining: undefined });
      break;
    }
    case 'free_warning': io.to(`user:${e.userId}`).emit('free:warning', e); break;
    case 'free_ended': {
      io.to(`user:${e.userId}`).emit('free:ended', e);
      const s = await publicSession(e.sessionId);
      if (s.panditUserId) io.to(`user:${s.panditUserId}`).emit('session:update', { ...s, balancePaise: undefined });
      break;
    }
    case 'low_balance': io.to(`user:${e.userId}`).emit('balance:low', e); break;
  }
}

const errCode = (e: unknown) => (e instanceof HttpError ? e.code : e instanceof z.ZodError ? 'invalid_input' : 'server_error');
