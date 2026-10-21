import { useColorScheme } from 'react-native';
import { useApp } from './store';

// Luxury yellow + kesari on neutrals. "sky" is the deep kohl surface used for premium hero cards.
// Only yellow and kesari carry brand colour; everything else is neutral (per brand brief). Tuned for WCAG AA.
const light = {
  bg: '#F8F7F4',          // neutral off-white
  surface: '#FFFFFF',
  surfaceAlt: '#EFEDE8',
  ink: '#1C1712',         // warm black
  inkSoft: '#5E574E',
  line: '#E2DED6',
  primary: '#C2500A',     // kesari (deep) — links, selected states, active tab
  onPrimary: '#FFFFFF',
  sky: '#1C1610',         // kohl hero
  skyInk: '#FFF4DC',
  marigold: '#F5B700',    // yellow gold — CTAs, chart lines on kohl
  marigoldInk: '#2A1E00',
  leaf: '#8A5A00',        // deep ochre — "free", online, positive
  onLeaf: '#FFFFFF',
  danger: '#9C3608',      // burnt kesari for errors
  warn: '#8A5A00',
  kesariSoft: '#F28C38',
};
const dark: typeof light = {
  bg: '#0F0C08',
  surface: '#1A150F',
  surfaceAlt: '#262017',
  ink: '#F7F0E3',
  inkSoft: '#B9AE9C',
  line: '#352D22',
  primary: '#FF9A45',
  onPrimary: '#1C1206',
  sky: '#211A11',
  skyInk: '#FFF4DC',
  marigold: '#FFC81F',
  marigoldInk: '#241A00',
  leaf: '#FFC81F',
  onLeaf: '#241A00',
  danger: '#FF9A6B',
  warn: '#FFC81F',
  kesariSoft: '#FF9A45',
};
export type Palette = typeof light;

export function useTheme() {
  const system = useColorScheme();
  const pref = useApp((s) => s.user?.theme ?? 'system');
  const mode = pref === 'system' ? (system ?? 'light') : pref;
  return { c: mode === 'dark' ? dark : light, dark: mode === 'dark' };
}

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
// Type scale (system fonts so every Indian script renders natively).
export const type = {
  hero: { fontSize: 30, lineHeight: 38, fontWeight: '700' as const },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  h2: { fontSize: 19, lineHeight: 26, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 20 },
  tiny: { fontSize: 12, lineHeight: 16 },
};
