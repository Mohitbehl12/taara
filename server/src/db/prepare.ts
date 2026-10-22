// Runs at the end of `npm run build`. With no DATABASE_URL (demo hosting), it creates and seeds the embedded database
// at build time, where memory is plentiful, so the server itself starts well inside a 512 MB instance.
import { existsSync } from 'node:fs';

if (process.env.DATABASE_URL || process.env.NODE_ENV === 'production') {
  console.log('prepare: real database configured — nothing to do');
} else if (existsSync('./.data/db/PG_VERSION')) {
  console.log('prepare: embedded database already exists');
} else {
  const { connectPglite } = await import('./client.js');
  const { seed } = await import('./seed.js');
  await connectPglite('./.data/db');
  await seed();
  console.log('prepare: embedded demo database created');
}
process.exit(0);
