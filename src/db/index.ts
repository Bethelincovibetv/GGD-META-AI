import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolConfig } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const config: PoolConfig = {
      max: 10,
      connectionTimeoutMillis: 15000,
    };

    // Google Cloud SQL platform-provided environment variables
    if (process.env.SQL_HOST) {
      config.host = process.env.SQL_HOST;
      config.user = process.env.SQL_USER;
      config.password = process.env.SQL_PASSWORD;
      config.database = process.env.SQL_DB_NAME;
    } else if (process.env.DATABASE_URL) {
      // Vercel / Neon / External connection string
      config.connectionString = process.env.DATABASE_URL;
      if (process.env.DB_SSL === 'true' || process.env.DATABASE_URL.includes('sslmode=require')) {
        config.ssl = { rejectUnauthorized: false };
      }
    } else if (process.env.INSTANCE_CONNECTION_NAME) {
      // Cloud SQL Unix Socket (Cloud Run)
      config.host = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
      config.user = process.env.DB_USER || 'postgres';
      config.password = process.env.DB_PASSWORD || '';
      config.database = process.env.DB_NAME || 'baileys_db';
    } else {
      // Standard Host & Port
      config.host = process.env.DB_HOST || '127.0.0.1';
      config.port = Number(process.env.DB_PORT) || 5432;
      config.user = process.env.DB_USER || 'postgres';
      config.password = process.env.DB_PASSWORD || '';
      config.database = process.env.DB_NAME || 'baileys_db';
      if (process.env.DB_SSL === 'true') {
        config.ssl = { rejectUnauthorized: false };
      }
    }

    global._postgresPool = new Pool(config);

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });
