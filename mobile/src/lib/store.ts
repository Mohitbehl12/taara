import { create } from 'zustand';
import { storage } from './storage';
import { api, setToken } from './api';
import type { Meta, User } from './types';
import { setLanguage } from '@/i18n';
import { getLocales } from 'expo-localization';
import { LANGUAGES } from '@/i18n/languages';
import { birthBody, newLocalId, readLocal, writeLocal, type BirthInput, type Kundli } from './kundlis';

/** First launch: the phone's language if Taara speaks it, otherwise English. */
function deviceLanguage() {
  try {
    const codes = getLocales().map((l) => l.languageCode ?? '');
    return codes.find((c) => LANGUAGES.some((l) => l.code === c)) ?? 'en';
  } catch { return 'en'; }
}

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
  /** Kundlis saved on this device (guests). Signed-in users' Kundlis are user.profiles. */
  localKundlis: Kundli[];
  /** True once a language has been chosen (first launch shows the picker once). */
  languageChosen: boolean;
  boot: () => Promise<void>;
  addKundli: (k: BirthInput, primary?: boolean) => Promise<Kundli>;
  removeKundli: (id: string) => Promise<void>;
  syncLocalKundlis: () => Promise<void>;
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
  ready: false, token: null, user: null, meta: null, language: 'en', mode: 'user', localKundlis: [], languageChosen: false,

  boot: async () => {
    const [token, lang, mode, local] = await Promise.all([store(TOKEN_KEY), store(LANG_KEY), store(MODE_KEY), readLocal()]);
    const l = lang ?? deviceLanguage();
    setLanguage(l); set({ language: l, languageChosen: !!lang, localKundlis: local });
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
    const chosen = get().language;
    set({ token });
    const u = await get().refreshUser();
    // Carry the language chosen before login into the account (a new account starts with the server default).
    if (u && get().languageChosen && u.language !== chosen) await get().updateUser({ language: chosen });
    await get().syncLocalKundlis();
  },

  addKundli: async (k, primary) => {
    if (get().token) {
      const created = await api<Kundli>('/profiles', { body: { ...birthBody(k), relation: k.relation ?? 'self', isPrimary: primary } });
      await get().refreshUser();
      return created;
    }
    const list = get().localKundlis;
    const isPrimary = primary ?? list.length === 0;
    const created: Kundli = { ...k, id: newLocalId(), isPrimary, tzOffsetMinutes: k.tzOffsetMinutes ?? 330 } as Kundli;
    const next = [...(isPrimary ? list.map((x) => ({ ...x, isPrimary: false })) : list), created];
    set({ localKundlis: next }); await writeLocal(next);
    return created;
  },

  removeKundli: async (id) => {
    if (!id.startsWith('local-')) { await api(`/profiles/${id}`, { method: 'DELETE' }); await get().refreshUser(); return; }
    const next = get().localKundlis.filter((k) => k.id !== id);
    if (next.length && !next.some((k) => k.isPrimary)) next[0] = { ...next[0], isPrimary: true };
    set({ localKundlis: next }); await writeLocal(next);
  },

  /** After login (and consent), Kundlis made as a guest move onto the account. */
  syncLocalKundlis: async () => {
    const { localKundlis, user } = get();
    if (!localKundlis.length || !user?.consentCurrent) return;
    const hasPrimary = user.profiles.some((p) => p.isPrimary);
    const left: Kundli[] = [];
    for (const k of localKundlis) {
      try { await api('/profiles', { body: { ...birthBody(k), relation: k.relation ?? 'other', isPrimary: !hasPrimary && k.isPrimary } }); }
      catch { left.push(k); }
    }
    set({ localKundlis: left }); await writeLocal(left);
    await get().refreshUser().catch(() => null);
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
    set({ language: code, languageChosen: true });
    await storage.set(LANG_KEY, code);
    if (get().user) await get().updateUser({ language: code });
  },

  setMode: async (m) => { set({ mode: m }); await storage.set(MODE_KEY, m); },
}));

/** The Kundlis the person can see: their account's when signed in, otherwise the ones on this device. */
const NONE: Kundli[] = [];
export const useKundliList = () => useApp((s) => (s.token ? s.user?.profiles ?? NONE : s.localKundlis)) as Kundli[];
export const usePrimaryKundli = () => {
  const list = useKundliList();
  return list.find((k) => k.isPrimary) ?? list[0] ?? null;
};
