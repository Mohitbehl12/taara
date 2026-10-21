// End-to-end: phone login → onboarding → kundli → wallet top-up → AI chat over sockets → pandit chat with translation → admin.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioc, type Socket } from 'socket.io-client';

process.env.OTP_DEV_CODE = '123456';
process.env.ADMIN_PHONES = '+919999999999';
process.env.PUBLIC_URL = 'http://localhost:4000';

let base = '';
let http: Server;
let stop: () => void;

async function api(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const r = await fetch(base + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(`${r.status} ${JSON.stringify(j)}`), { status: r.status, body: j });
  return j;
}
const TERMS = '2026-10-22';
/** Logs in and (by default) records the 18+ / terms consent the app collects on first launch. */
const login = async (phone: string, deviceId?: string, consent = true) => {
  const r = await api('/auth/otp/verify', { body: { phone, code: '123456', deviceId } });
  if (consent) await api('/me/consent', { token: r.token, body: { termsVersion: TERMS, ageConfirmed: true } });
  return r;
};
const uploadJpeg = async (token: string, visibility: 'public' | 'private') => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]);
  const r = await fetch(`${base}/uploads?visibility=${visibility}`, { method: 'POST', headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${token}` }, body: jpeg });
  return (await r.json()) as { url: string };
};
const sock = (token: string) => new Promise<Socket>((res, rej) => {
  const s = ioc(base, { auth: { token }, transports: ['websocket'] });
  s.on('connect', () => res(s)); s.on('connect_error', rej);
});
const once = <T>(s: Socket, ev: string, pred: (x: T) => boolean = () => true) => new Promise<T>((res) => {
  const h = (x: T) => { if (pred(x)) { s.off(ev, h); res(x); } };
  s.on(ev, h);
});

beforeAll(async () => {
  const { connectPglite } = await import('./db/client.js');
  const { buildApp } = await import('./app.js');
  const { attachSockets } = await import('./realtime/socket.js');
  const { seed } = await import('./db/seed.js');
  const billing = await import('./services/billing.js');
  await connectPglite();
  await seed();
  http = createServer(buildApp());
  attachSockets(http, '*');
  await new Promise<void>((r) => http.listen(0, r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  billing.startBillingLoop(200);
  stop = billing.stopBillingLoop;
});
afterAll(() => { stop?.(); http?.close(); });

describe('user journey', () => {
  let token = ''; let profileId = '';

  it('logs in with OTP, gets 60 free minutes once per device', async () => {
    const r = await login('98765 43210', 'device-A');
    expect(r.isNew).toBe(true);
    expect(r.user.freeSecondsRemaining).toBe(3600);
    token = r.token;
    const second = await login('9123456789', 'device-A'); // same phone, new number
    expect(second.user.freeSecondsRemaining).toBe(0);
  });

  it('serves meta with 23 languages and admin-set prices', async () => {
    const m = await api('/meta');
    expect(m.languages).toHaveLength(23);
    expect(m.pricing.aiRatePerMinPaise).toBe(500);
    expect(m.pricing.freePanditMinutes).toBe(60);
  });

  it('creates a birth profile with automatic timezone and returns a kundli', async () => {
    const p = await api('/profiles', { token, body: { name: 'Mohit', date: '1990-08-15', time: '06:45', placeName: 'New Delhi, Delhi', lat: 28.6139, lon: 77.209 } });
    expect(p.tzOffsetMinutes).toBe(330);
    expect(p.isPrimary).toBe(true);
    profileId = p.id;
    const k = await api(`/profiles/${profileId}/kundli?lang=en`, { token });
    expect(k.placements).toHaveLength(9);
    expect(k.placements[0].simple).toMatch(/What this means/);
    expect(k.dasha.periods).toHaveLength(9);
    const home = await api('/home?lang=en', { token });
    expect(home.basics.rashi).toBeGreaterThanOrEqual(0);
    expect(home.horoscope.love).toBeTruthy();
    expect(home.panchang.tithi.name).toBeTruthy();
  });

  it('computes historic timezone abroad (New York 1990 in DST = -240)', async () => {
    const t = await api('/places/tz?lat=40.71&lon=-74.0&date=1990-07-01&time=12:00');
    expect(t.tzOffsetMinutes).toBe(-240);
  });

  it('matches two profiles', async () => {
    const b = await api('/profiles', { token, body: { name: 'Partner', relation: 'partner', date: '1992-02-10', time: null, timeAccuracy: 'unknown', placeName: 'Mumbai', lat: 19.076, lon: 72.8777 } });
    const m = await api('/match', { token, body: { groomProfileId: profileId, brideProfileId: b.id } });
    expect(m.max).toBe(36);
    expect(m.areas.overall).toBe(m.percent);
  });

  it('tops up the wallet (demo payments) once only', async () => {
    const o = await api('/wallet/topup', { token, body: { creditPaise: 25000 } });
    expect(o.gstPaise).toBe(4500);
    const c1 = await api('/wallet/topup/confirm', { token, body: { orderId: o.orderId } });
    const c2 = await api('/wallet/topup/confirm', { token, body: { orderId: o.orderId } });
    expect(c1.balancePaise).toBe(25000);
    expect(c2.alreadyCredited).toBe(true);
  });

  it('chats with the AI over sockets and gets a streamed reply', async () => {
    const s = await api('/sessions', { token, body: { kind: 'ai', mode: 'chat', profileId } });
    expect(s.status).toBe('active');
    const socket = await sock(token);
    await socket.emitWithAck('session:join', s.id);
    const reply = once<{ sender: string; text: string }>(socket, 'message:new', (m) => m.sender === 'ai');
    const ack = await socket.emitWithAck('message:send', { sessionId: s.id, text: 'Meri job kab change hogi?' });
    expect(ack.ok).toBe(true);
    expect((await reply).text.length).toBeGreaterThan(5);
    const ended = await api(`/sessions/${s.id}/end`, { token, body: {} });
    expect(ended.status).toBe('ended');
    socket.close();
  });

  it('chats with a Pandit: request → accept → free minutes → messages carry language', async () => {
    const list = await api('/pandits?lang=hi&online=true');
    const pandit = list.find((p: { displayName: string }) => p.displayName.startsWith('Pt. Raghav'));
    expect(pandit.verified).toBe(true);

    const pLogin = await login('+919000000000');
    const pSock = await sock(pLogin.token);
    const requested = once<{ id: string }>(pSock, 'session:requested');

    const s = await api('/sessions', { token, body: { kind: 'pandit', mode: 'chat', panditId: pandit.id, profileId } });
    expect(s.freeEligible).toBe(true);
    const req = await requested;
    expect(req.id).toBe(s.id);

    const client = await api(`/pandit/sessions/${s.id}/client`, { token: pLogin.token });
    expect(client.profile.placeName).toContain('Delhi');

    await api(`/pandit/sessions/${s.id}/respond`, { token: pLogin.token, body: { accept: true } });
    const uSock = await sock(token);
    await uSock.emitWithAck('session:join', s.id);
    await pSock.emitWithAck('session:join', s.id);
    const got = once<{ text: string; sender: string }>(pSock, 'message:new', (m) => m.sender === 'user');
    await uSock.emitWithAck('message:send', { sessionId: s.id, text: 'Namaste Pandit ji' });
    expect((await got).text).toBe('Namaste Pandit ji');

    await new Promise((r) => setTimeout(r, 1500)); // let the billing loop tick
    const end = await api(`/sessions/${s.id}/end`, { token, body: {} });
    expect(end.status).toBe('ended');
    expect(end.chargedPaise).toBe(0); // inside free minutes
    expect(end.freeSecondsUsed).toBeGreaterThanOrEqual(1);
    await api(`/sessions/${s.id}/review`, { token, body: { rating: 5, text: 'Very helpful' } });
    uSock.close(); pSock.close();
  });

  it('blocks non-admins from admin routes and lets admins change prices', async () => {
    await expect(api('/admin/dashboard', { token })).rejects.toMatchObject({ status: 403 });
    const admin = await login('+919999999999');
    const d = await api('/admin/dashboard', { token: admin.token });
    expect(d.users.total).toBeGreaterThan(2);
    await api('/admin/settings', { method: 'PUT', token: admin.token, body: { 'ai.rate_per_min_paise': 700 } });
    await new Promise((r) => setTimeout(r, 10));
    const { clearSettingsCache } = await import('./lib/settings.js');
    clearSettingsCache();
    expect((await api('/meta')).pricing.aiRatePerMinPaise).toBe(700);
    await expect(api('/admin/settings', { method: 'PUT', token: admin.token, body: { 'ai.rate_per_min_paise': 'free' } })).rejects.toMatchObject({ status: 400 });
  });

  it('pandit applies, admin approves, pandit sets price within limits', async () => {
    const u = await login('9811122233');
    await api('/pandit/apply', { token: u.token, body: {
      displayName: 'Pt. New Applicant', bio: 'Vedic astrologer', experienceYears: 5, specializations: ['vedic'], languages: ['hi', 'mai'], replyLanguage: 'hi',
      chatRatePaise: 1200, voiceRatePaise: 1500, videoRatePaise: 2000, acceptConduct: true,
      verification: { fullName: 'New Applicant', address: 'Darbhanga, Bihar', idDocType: 'pan', idDocUrl: (await uploadJpeg(u.token, 'private')).url },
    } });
    const admin = await login('+919999999999');
    const pending = await api('/admin/pandits?status=pending', { token: admin.token });
    expect(pending).toHaveLength(1);
    await api(`/admin/pandits/${pending[0].id}/review`, { token: admin.token, body: { decision: 'approved' } });
    await expect(api('/pandit/me', { method: 'PATCH', token: u.token, body: { chatRatePaise: 100 } })).rejects.toMatchObject({ status: 400 });
    const me = await api('/pandit/me', { method: 'PATCH', token: u.token, body: { chatRatePaise: 3000 } });
    expect(me.chatRatePaise).toBe(3000);
    expect((await api('/pandits?lang=mai')).some((p: { id: string }) => p.id === pending[0].id)).toBe(true);
  });

  it('exports the user\'s data (DPDP right to access)', async () => {
    const data = await api('/me/export', { token });
    expect(data.account.id).toBeTruthy();
    expect(data.birthProfiles.length).toBeGreaterThan(0);
    expect(data.consultations.length).toBeGreaterThan(0);
  });

  it('deletes the account and revokes its token', async () => {
    await api('/me', { method: 'DELETE', token });
    await expect(api('/me', { token })).rejects.toMatchObject({ status: 401 });
  });
});

describe('safety and compliance', () => {
  it('requires terms + 18+ consent before paid or AI features', async () => {
    const r = await login('9800011122', 'dev-c1', false);
    expect(r.user.consentCurrent).toBe(false);
    await expect(api('/wallet/topup', { token: r.token, body: { creditPaise: 10000 } })).rejects.toMatchObject({ status: 403 });
    await expect(api('/me/consent', { token: r.token, body: { termsVersion: 'old', ageConfirmed: true } })).rejects.toMatchObject({ status: 400 });
    const me = await api('/me/consent', { token: r.token, body: { termsVersion: TERMS, ageConfirmed: true } });
    expect(me.consentCurrent).toBe(true);
    expect(me.notificationPrefs.campaigns).toBe(false); // marketing is opt-in
  });

  it('refuses an under-18 own chart, but allows a parent to add a child\'s chart', async () => {
    const r = await login('9800011133', 'dev-c2');
    const y = new Date().getFullYear() - 15;
    const teen = { name: 'Teen', relation: 'self', date: `${y}-01-01`, time: '10:00', timeAccuracy: 'exact', placeName: 'Delhi', lat: 28.61, lon: 77.21, isPrimary: true };
    await expect(api('/profiles', { token: r.token, body: teen })).rejects.toMatchObject({ status: 403, body: { error: 'age_restricted' } });
    // A parent can still add their child's chart.
    await api('/profiles', { token: r.token, body: { ...teen, name: 'My son', relation: 'child', isPrimary: false } });
  });

  it('throttles OTP sends per phone', async () => {
    await api('/auth/otp/send', { body: { phone: '9800011144' } });
    await expect(api('/auth/otp/send', { body: { phone: '9800011144' } })).rejects.toMatchObject({ status: 429 });
  });

  it('masks phone numbers, UPI IDs and links in Pandit chats, but not dates', async () => {
    const u = await login('9800011155', 'dev-c3');
    const list = await api('/pandits?online=true', { token: u.token });
    const pandit = list.find((p: { displayName: string }) => p.displayName.startsWith('Acharya Lakshmi'));
    const pLogin = await login('+919000000001');
    const s = await api('/sessions', { token: u.token, body: { kind: 'pandit', mode: 'chat', panditId: pandit.id } });
    await api(`/pandit/sessions/${s.id}/respond`, { token: pLogin.token, body: { accept: true } });
    const pSock = await sock(pLogin.token);
    await pSock.emitWithAck('session:join', s.id);
    const r = await pSock.emitWithAck('message:send', { sessionId: s.id, text: 'Call me on 98765 43210 or pay guru@okaxis. Born 15-08-1990 10:30?' });
    expect(r.message.text).toBe('Call me on ••• or pay •••. Born 15-08-1990 10:30?');
    await api(`/sessions/${s.id}/end`, { token: u.token, body: {} });
    pSock.close();
  });

  it('lets a user block a Pandit, who then disappears and cannot be consulted', async () => {
    const u = await login('9800011166', 'dev-c4');
    const before = await api('/pandits', { token: u.token });
    const target = before[0];
    await api(`/blocks/${target.id}`, { method: 'PUT', token: u.token, body: {} });
    const after = await api('/pandits', { token: u.token });
    expect(after.some((p: { id: string }) => p.id === target.id)).toBe(false);
    await expect(api('/sessions', { token: u.token, body: { kind: 'pandit', mode: 'chat', panditId: target.id } })).rejects.toMatchObject({ status: 403 });
    await api(`/blocks/${target.id}`, { method: 'DELETE', token: u.token });
  });

  it('rejects files whose bytes do not match the declared type', async () => {
    const u = await login('9800011177', 'dev-c5');
    const r = await fetch(`${base}/uploads?visibility=public`, { method: 'POST', headers: { 'content-type': 'image/png', authorization: `Bearer ${u.token}` }, body: Buffer.from('<html>not an image</html>') });
    expect(r.status).toBe(400);
  });

  it('log out of all devices invalidates existing tokens (REST and sockets)', async () => {
    const u = await login('9800011188', 'dev-c6');
    await api('/me/logout-all', { token: u.token, body: {} });
    await expect(api('/me', { token: u.token })).rejects.toMatchObject({ status: 401 });
    await expect(sock(u.token)).rejects.toBeTruthy();
  });

  it('acknowledges complaints with a reference number and records admin actions', async () => {
    const u = await login('9800011199', 'dev-c7');
    const c = await api('/complaints', { token: u.token, body: { category: 'other', text: 'Testing grievance flow' } });
    expect(c.reference).toHaveLength(8);
    const admin = await login('+919999999999');
    await api(`/admin/complaints/${c.id}`, { token: admin.token, body: { status: 'resolved', resolution: 'ok' } });
    await new Promise((r) => setTimeout(r, 50));
    const audit = await api('/admin/audit', { token: admin.token });
    expect(audit.some((a: { path: string }) => a.path.includes(c.id))).toBe(true);
  });

  it('stops charging and refunds an AI session when the care signal fires', async () => {
    const { stripCare, waiveSession } = await import('./services/safety.js');
    expect(stripCare('[[CARE]] Please call 14416.')).toEqual({ reply: 'Please call 14416.', care: true });
    const u = await login('9800011100', 'dev-c8');
    const { db, schema } = await import('./db/client.js');
    const { eq } = await import('drizzle-orm');
    await api('/wallet/topup/confirm', { token: u.token, body: { orderId: (await api('/wallet/topup', { token: u.token, body: { creditPaise: 10000 } })).orderId } });
    const s = await api('/sessions', { token: u.token, body: { kind: 'ai', mode: 'chat' } });
    await new Promise((r) => setTimeout(r, 1300));
    await db().update(schema.sessions).set({ lastActivityAt: new Date() }).where(eq(schema.sessions.id, s.id));
    await new Promise((r) => setTimeout(r, 600));
    const mid = (await db().select().from(schema.sessions).where(eq(schema.sessions.id, s.id)))[0];
    expect(mid.chargedPaise).toBeGreaterThan(0);
    await waiveSession(s.id);
    await new Promise((r) => setTimeout(r, 1200));
    const w = await api('/wallet', { token: u.token });
    expect(w.balancePaise).toBe(10000); // everything refunded, nothing more charged
    await api(`/sessions/${s.id}/end`, { token: u.token, body: {} });
  });
});
