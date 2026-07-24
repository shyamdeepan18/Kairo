import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

// Connection pool — shared across the process
export const pool = postgres(url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(pool, { schema, logger: process.env.NODE_ENV !== 'production' });
export type DB = typeof db;
