import type { TFunction } from 'i18next';
import type { Placement } from './types';

/** Plain-language and technical lines for a planet placement, built from locale strings so they work offline in every language. */
export function explainPlacement(t: TFunction, p: Placement) {
  const parts = [t('explain.means', { planet: t(`explain.planet.${p.planet}`), house: t(`explain.house.${p.house}`) })];
  if (p.dignity === 'exalted' || p.dignity === 'debilitated' || p.dignity === 'own') parts.push(t(`explain.${p.dignity}`));
  if (p.retrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu') parts.push(t('explain.retro'));
  if (p.combust) parts.push(t('explain.combust'));
  const detailed = t('explain.detail', {
    planet: t(`planets.${p.planet}`), deg: p.degreeInSign.toFixed(2), sign: t(`signs.${p.sign}`), house: p.house,
    nakshatra: t(`nakshatras.${p.nakshatra}`), pada: p.pada, navamsa: t(`signs.${p.navamsaSign}`),
  });
  return { simple: parts.join(' '), detailed };
}

/** Grapheme-aware short label for chart cells: "Su" in Latin scripts, the first akshara (e.g. "सू", "श") in Indic ones. */
export function planetAbbr(label: string) {
  const chars = Array.from(label);
  if (/^[A-Za-z]/.test(chars[0] ?? '')) return chars.slice(0, 2).join('');
  let out = chars[0] ?? '';
  for (const ch of chars.slice(1)) { if (/\p{M}/u.test(ch)) out += ch; else break; }
  return out;
}
