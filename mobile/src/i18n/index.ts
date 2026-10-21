import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources } from './resources';

// Fallback chain: selected language → Hindi → English, so a missing key is never blank.
i18n.use(initReactI18next).init({
  resources,
  lng: 'hi',
  fallbackLng: (code) => (code === 'en' ? ['en'] : code === 'hi' ? ['en'] : ['hi', 'en']),
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(code: string) {
  if (i18n.language !== code) i18n.changeLanguage(code);
}

export const RTL_LANGS = new Set(['ur', 'ks', 'sd']);
export default i18n;
