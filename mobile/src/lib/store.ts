import { create } from 'zustand';
import { storage } from './storage';
import { api, setToken } from './api';
import type { Meta, User } from './types';
import { setLanguage } from '@/i18n';

const TOKEN_KEY = 'taara.token';
const LANG_KEY = 'taara.lang';
const MODE_KEY = 'taara.mode';

interface AppState {
  ready: boolean;
  token: string | null;
  user: User | null;
  meta: Meta | null;
  language: string;            // chosen before login too
  mode: 'user' | 'pandit';
  boot: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  demoSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateUser: (patch: Partial<User>) => Promise<void>;
  chooseLanguage: (code: string) => Promise<void>;
  setMode: (m: 'user' | 'pandit') => Promise<void>;
}

const store = storage.get;

export const useApp = create<AppState>((set, get) => ({
  ready: false, token: null, user: null, meta: null, language: 'hi', mode: 'user',

  boot: async () => {
    const [token, lang, mode] = await Promise.all([store(TOKEN_KEY), store(LANG_KEY), store(MODE_KEY)]);
    if (lang) { setLanguage(lang); set({ language: lang }); }
    if (mode === 'pandit') set({ mode: 'pandit' });
    const metaP = api<Meta>('/meta').then((meta) => { set({ meta }); return meta; }).catch(() => null);
    if (token) {
      setToken(token);
      set({ token });
      try { await get().refreshUser(); } catch { /* offline: keep token, screens will retry */ }
    } else {
      // Demo server: skip login entirely and open a fresh guest account.
      const meta = await metaP;
      if (meta?.demo) await get().demoSignIn().catch(() => {});
    }
    set({ ready: true });
  },

  signIn: async (token) => {
    setToken(token);
    await storage.set(TOKEN_KEY, token);
    set({ token });
    const u = await get().refreshUser();
    // Carry the language chosen on the welcome screen into the account.
    if (u && u.language !== get().language) await get().updateUser({ language: get().language });
  },

  demoSignIn: async () => {
    const r = await api<{ token: string }>('/auth/demo', { body: { language: get().language } });
    await get().signIn(r.token);
  },

  signOut: async () => {
    setToken(null);
    await storage.del(TOKEN_KEY);
    await storage.del(MODE_KEY);
    set({ token: null, user: null, mode: 'user' });
  },

  refreshUser: async () => {
    try {
      const u = await api<User>('/me');
      set({ user: u });
      if (u.language !== get().language) { setLanguage(u.language); set({ language: u.language }); }
      return u;
    } catch (e: any) {
      if (e?.status === 401 || e?.status === 403) await get().signOut();
      throw e;
    }
  },

  updateUser: async (patch) => {
    const u = await api<User>('/me', { method: 'PATCH', body: patch });
    set({ user: u });
    if (patch.language) { setLanguage(patch.language); set({ language: patch.language }); await storage.set(LANG_KEY, patch.language); }
  },

  chooseLanguage: async (code) => {
    setLanguage(code);
    set({ language: code });
    await storage.set(LANG_KEY, code);
    if (get().user) await get().updateUser({ language: code });
  },

  setMode: async (m) => { set({ mode: m }); await storage.set(MODE_KEY, m); },
}));
