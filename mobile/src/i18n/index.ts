import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

// Fallback chain: selected language → (Hindi, where widely read) → English, so a missing key is never blank.
const HINDI_FALLBACK = new Set(['mai', 'doi', 'ne', 'sa', 'kok', 'brx', 'mr', 'pa', 'ur', 'ks', 'sd', 'sat']);
i18n.use(initReactI18next).init({
  resources,
  lng: 'hi',
  // Missing strings fall back to Hindi only where Hindi is widely read (Devanagari / Hindi belt); otherwise to English.
  fallbackLng: (code) => (HINDI_FALLBACK.has(code) ? ['hi', 'en'] : ['en']),
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(code: string) {
  if (i18n.language !== code) i18n.changeLanguage(code);
}

export const RTL_LANGS = new Set(['ur', 'ks', 'sd']);
export default i18n;
