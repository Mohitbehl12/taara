import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api, dt, getToken, inr, openPrivate, setToken } from './api';

type Page = 'dashboard' | 'pandits' | 'users' | 'sessions' | 'payments' | 'payouts' | 'complaints' | 'pricing' | 'broadcast';
const PAGES: [Page, string][] = [
  ['dashboard', 'Dashboard'], ['pandits', 'Pandits & verification'], ['users', 'Users'], ['sessions', 'Consultations'],
  ['payments', 'Payments'], ['payouts', 'Payouts'], ['complaints', 'Complaints'], ['pricing', 'Pricing & promotions'], ['broadcast', 'Notifications'],
];

function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => { if (path) api<T>(path).then(setData).catch((e) => setErr(e.message)); }, [path]);
  useEffect(load, [load]);
  return { data, err, reload: load };
}

const Pill = ({ s }: { s: string }) => <span className={`pill ${s}`}>{s.replace(/_/g, ' ')}</span>;

// ---------------- login ----------------
function Login() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="login panel" onSubmit={async (e) => {
      e.preventDefault(); setErr(null);
      try {
        if (!sent) { await api('/auth/otp/send', { body: { phone } }); setSent(true); return; }
        const r = await api<{ token: string; user: { role: string } }>('/auth/otp/verify', { body: { phone, code } });
        if (r.user.role !== 'admin') { setErr('This number is not an admin.'); return; }
        setToken(r.token); location.reload();
      } catch (e: any) { setErr(e.message); }
    }}>
      <h2>Taara Admin</h2>
      <label>Mobile number<br /><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91…" required style={{ width: '100%' }} /></label>
      {sent ? <label>Code<br /><input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoFocus required style={{ width: '100%' }} /></label> : null}
      {err ? <div className="err">{err}</div> : null}
      <button className="btn">{sent ? 'Sign in' : 'Send code'}</button>
    </form>
  );
}

// ---------------- dashboard ----------------
function Dashboard() {
  const { data: d, err } = useLoad<any>('/admin/dashboard');
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  const daily: any[] = d.daily ?? [];
  const max = Math.max(1, ...daily.map((r) => Number(r.signups)));
  const funnelOrder = ['signup_completed', 'birth_details_completed', 'horoscope_viewed', 'kundli_viewed', 'palm_reading_created', 'ai_session_started', 'pandit_session_requested', 'topup_completed'];
  const funnel = Object.fromEntries((d.funnel ?? []).map((f: any) => [f.name, Number(f.users)]));
  return (
    <>
      <h2>Dashboard</h2>
      <div className="stats">
        {[
          ['Users', d.users.total], ['New users (7 days)', d.users.last7], ['Live consultations', d.liveSessions],
          ['Pandits approved', d.pandits.approved], ['Pandits online', d.pandits.online], ['Pending verification', d.pandits.pending],
          ['Revenue today', inr(d.revenuePaise.today)], ['Revenue 30 days', inr(d.revenuePaise.last30)],
          ['Top-ups 30 days', inr(d.topupsPaise.last30)], ['AI paid minutes (30 days)', d.aiMinutes30],
          ['Palm readings (7 days)', d.palmReadings.last7], ['Detailed palm (30 days)', d.palmReadings.detailedLast30], ['Open complaints', d.openComplaints],
        ].map(([k, v]) => <div className="stat" key={k as string}><div className="k">{k}</div><div className="v">{v}</div></div>)}
      </div>
      <h3>Sign-ups, last 30 days</h3>
      <div className="panel">
        <svg width="100%" height="140" viewBox="0 0 600 120" preserveAspectRatio="xMinYMid meet" role="img" aria-label="Daily sign-ups">
          {daily.map((r, i) => {
            const h = (Number(r.signups) / max) * 110;
            return <rect key={r.day} x={(30 - daily.length + i) * 20 + 3} y={115 - h} width={14} height={h} rx={2} fill="var(--marigold)"><title>{`${r.day}: ${r.signups} sign-ups, ${r.ai_sessions} AI, ${r.pandit_sessions} Pandit, ${r.topups} top-ups`}</title></rect>;
          })}
        </svg>
        {daily.length === 0 ? <p className="muted">No activity yet.</p> : null}
      </div>
      <h3>Funnel (unique users, 30 days)</h3>
      <table><tbody>
        {funnelOrder.map((k) => <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="num">{funnel[k] ?? 0}</td></tr>)}
      </tbody></table>
      <h3>Users by app language</h3>
      <table><tbody>
        {(d.languages ?? []).map((l: any) => <tr key={l.language}><td>{l.language}</td><td className="num">{l.users}</td></tr>)}
      </tbody></table>
    </>
  );
}

// ---------------- pandits ----------------
function Pandits() {
  const [status, setStatus] = useState('pending');
  const list = useLoad<any[]>(`/admin/pandits${status ? `?status=${status}` : ''}`);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <h2>Pandits & verification</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        {['pending', 'approved', 'rejected', 'suspended', ''].map((s) => (
          <button key={s} className={`btn ${status === s ? '' : 'secondary'}`} onClick={() => setStatus(s)}>{s || 'all'}</button>
        ))}
      </div>
      {open ? <PanditDetail id={open} onDone={() => { setOpen(null); list.reload(); }} /> : (
        <table>
          <thead><tr><th>Name</th><th>Phone</th><th>Languages</th><th>Chat rate</th><th>Sessions</th><th>Status</th><th>Applied</th></tr></thead>
          <tbody>{list.data?.map((p) => (
            <tr key={p.id} className="click" onClick={() => setOpen(p.id)}>
              <td>{p.displayName}</td><td>{p.phone}</td><td>{p.languages.join(', ')}</td><td className="num">{inr(p.chatRatePaise)}/min</td>
              <td className="num">{p.totalSessions}</td><td><Pill s={p.status} /></td><td>{dt(p.createdAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

function PanditDetail({ id, onDone }: { id: string; onDone: () => void }) {
  const { data } = useLoad<any>(`/admin/pandits/${id}`);
  const [note, setNote] = useState('');
  if (!data) return <p className="muted">Loading…</p>;
  const { pandit: p, verifications: v, reviews } = data;
  const decide = async (decision: string) => {
    if (decision !== 'approved' && !note.trim()) { alert('Add a note explaining what needs to change.'); return; }
    await api(`/admin/pandits/${id}/review`, { body: { decision, note: note || undefined } }); onDone();
  };
  return (
    <div className="grid2">
      <div className="panel">
        <button className="btn secondary" onClick={onDone}>← Back</button>
        <h3>{p.displayName} <Pill s={p.status} /></h3>
        <p>{p.bio}</p>
        <p className="muted">{p.experienceYears} yrs · {p.specializations.join(', ')} · speaks {p.languages.join(', ')} · writes in {p.replyLanguage}</p>
        <p>Chat {inr(p.chatRatePaise)} · Voice {inr(p.voiceRatePaise)} · Video {inr(p.videoRatePaise)} per minute · Free-minutes participant: {p.participatesInFree ? 'yes' : 'no'}</p>
        <p>Earnings balance {inr(p.earningsPaise, 2)} · {p.totalSessions} sessions · {Math.round(p.totalSeconds / 60)} minutes</p>
        <h3>Decision</h3>
        <textarea rows={3} style={{ width: '100%' }} placeholder="Note to the Pandit (required to reject or suspend)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ok" onClick={() => decide('approved')}>Approve</button>
          <button className="btn secondary" onClick={() => decide('rejected')}>Request changes</button>
          <button className="btn danger" onClick={() => decide('suspended')}>Suspend</button>
        </div>
      </div>
      <div className="panel">
        <h3>Verification documents</h3>
        {v.map((x: any) => (
          <div key={x.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8, marginBottom: 8 }}>
            <div><b>{x.fullName}</b> <Pill s={x.status} /></div>
            <div className="muted">{x.email ?? '—'} · {x.address}</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn secondary" onClick={() => openPrivate(x.idDocUrl)}>View {x.idDocType.replace(/_/g, ' ')}</button>
              {x.certificateUrls.map((u: string, i: number) => <button key={u} className="btn secondary" onClick={() => openPrivate(u)}>Certificate {i + 1}</button>)}
            </div>
            {x.reviewNote ? <div className="muted">Note: {x.reviewNote}</div> : null}
            <div className="muted">Submitted {dt(x.createdAt)}{x.reviewedAt ? ` · reviewed ${dt(x.reviewedAt)}` : ''}</div>
          </div>
        ))}
        <h3>Reviews</h3>
        {reviews.length === 0 ? <p className="muted">None yet.</p> : reviews.map((r: any) => (
          <div key={r.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', padding: '6px 0' }}>
            <span>{'★'.repeat(r.rating)} {r.text ?? ''} {r.hidden ? <Pill s="hidden" /> : null}</span>
            <button className="btn secondary" onClick={async () => { await api(`/admin/reviews/${r.id}/hide`, { body: { hidden: !r.hidden } }); location.reload(); }}>{r.hidden ? 'Show' : 'Hide'}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- users ----------------
function Users() {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const list = useLoad<any[]>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  const [open, setOpen] = useState<string | null>(null);
  if (open) return <UserDetail id={open} onBack={() => { setOpen(null); list.reload(); }} />;
  return (
    <>
      <h2>Users</h2>
      <form className="row" style={{ marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); setQuery(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email" style={{ width: 320 }} />
        <button className="btn">Search</button>
      </form>
      <table>
        <thead><tr><th>Name</th><th>Phone</th><th>Language</th><th>Balance</th><th>Free min</th><th>Joined</th><th></th></tr></thead>
        <tbody>{list.data?.map((u) => (
          <tr key={u.id} className="click" onClick={() => setOpen(u.id)}>
            <td>{u.name ?? '—'}{u.role === 'admin' ? <> <Pill s="admin" /></> : null}</td><td>{u.phone ?? u.email}</td><td>{u.language}</td>
            <td className="num">{inr(u.balancePaise, 2)}</td><td className="num">{Math.floor(u.freeSecondsRemaining / 60)}</td><td>{dt(u.createdAt)}</td>
            <td>{u.blocked ? <Pill s="rejected" /> : null}</td>
          </tr>
        ))}</tbody>
      </table>
    </>
  );
}

function UserDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const d = useLoad<any>(`/admin/users/${id}`);
  const [amt, setAmt] = useState('');
  const [reason, setReason] = useState('');
  if (!d.data) return <p className="muted">Loading…</p>;
  const { user: u, sessions, ledger, payments } = d.data;
  const adjust = async () => {
    const paise = Math.round(Number(amt) * 100);
    if (!paise || !reason.trim()) return;
    if (!confirm(`${paise > 0 ? 'Credit' : 'Debit'} ${inr(Math.abs(paise), 2)} — "${reason}"?`)) return;
    try { await api(`/admin/users/${id}/wallet-adjust`, { body: { amountPaise: paise, reason } }); setAmt(''); setReason(''); d.reload(); }
    catch (e: any) { alert(e.message); }
  };
  return (
    <>
      <button className="btn secondary" onClick={onBack}>← Back</button>
      <h2 style={{ marginTop: 12 }}>{u.name ?? 'User'} <span className="muted" style={{ fontSize: 15 }}>{u.phone}</span></h2>
      <div className="grid2">
        <div className="panel">
          <p>Balance <b>{inr(u.balancePaise, 2)}</b> · free minutes {Math.floor(u.freeSecondsRemaining / 60)} · language {u.language} · device {u.deviceId ?? '—'}</p>
          <div className="row">
            <button className={`btn ${u.blocked ? 'ok' : 'danger'}`} onClick={async () => { await api(`/admin/users/${id}/block`, { body: { blocked: !u.blocked } }); d.reload(); }}>{u.blocked ? 'Unblock' : 'Block user'}</button>
          </div>
        </div>
        <div className="panel">
          <b>Refund / adjust wallet</b>
          <div className="row" style={{ marginTop: 8 }}>
            <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="₹ (negative to debit)" style={{ width: 160 }} />
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown in ledger)" style={{ flex: 1 }} />
            <button className="btn" onClick={adjust}>Apply</button>
          </div>
        </div>
      </div>
      <h3>Consultations</h3>
      <SessionTable rows={sessions} />
      <h3>Wallet ledger</h3>
      <table><thead><tr><th>When</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Note</th></tr></thead>
        <tbody>{ledger.map((l: any) => <tr key={l.id}><td>{dt(l.createdAt)}</td><td>{l.type}</td><td className="num">{inr(l.amountPaise, 2)}</td><td className="num">{inr(l.balanceAfter, 2)}</td><td className="muted">{l.note}</td></tr>)}</tbody></table>
      <h3>Payments</h3>
      <PaymentTable rows={payments} />
    </>
  );
}

// ---------------- sessions ----------------
function SessionTable({ rows, onOpen }: { rows: any[]; onOpen?: (id: string) => void }) {
  return (
    <table>
      <thead><tr><th>Requested</th><th>Kind</th><th>Status</th><th>Free</th><th>Paid</th><th>Rate</th><th>Charged</th><th>Pandit earned</th><th>End reason</th></tr></thead>
      <tbody>{rows.map((s) => (
        <tr key={s.id} className={onOpen ? 'click' : ''} onClick={() => onOpen?.(s.id)}>
          <td>{dt(s.requestedAt)}</td><td>{s.kind} {s.mode}</td><td><Pill s={s.status} /></td>
          <td className="num">{Math.round(s.freeSecondsUsed / 60)}m</td><td className="num">{Math.round(s.paidSeconds / 60)}m</td>
          <td className="num">{inr(s.ratePaise)}</td><td className="num">{inr(s.chargedPaise, 2)}</td><td className="num">{inr(s.panditEarnedPaise, 2)}</td>
          <td className="muted">{s.endReason ?? ''}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

function Sessions() {
  const [status, setStatus] = useState('');
  const list = useLoad<any[]>(`/admin/sessions${status ? `?status=${status}` : ''}`);
  const [open, setOpen] = useState<string | null>(null);
  const msgs = useLoad<any[]>(open ? `/admin/sessions/${open}/messages` : null);
  return (
    <>
      <h2>Consultations</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        {['', 'active', 'requested', 'awaiting_consent', 'ended', 'missed'].map((s) => <button key={s} className={`btn ${status === s ? '' : 'secondary'}`} onClick={() => setStatus(s)}>{s || 'all'}</button>)}
      </div>
      {open ? (
        <div className="panel">
          <button className="btn secondary" onClick={() => setOpen(null)}>← Back</button>
          <p className="muted">Transcript is shown for dispute resolution only.</p>
          {msgs.data?.map((m) => (
            <div key={m.id} className={`bubble ${m.sender === 'user' ? 'user' : ''}`}>
              <div style={{ fontSize: 12, opacity: .7 }}>{m.sender} · {m.lang ?? ''} · {dt(m.createdAt)}</div>
              {m.text}
              {Object.entries(m.translations ?? {}).map(([l, t]) => <div key={l} style={{ fontSize: 13, opacity: .8 }}>[{l}] {t as string}</div>)}
            </div>
          ))}
        </div>
      ) : list.data ? <SessionTable rows={list.data} onOpen={setOpen} /> : null}
    </>
  );
}

// ---------------- payments / payouts / complaints ----------------
function PaymentTable({ rows }: { rows: any[] }) {
  return (
    <table><thead><tr><th>Created</th><th>Order</th><th>Credit</th><th>GST</th><th>Total</th><th>Status</th><th>Paid</th></tr></thead>
      <tbody>{rows.map((p) => <tr key={p.id}><td>{dt(p.createdAt)}</td><td className="muted">{p.providerOrderId}</td><td className="num">{inr(p.creditPaise)}</td><td className="num">{inr(p.gstPaise)}</td><td className="num">{inr(p.totalPaise)}</td><td><Pill s={p.status} /></td><td>{dt(p.paidAt)}</td></tr>)}</tbody></table>
  );
}
function Payments() {
  const [status, setStatus] = useState('');
  const list = useLoad<any[]>(`/admin/payments${status ? `?status=${status}` : ''}`);
  return (
    <>
      <h2>Payments</h2>
      <div className="row" style={{ marginBottom: 12 }}>{['', 'paid', 'created', 'failed'].map((s) => <button key={s} className={`btn ${status === s ? '' : 'secondary'}`} onClick={() => setStatus(s)}>{s || 'all'}</button>)}</div>
      {list.data ? <PaymentTable rows={list.data} /> : null}
      <p className="muted">Card/UPI refunds to the original method are done in the Razorpay dashboard; wallet refunds are done from the user's page.</p>
    </>
  );
}

function Payouts() {
  const list = useLoad<any[]>('/admin/payouts');
  const mark = async (id: string, status: string) => {
    const providerRef = status === 'paid' ? prompt('Bank / payout reference (UTR)') ?? undefined : undefined;
    await api(`/admin/payouts/${id}`, { body: { status, providerRef } }); list.reload();
  };
  return (
    <>
      <h2>Pandit payouts</h2>
      <table><thead><tr><th>Requested</th><th>Pandit</th><th>Amount</th><th>Status</th><th>Reference</th><th></th></tr></thead>
        <tbody>{list.data?.map(({ po, name }) => (
          <tr key={po.id}><td>{dt(po.createdAt)}</td><td>{name}</td><td className="num">{inr(po.amountPaise, 2)}</td><td><Pill s={po.status} /></td><td className="muted">{po.providerRef ?? ''}</td>
            <td className="row">{po.status === 'requested' || po.status === 'processing' ? <><button className="btn ok" onClick={() => mark(po.id, 'paid')}>Mark paid</button><button className="btn secondary" onClick={() => mark(po.id, 'processing')}>Processing</button></> : null}</td></tr>
        ))}</tbody></table>
    </>
  );
}

function Complaints() {
  const list = useLoad<any[]>('/admin/complaints');
  const resolve = async (id: string, status: string) => {
    const resolution = prompt('Resolution note') ?? undefined;
    await api(`/admin/complaints/${id}`, { body: { status, resolution } }); list.reload();
  };
  return (
    <>
      <h2>Complaints</h2>
      <table><thead><tr><th>When</th><th>Category</th><th>Text</th><th>Status</th><th></th></tr></thead>
        <tbody>{list.data?.map((c) => (
          <tr key={c.id}><td>{dt(c.createdAt)}</td><td>{c.category}</td><td>{c.text}{c.resolution ? <div className="muted">→ {c.resolution}</div> : null}</td><td><Pill s={c.status} /></td>
            <td className="row">{c.status === 'open' ? <><button className="btn ok" onClick={() => resolve(c.id, 'resolved')}>Resolve</button><button className="btn secondary" onClick={() => resolve(c.id, 'rejected')}>Reject</button></> : null}</td></tr>
        ))}</tbody></table>
    </>
  );
}

// ---------------- pricing ----------------
const SETTING_LABELS: Record<string, [string, 'paise' | 'number' | 'mode' | 'list_paise' | 'list' | 'json']> = {
  'ai.billing_mode': ['AI text chat billing', 'mode'],
  'ai.rate_per_min_paise': ['AI rate per minute (chat & voice)', 'paise'],
  'ai.rate_per_message_paise': ['AI rate per message (per-message mode)', 'paise'],
  'ai.idle_pause_seconds': ['Pause AI session after idle (seconds)', 'number'],
  'free.pandit_minutes': ['Free Pandit chat minutes for new users', 'number'],
  'free.warn_at_minutes': ['Warn user when free minutes left', 'list'],
  'free.consent_timeout_seconds': ['Time to accept paid rate after free ends (s)', 'number'],
  'free.pandit_payout_paise_per_min': ['Paid to Pandit per free minute', 'paise'],
  'pandit.min_rate_paise': ['Minimum Pandit rate per minute', 'paise'],
  'pandit.max_rate_paise': ['Maximum Pandit rate per minute', 'paise'],
  'pandit.commission_pct': ['Platform commission %', 'number'],
  'pandit.request_timeout_seconds': ['Pandit must accept within (s)', 'number'],
  'pandit.min_payout_paise': ['Minimum Pandit payout', 'paise'],
  'wallet.topups_paise': ['Top-up amounts', 'list_paise'],
  'wallet.low_balance_minutes': ['Low-balance warning (minutes left)', 'number'],
  'gst.pct': ['GST %', 'number'],
  'palm.free_readings_per_day': ['Free palm readings per user per day', 'number'],
  'palm.detailed_price_paise': ['Detailed palm reading price', 'paise'],
  'reports.price_paise': ['Report prices (JSON, paise)', 'json'],
};

function Pricing() {
  const s = useLoad<{ values: Record<string, any> }>('/admin/settings');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  if (!s.data) return <p className="muted">Loading…</p>;
  const v = s.data.values;
  const show = (k: string) => {
    const [, kind] = SETTING_LABELS[k];
    const x = v[k];
    if (kind === 'paise') return String(x / 100);
    if (kind === 'list_paise') return x.map((n: number) => n / 100).join(', ');
    if (kind === 'list') return x.join(', ');
    if (kind === 'json') return JSON.stringify(x);
    return String(x);
  };
  const parse = (k: string, raw: string) => {
    const [, kind] = SETTING_LABELS[k];
    if (kind === 'paise') return Math.round(Number(raw) * 100);
    if (kind === 'list_paise') return raw.split(',').map((n) => Math.round(Number(n.trim()) * 100));
    if (kind === 'list') return raw.split(',').map((n) => Number(n.trim()));
    if (kind === 'json') return JSON.parse(raw);
    if (kind === 'mode') return raw;
    return Number(raw);
  };
  const save = async () => {
    try {
      const body = Object.fromEntries(Object.entries(draft).map(([k, raw]) => [k, parse(k, raw)]));
      await api('/admin/settings', { method: 'PUT', body });
      setDraft({}); setMsg('Saved. The app picks up new prices within 15 seconds; running sessions keep the rate they started with.'); s.reload();
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <h2>Pricing & promotions</h2>
      <div className="panel settings">
        {Object.keys(SETTING_LABELS).map((k) => (
          <label key={k}>
            <span>{SETTING_LABELS[k][0]}{SETTING_LABELS[k][1].includes('paise') && SETTING_LABELS[k][1] !== 'json' ? ' (₹)' : ''}</span>
            {SETTING_LABELS[k][1] === 'mode'
              ? <select value={draft[k] ?? show(k)} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}><option value="per_minute">Per minute</option><option value="per_message">Per message</option></select>
              : <input value={draft[k] ?? show(k)} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />}
          </label>
        ))}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" disabled={!Object.keys(draft).length} onClick={save}>Save changes</button>
          {msg ? <span className="muted">{msg}</span> : null}
        </div>
      </div>
    </>
  );
}

// ---------------- broadcast ----------------
function Broadcast() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [lang, setLang] = useState('');
  const [res, setRes] = useState<string | null>(null);
  return (
    <>
      <h2>Send a notification</h2>
      <div className="panel" style={{ display: 'grid', gap: 10, maxWidth: 560 }}>
        <p className="muted">Write in English. Each user receives it translated into their own app language.</p>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title, e.g. Happy Diwali 🪔" maxLength={80} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" rows={3} maxLength={240} />
        <label>Only users whose language is <input value={lang} onChange={(e) => setLang(e.target.value)} placeholder="all (or e.g. hi, ta)" style={{ width: 160 }} /></label>
        <button className="btn" disabled={title.length < 2 || body.length < 2} onClick={async () => {
          if (!confirm('Send to all matching users?')) return;
          try { const r = await api<{ recipients: number; pushed: number }>('/admin/broadcast', { body: { title, body, language: lang || undefined } }); setRes(`Sent to ${r.pushed} devices (${r.recipients} users).`); }
          catch (e: any) { setRes(e.message); }
        }}>Send</button>
        {res ? <p>{res}</p> : null}
      </div>
    </>
  );
}

// ---------------- shell ----------------
function App() {
  const [page, setPage] = useState<Page>((location.hash.slice(1) as Page) || 'dashboard');
  useEffect(() => { location.hash = page; }, [page]);
  if (!getToken()) return <Login />;
  const View = { dashboard: Dashboard, pandits: Pandits, users: Users, sessions: Sessions, payments: Payments, payouts: Payouts, complaints: Complaints, pricing: Pricing, broadcast: Broadcast }[page];
  return (
    <div className="shell">
      <nav aria-label="Admin sections">
        <h1>Taara Admin</h1>
        {PAGES.map(([k, label]) => <button key={k} aria-current={page === k ? 'page' : undefined} onClick={() => setPage(k)}>{label}</button>)}
        <div className="spacer" />
        <button onClick={() => { setToken(null); location.reload(); }}>Sign out</button>
      </nav>
      <main><View /></main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
