-- Reconciles columns that were shipped in commit 3276f9a via an ad-hoc script
-- (apply-migrations.ts, now retired) plus the stock-transfer workflow additions
-- (received_qty, cancelled_at/by) and the per-plant transit-warehouse unique index.
-- All statements are idempotent so this applies cleanly on a fresh DB (via
-- drizzle-kit migrate) and on a dev DB already advanced by drizzle-kit push.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "barcode" varchar(50);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "shelf_life_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "gross_weight" numeric(12, 4);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "weight_uom" varchar(20);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "is_qc_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "selling_price_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "min_selling_price_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "purchase_rate_paise" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "safety_stock_qty" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "max_stock_level" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD COLUMN IF NOT EXISTS "received_qty" numeric(18, 4) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "from_plant_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "to_plant_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "transfer_type" varchar(30) DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "driver_name" varchar(100);--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "driver_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "lr_number" varchar(50);--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "dispatched_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "received_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "received_by" uuid;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "cancelled_by" uuid;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "incoterms" varchar(50);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "default_lead_time_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "msme_type" varchar(30);--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "msme_reg_no" varchar(50);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "sales_person_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_tier" varchar(50);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "shipping_terms" varchar(50);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "preferred_transporter" varchar(255);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "grace_period_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_plant_id_plants_id_fk" FOREIGN KEY ("from_plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_plant_id_plants_id_fk" FOREIGN KEY ("to_plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_dispatched_by_users_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_sales_person_id_users_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Partial unique index: at most one in-transit warehouse per plant (drizzle-kit
-- omits the partial predicate, so it is written explicitly here).
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_plant_transit_uq" ON "warehouses" ("plant_id") WHERE "warehouse_type" = 'transit';
