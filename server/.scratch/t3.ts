import { saturnCycle } from '../src/astro/tools.js';
let t=Date.now(); saturnCycle(4, new Date('1990-01-01'), new Date('2090-01-01')); console.log('first', Date.now()-t);
t=Date.now(); saturnCycle(7, new Date('1990-01-01'), new Date('2090-01-01')); console.log('cached', Date.now()-t);
