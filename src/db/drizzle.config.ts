import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const sqlHost = process.env.SQL_HOST || process.env.DB_HOST || '127.0.0.1';
const sqlDbName = process.env.SQL_DB_NAME || process.env.DB_NAME || 'baileys_db';
const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.DB_USER || 'postgres';
const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.DB_PASSWORD || '';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials: {
    host: sqlHost,
    user: user,
    password: password,
    database: sqlDbName,
    ssl: process.env.DB_SSL === 'true',
  },
  verbose: true,
});
