import { createServer } from 'node:http';
import cron from 'node-cron';
import { assertProdConfig, env } from './config/env.js';
import { connectPglite, connectPostgres } from './db/client.js';
import { buildApp } from './app.js';
import { attachSockets } from './realtime/socket.js';
import { startBillingLoop } from './services/billing.js';
import { pregenerateDaily } from './services/horoscope.js';
import { dailyHoroscopePush } from './jobs/daily.js';
import { removeOldPalmFiles, runRetention } from './jobs/retention.js';
import { searchCities } from './services/places.js';

async function main() {
  assertProdConfig();
  if (env.databaseUrl) {
    await connectPostgres(env.databaseUrl);
  } else {
    console.warn('DATABASE_URL not set → using embedded PGlite in ./.data/db (demo only, single process)');
    await connectPglite('./.data/db');
  }
  const app = buildApp();
  const http = createServer(app);
  attachSockets(http, env.corsOrigins);
  startBillingLoop();

  // 05:00 IST: generate today's horoscopes; 07:30 IST: send "your horoscope is ready" pushes.
  cron.schedule('0 5 * * *', () => { pregenerateDaily().catch(console.error); }, { timezone: 'Asia/Kolkata' });
  cron.schedule('30 7 * * *', () => { dailyHoroscopePush().catch(console.error); }, { timezone: 'Asia/Kolkata' });
  // 03:15 IST: delete data past its retention period.
  cron.schedule('15 3 * * *', () => { removeOldPalmFiles().then(runRetention).then((r) => console.log('retention', r)).catch(console.error); }, { timezone: 'Asia/Kolkata' });

  http.listen(env.port, () => {
    console.log(`Taara API on :${env.port}`);
    // Warm the place list (≈1 s) so the first person searching for their birthplace doesn't wait.
    setTimeout(() => { searchCities('de'); console.log('place list loaded'); }, 500);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
