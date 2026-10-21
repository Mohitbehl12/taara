// "Explain Simply" layer: every technical item gets a plain-language line (simple) and a technical line (detailed).
import { HOUSE_THEMES, NAKSHATRAS, PLANET_THEMES, SIGNS, type Planet } from './constants.js';
import { currentDasha, kaalSarp, manglik, siderealLongitude, vimshottari, type Chart } from './engine.js';

const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

export function explainPlacement(p: Chart['planets'][number], timeKnown: boolean) {
  const sign = SIGNS[p.sign];
  const from = timeKnown ? 'house' : 'house from your Moon';
  const strength =
    p.dignity === 'exalted' ? ' It is very strong here, so these qualities come easily to you.'
      : p.dignity === 'debilitated' ? ' It is weaker here, so these qualities may need more conscious effort.'
        : p.dignity === 'own' ? ' It is comfortable in its own sign, so it works steadily for you.' : '';
  const retro = p.retrograde && p.planet !== 'Rahu' && p.planet !== 'Ketu'
    ? ' Being retrograde, its results tend to come through reflection and second attempts.' : '';
  const combust = p.combust ? ' Being close to the Sun, it can feel overshadowed by your ego or authority figures.' : '';
  return {
    simple: `What this means: ${PLANET_THEMES[p.planet]} shows up mainly in ${HOUSE_THEMES[p.house - 1]}.${strength}${retro}${combust}`,
    detailed: `${p.planet} at ${p.degreeInSign.toFixed(2)}° ${sign.sa} (${sign.en}) in the ${ord(p.house)} ${from}, `
      + `${NAKSHATRAS[p.nakshatra]} nakshatra pada ${p.pada}; dignity: ${p.dignity}`
      + `${p.retrograde ? ', retrograde' : ''}${p.combust ? ', combust' : ''}; navamsa in ${SIGNS[p.navamsaSign].sa}.`,
  };
}

export function chartSummary(chart: Chart) {
  const dashas = vimshottari(chart);
  const now = currentDasha(dashas);
  const mg = manglik(chart);
  const ks = kaalSarp(chart);
  const md = now.mahadasha?.lord as Planet | undefined;
  const ad = now.antardasha?.lord as Planet | undefined;
  return {
    basics: {
      lagna: chart.lagna ? { sign: chart.lagna.sign, ...SIGNS[chart.lagna.sign] } : null,
      rashi: { sign: chart.moonSign, ...SIGNS[chart.moonSign] },
      sunSign: { sign: chart.sunSign, ...SIGNS[chart.sunSign] },
      nakshatra: { index: chart.nakshatra, name: NAKSHATRAS[chart.nakshatra], pada: chart.pada },
    },
    placements: chart.planets.map((p) => ({ ...p, ...explainPlacement(p, chart.timeKnown) })),
    dasha: {
      periods: dashas,
      current: now,
      simple: md
        ? `You are in a ${md} period${ad ? ` (with a ${ad} sub-period)` : ''}. This phase highlights ${PLANET_THEMES[md]}${ad ? `, coloured by ${PLANET_THEMES[ad]}` : ''}.`
        : null,
    },
    doshas: {
      manglik: {
        ...mg,
        simple: mg.present
          ? 'Mars is placed where tradition says it can make relationships intense. It is very common (about 40% of charts) and is usually discussed during Kundli matching, not something to fear.'
          : mg.cancelled ? 'Mars sits in a position tradition considers sensitive, but its own strength cancels the dosha.'
            : 'No Manglik dosha.',
      },
      kaalSarp: {
        ...ks,
        simple: ks.present
          ? 'All planets fall on one side of Rahu–Ketu. Tradition links this with ups and downs before steady success.'
          : 'No Kaal Sarp yoga.',
      },
    },
    note: chart.timeKnown ? null : 'Birth time unknown: houses are counted from your Moon sign (Chandra Lagna). Lagna and exact house-based predictions need a birth time.',
  };
}

// ---------- Gochar (transit) based daily energy ----------
// Classic favourable transit houses counted from the natal Moon sign.
const GOOD_FROM_MOON: Record<string, number[]> = {
  Sun: [3, 6, 10, 11], Moon: [1, 3, 6, 7, 10, 11], Mars: [3, 6, 11], Mercury: [2, 4, 6, 8, 10, 11],
  Jupiter: [2, 5, 7, 9, 11], Venus: [1, 2, 3, 4, 5, 8, 9, 11, 12], Saturn: [3, 6, 11], Rahu: [3, 6, 11], Ketu: [3, 6, 11],
};
type Area = 'love' | 'career' | 'money' | 'health' | 'family';
const AREA_WEIGHTS: Record<Area, Partial<Record<Planet, number>>> = {
  love: { Venus: 3, Moon: 2, Mars: 1, Jupiter: 1 },
  career: { Sun: 2, Saturn: 2, Mercury: 2, Jupiter: 1, Mars: 1 },
  money: { Jupiter: 3, Venus: 1, Mercury: 2, Moon: 1 },
  health: { Sun: 2, Moon: 2, Mars: 2, Saturn: 1 },
  family: { Moon: 2, Jupiter: 2, Venus: 1 },
};

export function transitHouses(moonSign: number, at = new Date()) {
  const planets: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  return planets.map((planet) => {
    const lon = siderealLongitude(planet, at);
    const sign = Math.floor(lon / 30);
    const house = ((sign - moonSign + 12) % 12) + 1;
    return { planet, sign, house, favourable: GOOD_FROM_MOON[planet].includes(house) };
  });
}

/** 0–100 energy scores per life area for a Moon sign on a given day. Deterministic and explainable. */
export function dailyEnergy(moonSign: number, at = new Date()) {
  const t = transitHouses(moonSign, at);
  const score = (weights: Partial<Record<Planet, number>>) => {
    let s = 0, max = 0;
    for (const [planet, w] of Object.entries(weights) as [Planet, number][]) {
      const tr = t.find((x) => x.planet === planet)!;
      s += tr.favourable ? w : 0;
      max += w;
    }
    return Math.round(35 + (s / max) * 60); // keep in a gentle 35–95 band: no "doom" days
  };
  const areas = Object.fromEntries(Object.entries(AREA_WEIGHTS).map(([k, w]) => [k, score(w)])) as Record<Area, number>;
  const overall = Math.round(Object.values(areas).reduce((a, b) => a + b, 0) / Object.values(areas).length);
  return { overall, ...areas, transits: t };
}
