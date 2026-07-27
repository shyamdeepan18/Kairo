import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  try {
    // Load .env from root if available in Node 20+
    process.loadEnvFile('../../.env');
  } catch {}
}

export default defineConfig({
  schema: './dist/schema/index.js',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://erp:erp_dev@localhost:5433/erp_db',
  },
  verbose: true,
  strict: false,
});

