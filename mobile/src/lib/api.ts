import Constants from 'expo-constants';

export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:4000';

let token: string | null = null;
export const setToken = (t: string | null) => { token = t; };
export const getToken = () => token;

/**
 * Called when the server no longer accepts our login (e.g. the demo server was reset by a new deploy).
 * The store signs out and, on the demo server, opens a fresh guest account. Returns true if the request
 * should be retried with the new login.
 */
let onUnauthorized: (() => Promise<boolean>) | null = null;
export const setUnauthorizedHandler = (fn: () => Promise<boolean>) => { onUnauthorized = fn; };
let recovering: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) { super(message ?? code); }
}

type Opts = { method?: string; body?: unknown; raw?: BodyInit; contentType?: string };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const sentToken = token;
  try {
    return await request<T>(path, opts);
  } catch (e) {
    const err = e as ApiError;
    if (err.status !== 401 || !sentToken || !onUnauthorized || path.startsWith('/auth/') || path === '/me') throw err;
    recovering ??= onUnauthorized().finally(() => { recovering = null; });
    if (!(await recovering)) throw err;
    return request<T>(path, opts);
  }
}

async function request<T>(path: string, opts: Opts): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.contentType) headers['Content-Type'] = opts.contentType;
  let r: Response;
  try {
    r = await fetch(API_URL + path, {
      method: opts.method ?? (opts.body !== undefined || opts.raw ? 'POST' : 'GET'),
      headers,
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const text = await r.text();
  let data: any = null;
  // A server that is restarting can answer with an HTML error page instead of JSON.
  try { data = text ? JSON.parse(text) : null; } catch { throw new ApiError(r.ok ? 502 : r.status, r.status >= 500 || r.ok ? 'server_starting' : 'server_error'); }
  if (!r.ok) throw new ApiError(r.status, data?.error ?? 'server_error', data?.message);
  return data as T;
}

export const rupees = (paise: number, decimals?: number) => {
  const v = paise / 100;
  const d = decimals ?? (Number.isInteger(v) ? 0 : 2);
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
export const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
