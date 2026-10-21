// In dev, Vite proxies /api → localhost:4000. In production the panel is served by the API itself, so calls go to the same origin.
const BASE = import.meta.env.DEV ? '/api' : '';

export const getToken = () => localStorage.getItem('taara.admin.token');
export const setToken = (t: string | null) => (t ? localStorage.setItem('taara.admin.token', t) : localStorage.removeItem('taara.admin.token'));

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (r.status === 401) { setToken(null); location.reload(); }
  if (!r.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${r.status}`);
  return data as T;
}

export const inr = (paise: number | null | undefined, d = 0) =>
  `₹${((paise ?? 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: 2 })}`;
export const dt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
/** Private uploads are served to admins only; fetch them with the token and open as a blob. */
export async function openPrivate(url: string) {
  const path = new URL(url).pathname;
  const r = await fetch(BASE + path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!r.ok) { alert('Could not open file'); return; }
  window.open(URL.createObjectURL(await r.blob()), '_blank');
}
