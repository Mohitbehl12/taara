// Vedic astrology reference tables. Indices: signs 0=Aries(Mesha)…11=Pisces(Meena), nakshatras 0=Ashwini…26=Revati.

export const SIGNS = [
  { en: 'Aries', sa: 'Mesha', hi: 'मेष', lord: 'Mars' },
  { en: 'Taurus', sa: 'Vrishabha', hi: 'वृषभ', lord: 'Venus' },
  { en: 'Gemini', sa: 'Mithuna', hi: 'मिथुन', lord: 'Mercury' },
  { en: 'Cancer', sa: 'Karka', hi: 'कर्क', lord: 'Moon' },
  { en: 'Leo', sa: 'Simha', hi: 'सिंह', lord: 'Sun' },
  { en: 'Virgo', sa: 'Kanya', hi: 'कन्या', lord: 'Mercury' },
  { en: 'Libra', sa: 'Tula', hi: 'तुला', lord: 'Venus' },
  { en: 'Scorpio', sa: 'Vrishchika', hi: 'वृश्चिक', lord: 'Mars' },
  { en: 'Sagittarius', sa: 'Dhanu', hi: 'धनु', lord: 'Jupiter' },
  { en: 'Capricorn', sa: 'Makara', hi: 'मकर', lord: 'Saturn' },
  { en: 'Aquarius', sa: 'Kumbha', hi: 'कुंभ', lord: 'Saturn' },
  { en: 'Pisces', sa: 'Meena', hi: 'मीन', lord: 'Jupiter' },
] as const;

export const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya', 'Ashlesha',
  'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha', 'Purva Bhadrapada',
  'Uttara Bhadrapada', 'Revati',
] as const;

export type Planet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu';
export const PLANETS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
export const PLANET_HI: Record<Planet, string> = {
  Sun: 'सूर्य', Moon: 'चंद्र', Mars: 'मंगल', Mercury: 'बुध', Jupiter: 'गुरु', Venus: 'शुक्र', Saturn: 'शनि', Rahu: 'राहु', Ketu: 'केतु',
};

// Vimshottari dasha order starting from Ashwini's lord, with period in years.
export const DASHA_ORDER: { lord: Planet; years: number }[] = [
  { lord: 'Ketu', years: 7 }, { lord: 'Venus', years: 20 }, { lord: 'Sun', years: 6 },
  { lord: 'Moon', years: 10 }, { lord: 'Mars', years: 7 }, { lord: 'Rahu', years: 18 },
  { lord: 'Jupiter', years: 16 }, { lord: 'Saturn', years: 19 }, { lord: 'Mercury', years: 17 },
];

export const EXALTATION: Partial<Record<Planet, number>> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
export const OWN_SIGNS: Partial<Record<Planet, number[]>> = {
  Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10],
};
// Degrees from the Sun within which a planet is combust [direct, retrograde].
export const COMBUSTION_ORB: Partial<Record<Planet, [number, number]>> = {
  Moon: [12, 12], Mars: [17, 17], Mercury: [14, 12], Jupiter: [11, 11], Venus: [10, 8], Saturn: [15, 15],
};

// Natural (naisargika) friendships, used for Graha Maitri.
export const FRIENDS: Record<string, { friends: Planet[]; enemies: Planet[] }> = {
  Sun: { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
  Moon: { friends: ['Sun', 'Mercury'], enemies: [] },
  Mars: { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
  Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
  Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
  Venus: { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
  Saturn: { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
};

export const TITHIS = [
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dashami',
  'Ekadashi', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];
export const YOGAS = [
  'Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda', 'Sukarma', 'Dhriti', 'Shula', 'Ganda',
  'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva',
  'Siddha', 'Sadhya', 'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti',
];
export const VARAS = ['Ravivar', 'Somvar', 'Mangalvar', 'Budhvar', 'Guruvar', 'Shukravar', 'Shanivar'];

// Plain-language themes used to build "Explain Simply" text.
export const HOUSE_THEMES: string[] = [
  'your personality, body and how others first see you',
  'money, family and the way you speak',
  'courage, siblings, short trips and your own efforts',
  'home, mother, property and inner peace',
  'children, creativity, romance and learning',
  'work routines, health habits, competition and debts',
  'marriage, partnerships and close one-to-one relationships',
  'sudden changes, research, shared money and transformation',
  'luck, father, teachers, higher learning and faith',
  'career, reputation and public life',
  'income, gains, friends and fulfilled wishes',
  'expenses, foreign lands, sleep and spiritual release',
];
export const PLANET_THEMES: Record<Planet, string> = {
  Sun: 'confidence, authority and the need to be recognised',
  Moon: 'emotions, comfort and the mind',
  Mars: 'energy, drive and the urge to act',
  Mercury: 'thinking, communication and business sense',
  Jupiter: 'wisdom, growth and good fortune',
  Venus: 'love, beauty, comfort and harmony',
  Saturn: 'discipline, patience, hard work and delays that teach',
  Rahu: 'strong desires, ambition and unusual paths',
  Ketu: 'detachment, intuition and letting go',
};
