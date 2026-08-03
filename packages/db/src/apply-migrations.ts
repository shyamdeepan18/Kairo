if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile('../../.env');
  } catch {}
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://erp:erp_dev@localhost:5433/erp_db';
}

import { db } from './client.js';
import { sql } from 'drizzle-orm';

async function run() {
  console.log('Applying schema columns...');
  await db.execute(sql`
    -- items table
    ALTER TABLE items ADD COLUMN IF NOT EXISTS barcode VARCHAR(50);
    ALTER TABLE items ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS gross_weight NUMERIC(12, 4);
    ALTER TABLE items ADD COLUMN IF NOT EXISTS weight_uom VARCHAR(20);
    ALTER TABLE items ADD COLUMN IF NOT EXISTS is_qc_required BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS selling_price_paise INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS min_selling_price_paise INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_rate_paise INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE items ADD COLUMN IF NOT EXISTS safety_stock_qty NUMERIC(18, 4) NOT NULL DEFAULT '0';
    ALTER TABLE items ADD COLUMN IF NOT EXISTS max_stock_level NUMERIC(18, 4) NOT NULL DEFAULT '0';

    -- customers table
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_person_id UUID REFERENCES users(id);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_tier VARCHAR(50);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS shipping_terms VARCHAR(50);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_transporter VARCHAR(255);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS grace_period_days INTEGER NOT NULL DEFAULT 0;

    -- suppliers table
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS incoterms VARCHAR(50);
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_lead_time_days INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS msme_type VARCHAR(30);
    ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS msme_reg_no VARCHAR(50);
  `);
  console.log('Schema migration applied successfully!');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
