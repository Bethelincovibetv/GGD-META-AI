/**
 * PostgreSQL Auth State Adapter for @whiskeysockets/baileys
 * 
 * Provides robust session persistence across restarts and container redeploys
 * on Google Cloud SQL (PostgreSQL) or any Postgres instance.
 * Stores creds.json, signal identity keys, pre-keys, and app state directly in Cloud SQL.
 */

import pg from 'pg';
import {
  BufferJSON,
  initAuthCreds,
  proto,
  AuthenticationCreds,
  SignalKeyStoreWithTransaction,
} from '@whiskeysockets/baileys';
import { adminManager } from './adminManager.ts';

const { Pool } = pg;

export interface PostgresAuthConfig {
  sessionId?: string;
  connectionString?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

export interface PostgresAuthStateResult {
  state: {
    creds: AuthenticationCreds;
    keys: SignalKeyStoreWithTransaction;
  };
  saveCreds: () => Promise<void>;
  clearSession: () => Promise<void>;
  isDatabaseConnected: () => boolean;
  getStoredKeysCount: () => Promise<number>;
  readCustomData: <T = any>(key: string) => Promise<T | null>;
  writeCustomData: (key: string, data: any) => Promise<void>;
  pool: pg.Pool | null;
}

// In-memory fallback if PostgreSQL is not reachable in local dev
const memoryStore = new Map<string, string>();

/**
 * Creates or retrieves a PostgreSQL connection pool configured for
 * Google Cloud SQL (direct, SSL, or Unix socket)
 */
export function createPostgresPool(config?: PostgresAuthConfig): pg.Pool {
  const connectionString = config?.connectionString || process.env.DATABASE_URL;

  // Google Cloud SQL Unix socket format: /cloudsql/PROJECT:REGION:INSTANCE
  const cloudSqlSocketPath = process.env.INSTANCE_CONNECTION_NAME 
    ? `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}` 
    : undefined;

  const poolConfig: pg.PoolConfig = {
    max: 15,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  };

  if (connectionString) {
    poolConfig.connectionString = connectionString;
    if (process.env.DB_SSL === 'true' || connectionString.includes('sslmode=require')) {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  } else if (cloudSqlSocketPath) {
    poolConfig.host = cloudSqlSocketPath;
    poolConfig.user = config?.user || process.env.DB_USER || 'postgres';
    poolConfig.password = config?.password || process.env.DB_PASSWORD || '';
    poolConfig.database = config?.database || process.env.DB_NAME || 'baileys_db';
  } else {
    poolConfig.host = config?.host || process.env.DB_HOST || 'localhost';
    poolConfig.port = config?.port || Number(process.env.DB_PORT) || 5432;
    poolConfig.user = config?.user || process.env.DB_USER || 'postgres';
    poolConfig.password = config?.password || process.env.DB_PASSWORD || '';
    poolConfig.database = config?.database || process.env.DB_NAME || 'baileys_db';

    if (process.env.DB_SSL === 'true') {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
  }

  const pool = new Pool(poolConfig);

  // Prevent idle client reset errors from terminating process
  pool.on('error', (err) => {
    console.error('[Cloud SQL PostgreSQL Pool Error]', err.message);
  });

  return pool;
}

/**
 * Initializes the database schema for Baileys session storage and admin management
 */
export async function initSessionSchema(pool: pg.Pool): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS baileys_sessions (
      session_id VARCHAR(128) NOT NULL,
      key_id VARCHAR(255) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (session_id, key_id)
    );
    CREATE INDEX IF NOT EXISTS idx_baileys_sessions_lookup 
      ON baileys_sessions(session_id, key_id);
    CREATE INDEX IF NOT EXISTS idx_baileys_sessions_session_id 
      ON baileys_sessions(session_id);
  `;
  await pool.query(ddl);
  await adminManager.initSchema(pool);
}

/**
 * Custom Baileys Auth State using Google Cloud SQL (PostgreSQL)
 * Direct database reads & writes with batch optimization and session persistence.
 */
export async function usePostgresAuthState(
  sessionId: string = 'default_session',
  customPool?: pg.Pool
): Promise<PostgresAuthStateResult> {
  let pool = customPool || null;
  let dbConnected = false;

  // Try connecting to PostgreSQL / Cloud SQL
  try {
    if (!pool) {
      pool = createPostgresPool();
    }
    const client = await pool.connect();
    await initSessionSchema(pool);
    adminManager.setPool(pool);
    client.release();
    dbConnected = true;
    console.log(`[Cloud SQL] Connected successfully to PostgreSQL session storage for session '${sessionId}'`);
  } catch (err: any) {
    console.warn(`[Cloud SQL] Could not connect to PostgreSQL (${err.message}). Using memory fallback for local preview.`);
    dbConnected = false;
  }

  // Safe file key sanitizer
  const fixFileName = (file: string) => file?.replace(/\//g, '__')?.replace(/:/g, '-');

  // Parse raw row data safely handling both JSONB objects and stringified values
  const parseRowData = (data: any): any => {
    if (!data) return null;
    try {
      const raw = typeof data === 'string' ? data : JSON.stringify(data);
      return JSON.parse(raw, BufferJSON.reviver);
    } catch (e) {
      console.error('[Cloud SQL] Failed to parse row data with BufferJSON:', e);
      return null;
    }
  };

  // Read single key from Cloud SQL or memory
  const readData = async <T = any>(key: string): Promise<T | null> => {
    const sanitizedKey = fixFileName(key);
    if (dbConnected && pool) {
      try {
        const res = await pool.query(
          'SELECT data FROM baileys_sessions WHERE session_id = $1 AND key_id = $2 LIMIT 1',
          [sessionId, sanitizedKey]
        );
        if (res.rows.length > 0) {
          return parseRowData(res.rows[0].data) as T;
        }
        return null;
      } catch (error) {
        console.error(`[Cloud SQL] Error reading key ${sanitizedKey}:`, error);
        return null;
      }
    } else {
      const data = memoryStore.get(`${sessionId}:${sanitizedKey}`);
      if (!data) return null;
      try {
        return JSON.parse(data, BufferJSON.reviver) as T;
      } catch {
        return null;
      }
    }
  };

  // High-performance batch read from Cloud SQL
  const readMany = async (keys: string[]): Promise<Map<string, any>> => {
    const results = new Map<string, any>();
    if (!keys || keys.length === 0) return results;

    const sanitizedKeys = keys.map(fixFileName);

    if (dbConnected && pool) {
      try {
        const res = await pool.query(
          'SELECT key_id, data FROM baileys_sessions WHERE session_id = $1 AND key_id = ANY($2::text[])',
          [sessionId, sanitizedKeys]
        );
        for (const row of res.rows) {
          results.set(row.key_id, parseRowData(row.data));
        }
      } catch (error) {
        console.error('[Cloud SQL] Error in batch readMany:', error);
      }
    } else {
      for (const k of sanitizedKeys) {
        const val = memoryStore.get(`${sessionId}:${k}`);
        if (val) {
          try {
            results.set(k, JSON.parse(val, BufferJSON.reviver));
          } catch {
            // ignore parse err
          }
        }
      }
    }
    return results;
  };

  // Write single key to Cloud SQL or memory
  const writeData = async (key: string, value: any): Promise<void> => {
    const sanitizedKey = fixFileName(key);
    const serialized = JSON.stringify(value, BufferJSON.replacer);

    if (dbConnected && pool) {
      try {
        await pool.query(
          `INSERT INTO baileys_sessions (session_id, key_id, data, updated_at)
           VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
           ON CONFLICT (session_id, key_id)
           DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
          [sessionId, sanitizedKey, serialized]
        );
      } catch (error) {
        console.error(`[Cloud SQL] Error writing key ${sanitizedKey}:`, error);
      }
    } else {
      memoryStore.set(`${sessionId}:${sanitizedKey}`, serialized);
    }
  };

  // High-performance batch write to Cloud SQL
  const writeMany = async (items: { key: string; value: any }[]): Promise<void> => {
    if (!items || items.length === 0) return;

    if (dbConnected && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const item of items) {
          const sanitizedKey = fixFileName(item.key);
          const serialized = JSON.stringify(item.value, BufferJSON.replacer);
          await client.query(
            `INSERT INTO baileys_sessions (session_id, key_id, data, updated_at)
             VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
             ON CONFLICT (session_id, key_id)
             DO UPDATE SET data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`,
            [sessionId, sanitizedKey, serialized]
          );
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        console.error('[Cloud SQL] Error in batch writeMany:', err);
      } finally {
        client.release();
      }
    } else {
      for (const item of items) {
        const sanitizedKey = fixFileName(item.key);
        memoryStore.set(`${sessionId}:${sanitizedKey}`, JSON.stringify(item.value, BufferJSON.replacer));
      }
    }
  };

  // Batch delete from Cloud SQL
  const removeMany = async (keys: string[]): Promise<void> => {
    if (!keys || keys.length === 0) return;
    const sanitizedKeys = keys.map(fixFileName);

    if (dbConnected && pool) {
      try {
        await pool.query(
          'DELETE FROM baileys_sessions WHERE session_id = $1 AND key_id = ANY($2::text[])',
          [sessionId, sanitizedKeys]
        );
      } catch (error) {
        console.error('[Cloud SQL] Error in batch removeMany:', error);
      }
    } else {
      for (const k of sanitizedKeys) {
        memoryStore.delete(`${sessionId}:${k}`);
      }
    }
  };

  // Load or initialize credentials directly from Cloud SQL table
  const creds: AuthenticationCreds = (await readData('creds.json')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const sanitizedMap = new Map<string, string>(); // sanitizedKey -> id
          ids.forEach((id) => sanitizedMap.set(fixFileName(`${type}-${id}.json`), id));
          const sanitizedKeys = Array.from(sanitizedMap.keys());
          const data: Record<string, any> = {};

          const results = await readMany(sanitizedKeys);
          for (const [sanitizedKey, rawValue] of results.entries()) {
            const id = sanitizedMap.get(sanitizedKey);
            if (id) {
              let val = rawValue;
              if (type === 'app-state-sync-key' && val) {
                val = proto.Message.AppStateSyncKeyData.fromObject(val);
              }
              data[id] = val;
            }
          }
          // Ensure all requested keys exist in returned map (null if absent)
          ids.forEach((id) => {
            if (!(id in data)) {
              data[id] = null;
            }
          });
          return data;
        },
        set: async (data: any) => {
          const toWrite: { key: string; value: any }[] = [];
          const toDelete: string[] = [];

          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}.json`;
              if (value) {
                toWrite.push({ key, value });
              } else {
                toDelete.push(key);
              }
            }
          }

          if (toWrite.length > 0) {
            await writeMany(toWrite);
          }
          if (toDelete.length > 0) {
            await removeMany(toDelete);
          }
        },
        isInTransaction: () => false,
        transaction: async <T>(exec: () => Promise<T>, _key?: string): Promise<T> => {
          return await exec();
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds.json', creds);
    },
    clearSession: async () => {
      if (dbConnected && pool) {
        await pool.query('DELETE FROM baileys_sessions WHERE session_id = $1', [sessionId]);
        console.log(`[Cloud SQL] Cleared session keys for '${sessionId}' from baileys_sessions`);
      }
      for (const k of memoryStore.keys()) {
        if (k.startsWith(`${sessionId}:`)) {
          memoryStore.delete(k);
        }
      }
    },
    isDatabaseConnected: () => dbConnected,
    readCustomData: async <T = any>(key: string): Promise<T | null> => {
      return await readData<T>(`custom_${key}.json`);
    },
    writeCustomData: async (key: string, data: any): Promise<void> => {
      await writeData(`custom_${key}.json`, data);
    },
    getStoredKeysCount: async () => {
      if (dbConnected && pool) {
        try {
          const res = await pool.query(
            'SELECT COUNT(*)::int as count FROM baileys_sessions WHERE session_id = $1',
            [sessionId]
          );
          return res.rows[0]?.count || 0;
        } catch {
          return 0;
        }
      } else {
        let count = 0;
        for (const k of memoryStore.keys()) {
          if (k.startsWith(`${sessionId}:`)) count++;
        }
        return count;
      }
    },
    pool,
  };
}
