// Server-authoritative session billing. The phone shows a timer; this module decides what is charged.
// Rules (see docs/SPEC.md §3):
//  - free minutes first (pandit chat only, participating pandits), then an explicit "continue at ₹X/min?" consent
//  - paid time charged pro-rata per second, rounded on the cumulative total so there is no drift
//  - a session never charges more than the wallet holds; it ends gracefully at zero
import { EventEmitter } from 'node:events';
import { and, eq, inArray, lt, or } from 'drizzle-orm';
import { db, schema, type Tx } from '../db/client.js';
import { HttpError } from '../lib/http.js';
import { allSettings } from '../lib/settings.js';
import { lockPandit, lockUser, movePanditMoney, moveUserMoney, platformEntry } from './wallet.js';

export type Session = typeof schema.sessions.$inferSelect;
export type BillingEvent =
  | { type: 'session_update'; session: PublicSession }
  | { type: 'free_warning'; sessionId: string; userId: string; minutesLeft: number }
  | { type: 'free_ended'; sessionId: string; userId: string; ratePaise: number; consentDeadline: string }
  | { type: 'low_balance'; sessionId: string; userId: string; balancePaise: number; minutesLeft: number }
  | { type: 'session_ended'; session: PublicSession }
  | { type: 'session_requested'; session: PublicSession; panditUserId: string };

export const billingEvents = new EventEmitter();
billingEvents.setMaxListeners(50);

export interface PublicSession extends Session { balancePaise?: number; freeSecondsRemaining?: number; panditUserId?: string | null }

const sec = (a: Date, b: Date) => Math.max(0, Math.floor((a.getTime() - b.getTime()) / 1000));
const ACTIVE = ['active'];

// ---------- start / accept ----------
export async function startSession(input: {
  userId: string; kind: 'ai' | 'pandit'; mode: 'chat' | 'voice' | 'video'; panditId?: string; profileId?: string; palmReadingId?: string; now?: Date;
}) {
  const now = input.now ?? new Date();
  const s = await allSettings();
  return db().transaction(async (tx) => {
    const user = await lockUser(tx, input.userId);

    // one live session per user at a time
    const [open] = await tx.select({ id: schema.sessions.id }).from(schema.sessions).where(and(
      eq(schema.sessions.userId, user.id),
      inArray(schema.sessions.status, ['requested', 'active', 'awaiting_consent', 'paused']),
    ));
    if (open) throw new HttpError(409, 'session_already_open', open.id);

    let ratePaise: number; let billingMode: 'per_minute' | 'per_message' = 'per_minute';
    let freeEligible = false; let panditId: string | null = null;

    if (input.kind === 'ai') {
      if (input.mode === 'video') throw new HttpError(400, 'ai_video_not_supported');
      billingMode = input.mode === 'chat' ? s['ai.billing_mode'] : 'per_minute';
      ratePaise = billingMode === 'per_message' ? s['ai.rate_per_message_paise'] : s['ai.rate_per_min_paise'];
    } else {
      if (!input.panditId) throw new HttpError(400, 'pandit_required');
      const p = await lockPandit(tx, input.panditId);
      if (p.status !== 'approved') throw new HttpError(404, 'pandit_not_available');
      if (!p.online || p.busy) throw new HttpError(409, 'pandit_busy');
      if (p.userId === user.id) throw new HttpError(400, 'cannot_consult_self');
      panditId = p.id;
      ratePaise = input.mode === 'chat' ? p.chatRatePaise : input.mode === 'voice' ? p.voiceRatePaise : p.videoRatePaise;
      freeEligible = input.mode === 'chat' && p.participatesInFree && user.freeSecondsRemaining > 0;
    }

    if (!freeEligible && user.balancePaise < ratePaise) {
      throw new HttpError(402, 'insufficient_balance', `Need at least ₹${(ratePaise / 100).toFixed(2)} to start`);
    }

    const isAi = input.kind === 'ai';
    const [row] = await tx.insert(schema.sessions).values({
      userId: user.id, panditId, profileId: input.profileId, palmReadingId: input.kind === 'ai' ? input.palmReadingId : undefined, kind: input.kind, mode: input.mode,
      status: isAi ? 'active' : 'requested', billingMode, ratePaise, userLanguage: user.language, freeEligible,
      startedAt: isAi ? now : null, lastTickAt: isAi ? now : null, lastActivityAt: now, requestedAt: now,
    }).returning();
    if (panditId) await tx.update(schema.pandits).set({ busy: true }).where(eq(schema.pandits.id, panditId));
    return row;
  }).then(async (row) => {
    const pub = await publicSession(row.id);
    if (row.kind === 'pandit') billingEvents.emit('event', { type: 'session_requested', session: pub, panditUserId: pub.panditUserId! } satisfies BillingEvent);
    return pub;
  });
}

export async function respondToRequest(panditUserId: string, sessionId: string, accept: boolean, now = new Date()) {
  await db().transaction(async (tx) => {
    const [ss] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).for('update');
    if (!ss || ss.kind !== 'pandit') throw new HttpError(404, 'session_not_found');
    const p = await lockPandit(tx, ss.panditId!);
    if (p.userId !== panditUserId) throw new HttpError(403, 'forbidden');
    if (ss.status !== 'requested') throw new HttpError(409, 'not_pending');
    if (accept) {
      await tx.update(schema.sessions).set({ status: 'active', startedAt: now, lastTickAt: now, lastActivityAt: now })
        .where(eq(schema.sessions.id, sessionId));
    } else {
      await tx.update(schema.sessions).set({ status: 'rejected', endedAt: now, endReason: 'declined' })
        .where(eq(schema.sessions.id, sessionId));
      await tx.update(schema.pandits).set({ busy: false }).where(eq(schema.pandits.id, p.id));
    }
  });
  const pub = await publicSession(sessionId);
  billingEvents.emit('event', { type: accept ? 'session_update' : 'session_ended', session: pub } as BillingEvent);
  return pub;
}

// ---------- the tick ----------
/** Bills elapsed time since lastTickAt. Safe to call any number of times; idempotent for the same `now`. */
export async function tick(sessionId: string, now = new Date()): Promise<BillingEvent[]> {
  const s = await allSettings();
  const events: BillingEvent[] = [];
  await db().transaction(async (tx) => {
    const [ss] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).for('update');
    if (!ss || !ACTIVE.includes(ss.status) || !ss.lastTickAt) return;
    const user = await lockUser(tx, ss.userId);

    let billUntil = now;
    let pauseForIdle = false;
    // AI chat and AI voice both pause when the user goes quiet, so nobody pays for an idle screen.
    if (ss.kind === 'ai' && ss.billingMode === 'per_minute' && ss.lastActivityAt) {
      const idleLimit = new Date(ss.lastActivityAt.getTime() + s['ai.idle_pause_seconds'] * 1000);
      if (now > idleLimit) { billUntil = idleLimit > ss.lastTickAt ? idleLimit : ss.lastTickAt; pauseForIdle = true; }
    }
    if (ss.billingMode === 'per_message') {
      await tx.update(schema.sessions).set({ lastTickAt: now }).where(eq(schema.sessions.id, ss.id));
      return;
    }

    let elapsed = sec(billUntil, ss.lastTickAt);
    // advance lastTickAt by whole seconds only, so fractions carry to the next tick
    const newLastTick = new Date(ss.lastTickAt.getTime() + elapsed * 1000);
    const patch: Partial<Session> = { lastTickAt: pauseForIdle ? now : newLastTick };
    const warnings = new Set(ss.warningsSent);
    let freeSecondsRemaining = user.freeSecondsRemaining;

    // 1) free seconds
    if (ss.freeEligible && freeSecondsRemaining > 0 && elapsed > 0) {
      const use = Math.min(elapsed, freeSecondsRemaining);
      freeSecondsRemaining -= use;
      elapsed -= use;
      const freeUsed = ss.freeSecondsUsed + use;
      patch.freeSecondsUsed = freeUsed;
      await tx.update(schema.users).set({ freeSecondsRemaining }).where(eq(schema.users.id, user.id));

      // pay the pandit for free minutes from the platform's marketing budget (cumulative rounding)
      const payTarget = Math.floor((freeUsed * s['free.pandit_payout_paise_per_min']) / 60);
      const payDelta = payTarget - Math.floor((ss.freeSecondsUsed * s['free.pandit_payout_paise_per_min']) / 60);
      if (payDelta > 0) {
        await movePanditMoney(tx, ss.panditId!, payDelta, 'free_minutes_payout', { sessionId: ss.id });
        await platformEntry(tx, -payDelta, 'free_minutes_payout', { sessionId: ss.id });
        patch.panditEarnedPaise = ss.panditEarnedPaise + payDelta;
      }

      for (const m of s['free.warn_at_minutes']) {
        const key = `free_${m}`;
        if (freeSecondsRemaining <= m * 60 && freeSecondsRemaining > 0 && !warnings.has(key)) {
          warnings.add(key);
          events.push({ type: 'free_warning', sessionId: ss.id, userId: user.id, minutesLeft: Math.ceil(freeSecondsRemaining / 60) });
        }
      }

      if (freeSecondsRemaining === 0) {
        // Free time is over. Pause until the user explicitly agrees to the paid rate. Leftover seconds are not billed.
        const deadline = new Date(now.getTime() + s['free.consent_timeout_seconds'] * 1000);
        patch.status = 'awaiting_consent';
        patch.consentDeadline = deadline;
        patch.lastTickAt = now;
        patch.warningsSent = [...warnings];
        await tx.update(schema.sessions).set(patch).where(eq(schema.sessions.id, ss.id));
        events.push({ type: 'free_ended', sessionId: ss.id, userId: user.id, ratePaise: ss.ratePaise, consentDeadline: deadline.toISOString() });
        return;
      }
    }

    // 2) paid seconds
    let endReason: string | null = null;
    if (elapsed > 0) {
      const paidSeconds = ss.paidSeconds + elapsed;
      const target = Math.round((paidSeconds * ss.ratePaise) / 60);
      let delta = target - ss.chargedPaise;
      if (delta > user.balancePaise) { delta = user.balancePaise; endReason = 'insufficient_balance'; }
      if (delta > 0) await moveUserMoney(tx, user.id, -delta, 'session_charge', { sessionId: ss.id });
      const charged = ss.chargedPaise + delta;
      patch.paidSeconds = paidSeconds;
      patch.chargedPaise = charged;

      if (ss.kind === 'pandit' && delta > 0) {
        const share = (100 - s['pandit.commission_pct']) / 100;
        const earnDelta = Math.floor(charged * share) - Math.floor(ss.chargedPaise * share);
        await movePanditMoney(tx, ss.panditId!, earnDelta, 'pandit_earning', { sessionId: ss.id });
        await platformEntry(tx, delta - earnDelta, 'session_charge', { sessionId: ss.id, note: 'commission' });
        patch.panditEarnedPaise = (patch.panditEarnedPaise ?? ss.panditEarnedPaise) + earnDelta;
      } else if (delta > 0) {
        await platformEntry(tx, delta, 'session_charge', { sessionId: ss.id, note: 'ai' });
      }

      const balance = user.balancePaise - delta;
      const minutesLeft = Math.floor(balance / ss.ratePaise);
      if (!endReason && minutesLeft < s['wallet.low_balance_minutes'] && !warnings.has('low_balance')) {
        warnings.add('low_balance');
        events.push({ type: 'low_balance', sessionId: ss.id, userId: user.id, balancePaise: balance, minutesLeft });
      }
      if (!endReason && balance < Math.ceil(ss.ratePaise / 60)) endReason = 'insufficient_balance';
    }

    patch.warningsSent = [...warnings];
    if (pauseForIdle && !endReason) patch.status = 'paused';
    if (endReason) Object.assign(patch, { status: 'ended', endedAt: now, endReason });
    await tx.update(schema.sessions).set(patch).where(eq(schema.sessions.id, ss.id));
    if (endReason) await finishStats(tx, ss, patch);
  });
  const pub = await publicSession(sessionId);
  events.push(pub.status === 'ended' ? { type: 'session_ended', session: pub } : { type: 'session_update', session: pub });
  for (const e of events) billingEvents.emit('event', e);
  return events;
}

async function finishStats(tx: Tx, ss: Session, patch: Partial<Session>) {
  if (!ss.panditId) return;
  const total = (patch.freeSecondsUsed ?? ss.freeSecondsUsed) + (patch.paidSeconds ?? ss.paidSeconds);
  const p = await lockPandit(tx, ss.panditId);
  await tx.update(schema.pandits).set({
    busy: false, totalSessions: p.totalSessions + 1, totalSeconds: p.totalSeconds + total,
  }).where(eq(schema.pandits.id, p.id));
}

// ---------- user actions ----------
export async function consentToPaid(userId: string, sessionId: string, accept: boolean, now = new Date()) {
  await db().transaction(async (tx) => {
    const [ss] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).for('update');
    if (!ss || ss.userId !== userId) throw new HttpError(404, 'session_not_found');
    if (ss.status !== 'awaiting_consent') throw new HttpError(409, 'not_awaiting_consent');
    const user = await lockUser(tx, userId);
    if (accept && user.balancePaise >= ss.ratePaise) {
      await tx.update(schema.sessions).set({ status: 'active', lastTickAt: now, consentDeadline: null, lastActivityAt: now })
        .where(eq(schema.sessions.id, ss.id));
      return;
    }
    const reason = accept ? 'insufficient_balance' : 'declined_paid';
    await tx.update(schema.sessions).set({ status: 'ended', endedAt: now, endReason: reason }).where(eq(schema.sessions.id, ss.id));
    await finishStats(tx, ss, {});
  });
  const pub = await publicSession(sessionId);
  billingEvents.emit('event', { type: pub.status === 'ended' ? 'session_ended' : 'session_update', session: pub } as BillingEvent);
  return pub;
}

/** Record activity (a message sent). Resumes a paused AI session. Charges per-message sessions. */
export async function recordActivity(sessionId: string, actor: 'user' | 'pandit', now = new Date()) {
  let resumed = false;
  await db().transaction(async (tx) => {
    const [ss] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).for('update');
    if (!ss) throw new HttpError(404, 'session_not_found');
    if (ss.status === 'paused' && actor === 'user') {
      const user = await lockUser(tx, ss.userId);
      if (user.balancePaise < Math.ceil(ss.ratePaise / 60)) throw new HttpError(402, 'insufficient_balance');
      await tx.update(schema.sessions).set({ status: 'active', lastTickAt: now, lastActivityAt: now }).where(eq(schema.sessions.id, ss.id));
      resumed = true;
      return;
    }
    if (ss.status !== 'active') throw new HttpError(409, 'session_not_active');
    if (ss.billingMode === 'per_message' && actor === 'user') {
      await moveUserMoney(tx, ss.userId, -ss.ratePaise, 'session_charge', { sessionId: ss.id, note: 'per_message' });
      await platformEntry(tx, ss.ratePaise, 'session_charge', { sessionId: ss.id, note: 'ai per_message' });
      await tx.update(schema.sessions).set({ chargedPaise: ss.chargedPaise + ss.ratePaise, lastActivityAt: now })
        .where(eq(schema.sessions.id, ss.id));
      return;
    }
    await tx.update(schema.sessions).set({ lastActivityAt: now }).where(eq(schema.sessions.id, ss.id));
  });
  if (resumed) billingEvents.emit('event', { type: 'session_update', session: await publicSession(sessionId) } as BillingEvent);
}

export async function endSession(sessionId: string, byUserId: string | null, reason: string, now = new Date()) {
  const [ss] = await db().select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
  if (!ss) throw new HttpError(404, 'session_not_found');
  if (byUserId) {
    const isUser = ss.userId === byUserId;
    let isPandit = false;
    if (ss.panditId) {
      const [p] = await db().select({ userId: schema.pandits.userId }).from(schema.pandits).where(eq(schema.pandits.id, ss.panditId));
      isPandit = p?.userId === byUserId;
    }
    if (!isUser && !isPandit) throw new HttpError(403, 'forbidden');
  }
  if (ss.status === 'active') await tick(sessionId, now); // final billing up to this second
  await db().transaction(async (tx) => {
    const [cur] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).for('update');
    if (['ended', 'rejected', 'missed'].includes(cur.status)) return;
    const status = cur.status === 'requested' ? 'missed' : 'ended';
    await tx.update(schema.sessions).set({ status, endedAt: now, endReason: cur.status === 'requested' ? 'cancelled' : reason })
      .where(eq(schema.sessions.id, sessionId));
    if (cur.status === 'requested') {
      if (cur.panditId) await tx.update(schema.pandits).set({ busy: false }).where(eq(schema.pandits.id, cur.panditId));
    } else await finishStats(tx, cur, {});
  });
  const pub = await publicSession(sessionId);
  billingEvents.emit('event', { type: 'session_ended', session: pub } as BillingEvent);
  return pub;
}

export async function publicSession(sessionId: string): Promise<PublicSession> {
  const [ss] = await db().select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
  if (!ss) throw new HttpError(404, 'session_not_found');
  const [u] = await db().select({ balancePaise: schema.users.balancePaise, freeSecondsRemaining: schema.users.freeSecondsRemaining })
    .from(schema.users).where(eq(schema.users.id, ss.userId));
  let panditUserId: string | null = null;
  if (ss.panditId) {
    const [p] = await db().select({ userId: schema.pandits.userId }).from(schema.pandits).where(eq(schema.pandits.id, ss.panditId));
    panditUserId = p?.userId ?? null;
  }
  return { ...ss, ...u, panditUserId };
}

// ---------- background loop ----------
export async function sweep(now = new Date()) {
  const s = await allSettings();
  const live = await db().select({ id: schema.sessions.id, status: schema.sessions.status }).from(schema.sessions).where(or(
    eq(schema.sessions.status, 'active'),
    and(eq(schema.sessions.status, 'awaiting_consent'), lt(schema.sessions.consentDeadline, now)),
    and(eq(schema.sessions.status, 'requested'), lt(schema.sessions.requestedAt, new Date(now.getTime() - s['pandit.request_timeout_seconds'] * 1000))),
  ));
  for (const row of live) {
    try {
      if (row.status === 'active') await tick(row.id, now);
      else if (row.status === 'awaiting_consent') await endSession(row.id, null, 'no_consent', now);
      else {
        await db().transaction(async (tx) => {
          const [cur] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, row.id)).for('update');
          if (cur.status !== 'requested') return;
          await tx.update(schema.sessions).set({ status: 'missed', endedAt: now, endReason: 'no_answer' }).where(eq(schema.sessions.id, row.id));
          if (cur.panditId) await tx.update(schema.pandits).set({ busy: false }).where(eq(schema.pandits.id, cur.panditId));
        });
        billingEvents.emit('event', { type: 'session_ended', session: await publicSession(row.id) } as BillingEvent);
      }
    } catch (e) { console.error('sweep failed for', row.id, e); }
  }
}

let timer: NodeJS.Timeout | null = null;
export function startBillingLoop(intervalMs = 5000) {
  if (timer) return;
  timer = setInterval(() => { sweep().catch((e) => console.error('billing sweep', e)); }, intervalMs);
}
export function stopBillingLoop() { if (timer) clearInterval(timer); timer = null; }
