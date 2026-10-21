import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

let current: Db | null = null;

/** Production: node-postgres pool. */
export async function connectPostgres(url: string): Promise<Db> {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: url, max: 10 });
  current = drizzle(pool, { schema }) as unknown as Db;
  return current;
}

/** Tests / local demo without Postgres installed: in-process Postgres (WASM). */
export async function connectPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dataDir) (await import('node:fs')).mkdirSync(dataDir, { recursive: true });
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
  current = db as unknown as Db;
  return current;
}

export function db(): Db {
  if (!current) throw new Error('Database not connected');
  return current;
}

export { schema };
