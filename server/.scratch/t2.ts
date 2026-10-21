import { saturnCycle, choghadiya, numerology } from '../src/astro/tools.js';
// Saturn entered sidereal Aquarius 17 Jan 2023; Pisces ~29 Mar 2025. Moon sign Capricorn(9): sade sati 2020–2027
const r = saturnCycle(9, new Date('2015-01-01'), new Date('2035-01-01'), new Date('2026-10-21'));
console.log(r.periods.map(p=>`${p.phase} ${p.start.slice(0,10)}→${p.end.slice(0,10)}`).join('\n'));
console.log('current', r.current?.phase, 'spans', r.sadeSatiSpans);
const c = choghadiya({ date: '2026-10-21', tzOffsetMinutes: 330, lat: 28.61, lon: 77.21 });
console.log(c!.weekday, c!.slots.slice(0,3).map(s=>s.name), c!.abhijit);
console.log(numerology('1990-08-15','Mohit Sharma'));
