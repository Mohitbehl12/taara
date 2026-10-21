import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Minimal data hook: loads a path, exposes reload, keeps last good data on refresh errors. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true); setError(null);
    try { const d = await api<T>(path); if (alive.current) setData(d); }
    catch (e: any) { if (alive.current) setError(e.code ?? 'error'); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);

  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  return { data, error, loading, reload: load, setData };
}
