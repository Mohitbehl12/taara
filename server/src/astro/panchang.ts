import * as A from 'astronomy-engine';
import { NAKSHATRAS, TITHIS, VARAS, YOGAS } from './constants.js';
import { nakshatraOf, siderealLongitude } from './engine.js';

const norm = (x: number) => ((x % 360) + 360) % 360;
const KARANA_MOVABLE = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanija', 'Vishti'];

/** Panchang at a given instant and place. `at` defaults to sunrise of the local date when `date` is given. */
export function panchang(opts: { date: string; tzOffsetMinutes: number; lat: number; lon: number }) {
  const [y, m, d] = opts.date.split('-').map(Number);
  const localMidnightUtc = new Date(Date.UTC(y, m - 1, d) - opts.tzOffsetMinutes * 60_000);
  const observer = new A.Observer(opts.lat, opts.lon, 0);
  const sunrise = A.SearchRiseSet(A.Body.Sun, observer, +1, localMidnightUtc, 1)?.date ?? null;
  const sunset = A.SearchRiseSet(A.Body.Sun, observer, -1, localMidnightUtc, 1)?.date ?? null;
  const moonrise = A.SearchRiseSet(A.Body.Moon, observer, +1, localMidnightUtc, 1)?.date ?? null;
  const at = sunrise ?? new Date(localMidnightUtc.getTime() + 6 * 3_600_000);

  const sun = siderealLongitude('Sun', at);
  const moon = siderealLongitude('Moon', at);
  const diff = norm(moon - sun);
  const tithiIdx = Math.floor(diff / 12); // 0–29
  const paksha = tithiIdx < 15 ? 'Shukla' : 'Krishna';
  const tithiName = tithiIdx === 14 ? 'Purnima' : tithiIdx === 29 ? 'Amavasya' : TITHIS[tithiIdx % 15];
  const yogaIdx = Math.floor(norm(sun + moon) / (360 / 27));
  const k = Math.floor(diff / 6); // 0–59
  const karana = k === 0 ? 'Kimstughna' : k >= 57 ? ['Shakuni', 'Chatushpada', 'Naga'][k - 57] : KARANA_MOVABLE[(k - 1) % 7];
  // Vara is the weekday of local sunrise.
  const localDay = new Date(at.getTime() + opts.tzOffsetMinutes * 60_000).getUTCDay();

  // Rahu Kaal: 1/8th of daytime; segment index by weekday (Sun..Sat).
  let rahuKaal: { start: string; end: string } | null = null;
  if (sunrise && sunset) {
    const seg = (sunset.getTime() - sunrise.getTime()) / 8;
    const idx = [7, 1, 6, 4, 5, 3, 2][localDay];
    rahuKaal = {
      start: new Date(sunrise.getTime() + seg * idx).toISOString(),
      end: new Date(sunrise.getTime() + seg * (idx + 1)).toISOString(),
    };
  }

  return {
    date: opts.date,
    vara: VARAS[localDay],
    tithi: { index: tithiIdx + 1, name: tithiName, paksha },
    nakshatra: { index: nakshatraOf(moon).nakshatra, name: NAKSHATRAS[nakshatraOf(moon).nakshatra] },
    yoga: { index: yogaIdx + 1, name: YOGAS[yogaIdx] },
    karana,
    sunrise: sunrise?.toISOString() ?? null,
    sunset: sunset?.toISOString() ?? null,
    moonrise: moonrise?.toISOString() ?? null,
    rahuKaal,
  };
}
