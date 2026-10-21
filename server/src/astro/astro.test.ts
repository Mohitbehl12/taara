import { describe, expect, it } from 'vitest';
import { computeChart, navamsaSign, siderealLongitude, vimshottari } from './engine.js';
import { gunaMilan } from './matching.js';
import { panchang } from './panchang.js';
import { dailyEnergy } from './interpret.js';

const ist = (s: string) => new Date(Date.parse(`${s}+05:30`));

describe('sidereal positions (Lahiri)', () => {
  it('Makar Sankranti 2025 falls on 14 Jan around 09:00 IST', () => {
    expect(siderealLongitude('Sun', ist('2025-01-14T08:30'))).toBeLessThan(270);
    expect(siderealLongitude('Sun', ist('2025-01-14T09:30'))).toBeGreaterThan(270);
  });
  it('Mesha Sankranti 2025 falls on 14 Apr around 03:30 IST', () => {
    expect(siderealLongitude('Sun', ist('2025-04-14T03:00'))).toBeGreaterThan(359);
    expect(siderealLongitude('Sun', ist('2025-04-14T04:00'))).toBeLessThan(1);
  });
  it('Jan 2025 placements: Saturn in Aquarius, Jupiter Rx in Taurus, Mars Rx in Cancer', () => {
    const c = computeChart({ date: '2025-01-14', time: '12:00', tzOffsetMinutes: 330, lat: 28.61, lon: 77.21 });
    const get = (n: string) => c.planets.find((p) => p.planet === n)!;
    expect(get('Saturn').sign).toBe(10);
    expect(get('Jupiter').sign).toBe(1);
    expect(get('Jupiter').retrograde).toBe(true);
    expect(get('Mars').sign).toBe(3);
    expect(get('Mars').retrograde).toBe(true);
    expect(get('Rahu').sign).toBe(11);
  });
});

describe('lagna', () => {
  it('equals the Sun sign at sunrise', () => {
    const c = computeChart({ date: '2025-01-14', time: '07:15', tzOffsetMinutes: 330, lat: 28.61, lon: 77.21 });
    const sun = c.planets.find((p) => p.planet === 'Sun')!;
    expect(Math.abs(c.lagna!.longitude - sun.longitude)).toBeLessThan(3);
  });
  it('falls back to Moon sign houses when time is unknown', () => {
    const c = computeChart({ date: '1990-05-20', time: null, tzOffsetMinutes: 330, lat: 19.07, lon: 72.88 });
    expect(c.lagna).toBeNull();
    expect(c.planets.find((p) => p.planet === 'Moon')!.house).toBe(1);
  });
});

describe('navamsa', () => {
  it('0° Aries → Aries, 0° Taurus → Capricorn, 0° Gemini → Libra', () => {
    expect(navamsaSign(0.1)).toBe(0);
    expect(navamsaSign(30.1)).toBe(9);
    expect(navamsaSign(60.1)).toBe(6);
  });
});

describe('vimshottari', () => {
  it('covers 120 years in 9 contiguous periods with 9 sub-periods each', () => {
    const c = computeChart({ date: '1990-05-20', time: '08:30', tzOffsetMinutes: 330, lat: 19.07, lon: 72.88 });
    const d = vimshottari(c);
    expect(d).toHaveLength(9);
    for (let i = 1; i < 9; i++) expect(d[i].start).toBe(d[i - 1].end);
    const years = (Date.parse(d[8].end) - Date.parse(d[0].start)) / (365.2425 * 86_400_000);
    expect(years).toBeCloseTo(120, 3);
    expect(d[0].sub![8].end).toBe(d[0].end.replace(/\.\d+Z/, (m) => m)); // sub-periods fill the MD
  });
});

describe('guna milan', () => {
  it('scores within 0–36 and penalises same nadi', () => {
    const same = gunaMilan({ moonSign: 0, nakshatra: 0 }, { moonSign: 4, nakshatra: 9 });
    expect(same.total).toBeGreaterThanOrEqual(0);
    expect(same.total).toBeLessThanOrEqual(36);
    // Ashwini and Jyeshtha are both Adi nadi
    expect(gunaMilan({ moonSign: 0, nakshatra: 0 }, { moonSign: 7, nakshatra: 17 }).nadiDosha).toBe(true);
  });
  it('identical moons get full Yoni, Gana and Graha Maitri', () => {
    const r = gunaMilan({ moonSign: 3, nakshatra: 7 }, { moonSign: 3, nakshatra: 7 });
    const k = Object.fromEntries(r.kootas.map((x) => [x.key, x.score]));
    expect(k.yoni).toBe(4);
    expect(k.gana).toBe(6);
    expect(k.graha_maitri).toBe(5);
    expect(k.nadi).toBe(0);
  });
});

describe('panchang', () => {
  it('Diwali 2025 (20 Oct, Delhi) shows Chaturdashi→Amavasya around Krishna paksha end', () => {
    const p = panchang({ date: '2025-10-21', tzOffsetMinutes: 330, lat: 28.61, lon: 77.21 });
    expect(p.tithi.paksha).toBe('Krishna');
    expect(['Chaturdashi', 'Amavasya']).toContain(p.tithi.name);
    expect(p.rahuKaal).not.toBeNull();
  });
});

describe('daily energy', () => {
  it('returns gentle 35–95 scores', () => {
    const e = dailyEnergy(4, new Date('2026-10-21T00:00:00Z'));
    for (const k of ['overall', 'love', 'career', 'money', 'health', 'family'] as const) {
      expect(e[k]).toBeGreaterThanOrEqual(35);
      expect(e[k]).toBeLessThanOrEqual(95);
    }
  });
});

import { choghadiya, numerology, saturnCycle } from './tools.js';
describe('tools', () => {
  it('Makar (Capricorn) Moon: Sade Sati Jan 2017 → Mar 2025', () => {
    const r = saturnCycle(9, new Date('2015-01-01'), new Date('2030-01-01'), new Date('2021-06-01'));
    expect(r.sadeSatiSpans[0].start.slice(0, 7)).toBe('2017-01');
    expect(r.sadeSatiSpans[0].end.slice(0, 7)).toBe('2025-03');
    expect(r.current?.phase).toBe('peak');
  });
  it('Wednesday day Choghadiya starts with Labh; Abhijit flagged on Wednesday', () => {
    const c = choghadiya({ date: '2026-10-21', tzOffsetMinutes: 330, lat: 28.61, lon: 77.21 })!;
    expect(c.slots[0].name).toBe('labh');
    expect(c.slots).toHaveLength(16);
    expect(c.abhijit.avoidToday).toBe(true);
  });
  it('numerology: 15 Aug 1990 → Mulank 6, Bhagyank 6', () => {
    const n = numerology('1990-08-15', 'Mohit');
    expect(n.mulank).toBe(6);
    expect(n.bhagyank).toBe(6);
    expect(n.nameNumber).toBeGreaterThan(0);
  });
});
