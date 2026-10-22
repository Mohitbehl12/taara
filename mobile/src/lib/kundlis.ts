// Saved Kundlis. Signed-in users keep them on their account; guests keep them on this device, so every free
// tool works without logging in (like AstroSage). When a guest logs in, their device Kundlis move to the account.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { api } from './api';
import type { BirthProfile } from './types';

export type Kundli = BirthProfile & { gender?: string | null };
export type BirthInput = Omit<Kundli, 'id' | 'isPrimary' | 'tzOffsetMinutes'> & { tzOffsetMinutes?: number };

const KEY = 'taara.kundlis';
export const isLocal = (k: { id: string }) => k.id.startsWith('local-');

export async function readLocal(): Promise<Kundli[]> {
  try {
    if (Platform.OS === 'web') return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '[]');
    const f = new File(Paths.document, 'kundlis.json');
    return f.exists ? JSON.parse(await f.text()) : [];
  } catch { return []; }
}

export async function writeLocal(list: Kundli[]) {
  const json = JSON.stringify(list);
  if (Platform.OS === 'web') { globalThis.localStorage?.setItem(KEY, json); return; }
  const f = new File(Paths.document, 'kundlis.json');
  if (!f.exists) f.create();
  f.write(json);
}

export const newLocalId = () => `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Birth details as the free (no-login) endpoints expect them. */
export const birthBody = (k: BirthInput | Kundli) => ({
  name: k.name, date: k.date, time: k.time, timeAccuracy: k.timeAccuracy, placeName: k.placeName, lat: k.lat, lon: k.lon,
  ...(k.tzOffsetMinutes !== undefined ? { tzOffsetMinutes: k.tzOffsetMinutes } : {}),
});

type Kind = 'kundli' | 'home' | 'sade-sati' | 'gochar';
/** Fetches chart data for a saved Kundli, from the account or (for device Kundlis) from the free endpoints. */
export function fetchFor<T>(k: Kundli, kind: Kind, lang: string): Promise<T> {
  if (isLocal(k)) {
    const body = kind === 'home' ? { ...birthBody(k), lang } : birthBody(k);
    return api<T>(`/free/${kind}`, { body });
  }
  if (kind === 'kundli') return api<T>(`/profiles/${k.id}/kundli?lang=${lang}`);
  if (kind === 'home') return api<T>(`/home?lang=${lang}`);
  return api<T>(`/tools/${kind}?profileId=${k.id}`);
}

/** React hook around fetchFor with loading / error / reload, like useFetch. */
export function useKundliData<T>(k: Kundli | null | undefined, kind: Kind, lang: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!k);
  const alive = useRef(true);
  const key = k ? `${k.id}:${k.date}:${k.time}:${k.lat}:${k.lon}` : null;
  const load = useCallback(async () => {
    if (!k) { setData(null); return; }
    setLoading(true); setError(null);
    try { const d = await fetchFor<T>(k, kind, lang); if (alive.current) setData(d); }
    catch (e: any) { if (alive.current) setError(e.code ?? 'error'); }
    finally { if (alive.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, kind, lang]);
  useEffect(() => { alive.current = true; setData(null); load(); return () => { alive.current = false; }; }, [load]);
  return { data, error, loading, reload: load };
}
