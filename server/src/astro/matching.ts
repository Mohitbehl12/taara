// Ashtakoota Guna Milan (36 points). Uses each person's Moon sign and Moon nakshatra.
// Traditions differ on a few tables (Vashya, Yoni); the ones here are documented, common variants.
import { FRIENDS, SIGNS, type Planet } from './constants.js';

export interface MoonInfo { moonSign: number; nakshatra: number }

const VARNA_RANK = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4]; // Brahmin 4 (Cancer/Scorpio/Pisces), Kshatriya 3, Vaishya 2, Shudra 1

// Vashya group: 0 Chatushpada, 1 Manava, 2 Jalachara, 3 Vanachara, 4 Keeta. Sagittarius and Capricorn split at 15°; we use the dominant half.
const VASHYA_GROUP = [0, 0, 1, 2, 3, 1, 1, 4, 1, 0, 1, 2];
const VASHYA_TABLE = [
  [2, 1, 1, 0, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];

// Yoni animals by nakshatra.
const YONI = [
  'horse', 'elephant', 'sheep', 'serpent', 'serpent', 'dog', 'cat', 'sheep', 'cat', 'rat', 'rat', 'cow', 'buffalo',
  'tiger', 'buffalo', 'tiger', 'deer', 'deer', 'dog', 'monkey', 'mongoose', 'monkey', 'lion', 'horse', 'lion', 'cow', 'elephant',
];
const YONI_ENEMIES = [
  ['horse', 'buffalo'], ['elephant', 'lion'], ['sheep', 'monkey'], ['serpent', 'mongoose'],
  ['dog', 'deer'], ['cat', 'rat'], ['cow', 'tiger'],
];

const GANA = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0]; // 0 Deva, 1 Manushya, 2 Rakshasa
const GANA_TABLE = [ // [groom][bride]
  [6, 6, 1],
  [5, 6, 0],
  [1, 0, 6],
];
const NADI = [0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2, 2, 1, 0, 0, 1, 2]; // Adi, Madhya, Antya

function relation(a: Planet, b: Planet): 'friend' | 'neutral' | 'enemy' {
  if (a === b) return 'friend';
  const f = FRIENDS[a];
  if (f.friends.includes(b)) return 'friend';
  if (f.enemies.includes(b)) return 'enemy';
  return 'neutral';
}

export interface Koota { key: string; name: string; max: number; score: number; simple: string }

export function gunaMilan(groom: MoonInfo, bride: MoonInfo) {
  const kootas: Koota[] = [];

  // 1. Varna
  kootas.push({
    key: 'varna', name: 'Varna', max: 1,
    score: VARNA_RANK[groom.moonSign] >= VARNA_RANK[bride.moonSign] ? 1 : 0,
    simple: 'How well your basic temperaments and values line up.',
  });

  // 2. Vashya
  kootas.push({
    key: 'vashya', name: 'Vashya', max: 2,
    score: VASHYA_TABLE[VASHYA_GROUP[groom.moonSign]][VASHYA_GROUP[bride.moonSign]],
    simple: 'Natural attraction and how easily you influence each other.',
  });

  // 3. Tara
  const tara = (from: number, to: number) => ([3, 5, 7].includes((((to - from + 27) % 27) + 1) % 9) ? 0 : 1.5);
  kootas.push({
    key: 'tara', name: 'Tara', max: 3,
    score: tara(bride.nakshatra, groom.nakshatra) + tara(groom.nakshatra, bride.nakshatra),
    simple: 'Wellbeing and good fortune you bring to each other.',
  });

  // 4. Yoni
  const ya = YONI[groom.nakshatra], yb = YONI[bride.nakshatra];
  const enemy = YONI_ENEMIES.some(([x, y]) => (x === ya && y === yb) || (x === yb && y === ya));
  kootas.push({
    key: 'yoni', name: 'Yoni', max: 4, score: ya === yb ? 4 : enemy ? 0 : 2,
    simple: 'Physical and intimate compatibility.',
  });

  // 5. Graha Maitri
  const la = SIGNS[groom.moonSign].lord as Planet, lb = SIGNS[bride.moonSign].lord as Planet;
  const r1 = relation(la, lb), r2 = relation(lb, la);
  const pair = [r1, r2].sort().join('-');
  const gmScore: Record<string, number> = {
    'friend-friend': 5, 'friend-neutral': 4, 'neutral-neutral': 3, 'enemy-friend': 1, 'enemy-neutral': 0.5, 'enemy-enemy': 0,
  };
  kootas.push({
    key: 'graha_maitri', name: 'Graha Maitri', max: 5, score: la === lb ? 5 : gmScore[pair],
    simple: 'Mental friendship — how naturally you understand each other.',
  });

  // 6. Gana
  kootas.push({
    key: 'gana', name: 'Gana', max: 6, score: GANA_TABLE[GANA[groom.nakshatra]][GANA[bride.nakshatra]],
    simple: 'Nature and behaviour — calm, balanced or intense.',
  });

  // 7. Bhakoot
  const dist = ((groom.moonSign - bride.moonSign + 12) % 12) + 1;
  const back = ((bride.moonSign - groom.moonSign + 12) % 12) + 1;
  const badPair = [[2, 12], [5, 9], [6, 8]].some(([x, y]) => (dist === x && back === y) || (dist === y && back === x));
  kootas.push({
    key: 'bhakoot', name: 'Bhakoot', max: 7, score: badPair ? 0 : 7,
    simple: 'Emotional bond, family happiness and shared prosperity.',
  });

  // 8. Nadi
  kootas.push({
    key: 'nadi', name: 'Nadi', max: 8, score: NADI[groom.nakshatra] === NADI[bride.nakshatra] ? 0 : 8,
    simple: 'Health and harmony of the family line, traditionally the most weighted factor.',
  });

  const total = kootas.reduce((s, k) => s + k.score, 0);
  const verdict = total >= 28 ? 'excellent' : total >= 24 ? 'very_good' : total >= 18 ? 'good' : 'low';
  return {
    total, max: 36, percent: Math.round((total / 36) * 100), verdict, kootas,
    nadiDosha: NADI[groom.nakshatra] === NADI[bride.nakshatra],
    bhakootDosha: badPair,
    note: 'Guna Milan is one traditional input. Communication, values and mutual respect matter as much as any score.',
  };
}
