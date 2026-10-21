import * as A from 'astronomy-engine';
import {
  COMBUSTION_ORB, DASHA_ORDER, EXALTATION, NAKSHATRAS, OWN_SIGNS, PLANETS, SIGNS, type Planet,
} from './constants.js';

export interface BirthInput {
  date: string;            // YYYY-MM-DD, local civil date at birth place
  time?: string | null;    // HH:mm local; null/undefined when unknown
  tzOffsetMinutes: number; // e.g. 330 for IST
  lat: number;
  lon: number;             // east positive
}

export interface PlanetPosition {
  planet: Planet;
  longitude: number;   // sidereal, 0–360
  sign: number;        // 0–11
  degreeInSign: number;
  nakshatra: number;   // 0–26
  pada: number;        // 1–4
  house: number;       // 1–12 (whole sign from Lagna, or from Moon if time unknown)
  retrograde: boolean;
  combust: boolean;
  dignity: 'exalted' | 'debilitated' | 'own' | 'neutral';
  navamsaSign: number;
}

export interface Chart {
  utc: string;
  ayanamsa: number;
  timeKnown: boolean;
  lagna: { longitude: number; sign: number; degreeInSign: number; nakshatra: number; pada: number } | null;
  referenceSign: number; // Lagna sign, or Moon sign when birth time unknown (Chandra Lagna)
  planets: PlanetPosition[];
  moonSign: number;
  sunSign: number;
  nakshatra: number;
  pada: number;
}

const norm = (x: number) => ((x % 360) + 360) % 360;
const DEG = Math.PI / 180;

export function toUtc(input: Pick<BirthInput, 'date' | 'time' | 'tzOffsetMinutes'>): Date {
  const [y, m, d] = input.date.split('-').map(Number);
  // Unknown time → local noon minimises the worst-case Moon error (±6.5° ≈ half a nakshatra).
  const [hh, mm] = (input.time ?? '12:00').split(':').map(Number);
  if (![y, m, d, hh, mm].every(Number.isFinite)) throw new Error('Invalid date or time');
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - input.tzOffsetMinutes * 60_000);
}

/** Lahiri (Chitrapaksha) ayanamsa in degrees. J2000 value per Swiss Ephemeris, advanced by general precession. */
export function lahiriAyanamsa(date: Date): number {
  const T = (A.MakeTime(date).tt) / 36525; // Julian centuries TT from J2000
  return 23.857092 + (5028.796195 * T + 1.1054348 * T * T) / 3600;
}

const BODY: Record<Exclude<Planet, 'Rahu' | 'Ketu'>, A.Body> = {
  Sun: A.Body.Sun, Moon: A.Body.Moon, Mars: A.Body.Mars, Mercury: A.Body.Mercury,
  Jupiter: A.Body.Jupiter, Venus: A.Body.Venus, Saturn: A.Body.Saturn,
};

/** Tropical geocentric ecliptic longitude (true equinox of date). */
function tropicalLongitude(planet: Planet, date: Date): number {
  if (planet === 'Rahu' || planet === 'Ketu') {
    const T = A.MakeTime(date).tt / 36525;
    const node = norm(125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000); // mean node
    return planet === 'Rahu' ? node : norm(node + 180);
  }
  const vec = A.GeoVector(BODY[planet], date, true);
  const ect = A.RotateVector(A.Rotation_EQJ_ECT(date), vec);
  return norm(A.SphereFromVector(ect).lon);
}

export function siderealLongitude(planet: Planet, date: Date): number {
  return norm(tropicalLongitude(planet, date) - lahiriAyanamsa(date));
}

/** Tropical ascendant from true obliquity and local apparent sidereal time. */
function tropicalAscendant(date: Date, lat: number, lon: number): number {
  const ramc = norm(A.SiderealTime(date) * 15 + lon) * DEG;
  const eps = A.e_tilt(A.MakeTime(date)).tobl * DEG;
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(eps) * Math.tan(lat * DEG) + Math.cos(eps) * Math.sin(ramc)));
  return norm(asc / DEG);
}

export function nakshatraOf(longitude: number) {
  const span = 360 / 27;
  const idx = Math.floor(longitude / span) % 27;
  const pada = Math.floor((longitude % span) / (span / 4)) + 1;
  return { nakshatra: idx, pada, fractionElapsed: (longitude % span) / span };
}

export function navamsaSign(longitude: number): number {
  const sign = Math.floor(longitude / 30);
  const part = Math.floor((longitude % 30) / (30 / 9));
  const start = sign % 3 === 0 ? sign : sign % 3 === 1 ? sign + 8 : sign + 4; // movable / fixed / dual
  return (start + part) % 12;
}

function dignity(planet: Planet, sign: number): PlanetPosition['dignity'] {
  const ex = EXALTATION[planet];
  if (ex !== undefined && ex === sign) return 'exalted';
  if (ex !== undefined && (ex + 6) % 12 === sign) return 'debilitated';
  if (OWN_SIGNS[planet]?.includes(sign)) return 'own';
  return 'neutral';
}

export function computeChart(input: BirthInput): Chart {
  if (Math.abs(input.lat) > 66) throw new Error('Charts above 66° latitude are not supported');
  const date = toUtc(input);
  const ayanamsa = lahiriAyanamsa(date);
  const dayMs = 86_400_000;
  const before = new Date(date.getTime() - dayMs / 2);
  const after = new Date(date.getTime() + dayMs / 2);

  const sunLon = siderealLongitude('Sun', date);
  const raw = PLANETS.map((planet) => {
    const longitude = siderealLongitude(planet, date);
    let speed = norm(siderealLongitude(planet, after) - siderealLongitude(planet, before) + 180) - 180;
    const retrograde = planet === 'Rahu' || planet === 'Ketu' ? true : speed < 0;
    return { planet, longitude, retrograde, speed };
  });

  const timeKnown = Boolean(input.time);
  let lagna: Chart['lagna'] = null;
  if (timeKnown) {
    const lon = norm(tropicalAscendant(date, input.lat, input.lon) - ayanamsa);
    const n = nakshatraOf(lon);
    lagna = { longitude: lon, sign: Math.floor(lon / 30), degreeInSign: lon % 30, nakshatra: n.nakshatra, pada: n.pada };
  }
  const moon = raw.find((p) => p.planet === 'Moon')!;
  const moonSign = Math.floor(moon.longitude / 30);
  const referenceSign = lagna ? lagna.sign : moonSign;

  const planets: PlanetPosition[] = raw.map(({ planet, longitude, retrograde }) => {
    const sign = Math.floor(longitude / 30);
    const n = nakshatraOf(longitude);
    const orb = COMBUSTION_ORB[planet];
    const dist = Math.abs(norm(longitude - sunLon + 180) - 180);
    return {
      planet, longitude, sign, degreeInSign: longitude % 30, nakshatra: n.nakshatra, pada: n.pada,
      house: ((sign - referenceSign + 12) % 12) + 1,
      retrograde, combust: orb ? dist < orb[retrograde ? 1 : 0] : false,
      dignity: dignity(planet, sign), navamsaSign: navamsaSign(longitude),
    };
  });

  const mn = nakshatraOf(moon.longitude);
  return {
    utc: date.toISOString(), ayanamsa, timeKnown, lagna, referenceSign, planets,
    moonSign, sunSign: Math.floor(sunLon / 30), nakshatra: mn.nakshatra, pada: mn.pada,
  };
}

// ---------- Vimshottari dasha ----------
export interface DashaPeriod { lord: Planet; start: string; end: string; sub?: DashaPeriod[] }
const YEAR_MS = 365.2425 * 86_400_000;

export function vimshottari(chart: Chart, levels: 1 | 2 = 2): DashaPeriod[] {
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const { nakshatra, fractionElapsed } = nakshatraOf(moon.longitude);
  const startIdx = nakshatra % 9;
  const birth = new Date(chart.utc).getTime();
  // Mahadasha running at birth started before birth.
  let cursor = birth - fractionElapsed * DASHA_ORDER[startIdx].years * YEAR_MS;
  const out: DashaPeriod[] = [];
  for (let i = 0; i < 9; i++) {
    const md = DASHA_ORDER[(startIdx + i) % 9];
    const mdStart = cursor;
    const mdEnd = cursor + md.years * YEAR_MS;
    const period: DashaPeriod = { lord: md.lord, start: new Date(mdStart).toISOString(), end: new Date(mdEnd).toISOString() };
    if (levels === 2) {
      let sc = mdStart;
      period.sub = [];
      for (let j = 0; j < 9; j++) {
        const ad = DASHA_ORDER[(startIdx + i + j) % 9];
        const len = (md.years * ad.years / 120) * YEAR_MS;
        period.sub.push({ lord: ad.lord, start: new Date(sc).toISOString(), end: new Date(sc + len).toISOString() });
        sc += len;
      }
    }
    out.push(period);
    cursor = mdEnd;
  }
  return out;
}

export function currentDasha(periods: DashaPeriod[], at = new Date()) {
  const t = at.getTime();
  const md = periods.find((p) => Date.parse(p.start) <= t && t < Date.parse(p.end));
  const ad = md?.sub?.find((p) => Date.parse(p.start) <= t && t < Date.parse(p.end));
  return { mahadasha: md ? { lord: md.lord, start: md.start, end: md.end } : null, antardasha: ad ?? null };
}

// ---------- Doshas ----------
export function manglik(chart: Chart) {
  const mars = chart.planets.find((p) => p.planet === 'Mars')!;
  const bad = [1, 2, 4, 7, 8, 12];
  const fromLagna = chart.lagna ? bad.includes(mars.house) : false;
  const fromMoonHouse = ((mars.sign - chart.moonSign + 12) % 12) + 1;
  const fromMoon = bad.includes(fromMoonHouse);
  // Common cancellations: Mars in own sign or exalted.
  const cancelled = mars.dignity === 'own' || mars.dignity === 'exalted';
  return { present: (fromLagna || fromMoon) && !cancelled, fromLagna, fromMoon, cancelled };
}

export function kaalSarp(chart: Chart) {
  const rahu = chart.planets.find((p) => p.planet === 'Rahu')!.longitude;
  const seven = chart.planets.filter((p) => p.planet !== 'Rahu' && p.planet !== 'Ketu');
  const rel = seven.map((p) => norm(p.longitude - rahu));
  const allOneSide = rel.every((r) => r < 180) || rel.every((r) => r > 180);
  return { present: allOneSide };
}

export const signName = (i: number) => SIGNS[i];
export const nakshatraName = (i: number) => NAKSHATRAS[i];
