CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"customer_id" uuid,
	"contract_value_paise" bigint DEFAULT 0 NOT NULL,
	"budget_material_paise" bigint DEFAULT 0 NOT NULL,
	"budget_labor_paise" bigint DEFAULT 0 NOT NULL,
	"budget_subcon_paise" bigint DEFAULT 0 NOT NULL,
	"budget_overhead_paise" bigint DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"cost_centre_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_company_code_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blanket_po_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blanket_po_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"description" text,
	"committed_qty" numeric(18, 4) NOT NULL,
	"released_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(20),
	"cgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"igst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"cess_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "blanket_purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.blanket_po' NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"fiscal_year" varchar(5),
	"posting_date" date NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"exchange_rate" numeric(10, 6) DEFAULT '1' NOT NULL,
	"net_amount_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint DEFAULT 0 NOT NULL,
	"remarks" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date NOT NULL,
	"terms_and_conditions" text,
	CONSTRAINT "blanket_po_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "landed_cost_vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.lcv' NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"fiscal_year" varchar(5),
	"posting_date" date NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"exchange_rate" numeric(10, 6) DEFAULT '1' NOT NULL,
	"net_amount_paise" bigint DEFAULT 0 NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"round_off_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint DEFAULT 0 NOT NULL,
	"remarks" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"allocation_basis" varchar(20) DEFAULT 'by_value' NOT NULL,
	"total_charges_paise" bigint NOT NULL,
	"journal_entry_id" uuid,
	CONSTRAINT "lcv_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lcv_allocated_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lcv_id" uuid NOT NULL,
	"grn_id" uuid NOT NULL,
	"grn_line_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"line_amount_paise" bigint NOT NULL,
	"allocated_charge_paise" bigint NOT NULL,
	"absorbed_paise" bigint DEFAULT 0 NOT NULL,
	"cogs_variance_paise" bigint DEFAULT 0 NOT NULL,
	"sle_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lcv_applicable_grns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lcv_id" uuid NOT NULL,
	"grn_id" uuid NOT NULL,
	"grn_amount_paise" bigint NOT NULL,
	"allocated_charges_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lcv_expense_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lcv_id" uuid NOT NULL,
	"expense_account_id" uuid NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount_paise" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_work_challan_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challan_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"batch_id" uuid,
	"batch_number" varchar(100),
	"rate_paise" bigint DEFAULT 0 NOT NULL,
	"amount_paise" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_work_challans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'manufacturing.job_work_challan' NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"fiscal_year" varchar(5),
	"posting_date" date NOT NULL,
	"remarks" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_work_order_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"source_warehouse_id" uuid NOT NULL,
	"vendor_warehouse_id" uuid NOT NULL,
	"vehicle_number" varchar(30),
	"eway_bill_number" varchar(50),
	"project_id" uuid,
	CONSTRAINT "job_work_challans_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_work_order_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"job_work_order_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"planned_qty" numeric(18, 4) NOT NULL,
	"issued_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"consumed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"uom" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'manufacturing.job_work_order' NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"fiscal_year" varchar(5),
	"posting_date" date NOT NULL,
	"remarks" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"vendor_warehouse_id" uuid NOT NULL,
	"target_item_id" uuid NOT NULL,
	"target_qty" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"service_rate_paise" bigint NOT NULL,
	"service_tax_code_id" uuid,
	"total_service_paise" bigint DEFAULT 0 NOT NULL,
	"issued_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"received_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"expected_completion_date" date,
	"project_id" uuid,
	CONSTRAINT "job_work_orders_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_work_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'manufacturing.job_work_receipt' NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"fiscal_year" varchar(5),
	"posting_date" date NOT NULL,
	"remarks" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_work_order_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"target_item_id" uuid NOT NULL,
	"received_qty" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"destination_warehouse_id" uuid NOT NULL,
	"vendor_warehouse_id" uuid NOT NULL,
	"batch_number" varchar(100),
	"batch_expiry_date" date,
	"raw_material_cost_paise" bigint DEFAULT 0 NOT NULL,
	"service_charge_paise" bigint DEFAULT 0 NOT NULL,
	"total_cost_paise" bigint DEFAULT 0 NOT NULL,
	"unit_cost_paise" bigint DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"project_id" uuid,
	CONSTRAINT "job_work_receipts_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_catch_weight" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "catch_weight_tolerance_pct" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "goods_receipt_note_lines" ADD COLUMN "secondary_qty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "goods_receipt_note_lines" ADD COLUMN "secondary_uom" varchar(20);--> statement-breakpoint
ALTER TABLE "purchase_invoices" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD COLUMN "blanket_po_line_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "blanket_po_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "min_shelf_life_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD COLUMN "secondary_qty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "delivery_note_lines" ADD COLUMN "secondary_uom" varchar(20);--> statement-breakpoint
ALTER TABLE "delivery_notes" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_credit_note_lines" ADD COLUMN "secondary_qty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "sales_credit_note_lines" ADD COLUMN "secondary_uom" varchar(20);--> statement-breakpoint
ALTER TABLE "sales_invoice_lines" ADD COLUMN "secondary_qty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "sales_invoice_lines" ADD COLUMN "secondary_uom" varchar(20);--> statement-breakpoint
ALTER TABLE "sales_invoices" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "sales_quotation_lines" ADD COLUMN "secondary_qty" numeric(18, 4);--> statement-breakpoint
ALTER TABLE "sales_quotation_lines" ADD COLUMN "secondary_uom" varchar(20);--> statement-breakpoint
ALTER TABLE "sales_quotations" ADD COLUMN "project_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_po_lines" ADD CONSTRAINT "blanket_po_lines_blanket_po_id_blanket_purchase_orders_id_fk" FOREIGN KEY ("blanket_po_id") REFERENCES "public"."blanket_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_po_lines" ADD CONSTRAINT "blanket_po_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_po_lines" ADD CONSTRAINT "blanket_po_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "blanket_purchase_orders" ADD CONSTRAINT "blanket_purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "landed_cost_vouchers" ADD CONSTRAINT "landed_cost_vouchers_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_allocated_items" ADD CONSTRAINT "lcv_allocated_items_lcv_id_landed_cost_vouchers_id_fk" FOREIGN KEY ("lcv_id") REFERENCES "public"."landed_cost_vouchers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_allocated_items" ADD CONSTRAINT "lcv_allocated_items_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_allocated_items" ADD CONSTRAINT "lcv_allocated_items_grn_line_id_goods_receipt_note_lines_id_fk" FOREIGN KEY ("grn_line_id") REFERENCES "public"."goods_receipt_note_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_allocated_items" ADD CONSTRAINT "lcv_allocated_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_allocated_items" ADD CONSTRAINT "lcv_allocated_items_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_applicable_grns" ADD CONSTRAINT "lcv_applicable_grns_lcv_id_landed_cost_vouchers_id_fk" FOREIGN KEY ("lcv_id") REFERENCES "public"."landed_cost_vouchers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_applicable_grns" ADD CONSTRAINT "lcv_applicable_grns_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_expense_lines" ADD CONSTRAINT "lcv_expense_lines_lcv_id_landed_cost_vouchers_id_fk" FOREIGN KEY ("lcv_id") REFERENCES "public"."landed_cost_vouchers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "lcv_expense_lines" ADD CONSTRAINT "lcv_expense_lines_expense_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("expense_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challan_lines" ADD CONSTRAINT "job_work_challan_lines_challan_id_job_work_challans_id_fk" FOREIGN KEY ("challan_id") REFERENCES "public"."job_work_challans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challan_lines" ADD CONSTRAINT "job_work_challan_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challan_lines" ADD CONSTRAINT "job_work_challan_lines_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_job_work_order_id_job_work_orders_id_fk" FOREIGN KEY ("job_work_order_id") REFERENCES "public"."job_work_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_vendor_id_suppliers_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_challans" ADD CONSTRAINT "job_work_challans_vendor_warehouse_id_warehouses_id_fk" FOREIGN KEY ("vendor_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_order_materials" ADD CONSTRAINT "job_work_order_materials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_order_materials" ADD CONSTRAINT "job_work_order_materials_job_work_order_id_job_work_orders_id_fk" FOREIGN KEY ("job_work_order_id") REFERENCES "public"."job_work_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_order_materials" ADD CONSTRAINT "job_work_order_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_vendor_id_suppliers_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_vendor_warehouse_id_warehouses_id_fk" FOREIGN KEY ("vendor_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_orders" ADD CONSTRAINT "job_work_orders_target_item_id_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_job_work_order_id_job_work_orders_id_fk" FOREIGN KEY ("job_work_order_id") REFERENCES "public"."job_work_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_vendor_id_suppliers_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_target_item_id_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_destination_warehouse_id_warehouses_id_fk" FOREIGN KEY ("destination_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_work_receipts" ADD CONSTRAINT "job_work_receipts_vendor_warehouse_id_warehouses_id_fk" FOREIGN KEY ("vendor_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_company_idx" ON "projects" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_customer_idx" ON "projects" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_status_idx" ON "projects" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blanket_po_lines_bpo_idx" ON "blanket_po_lines" ("blanket_po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blanket_po_lines_item_idx" ON "blanket_po_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blanket_po_company_date_idx" ON "blanket_purchase_orders" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blanket_po_supplier_idx" ON "blanket_purchase_orders" ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blanket_po_status_idx" ON "blanket_purchase_orders" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_company_date_idx" ON "landed_cost_vouchers" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_status_idx" ON "landed_cost_vouchers" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_allocated_items_lcv_idx" ON "lcv_allocated_items" ("lcv_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_allocated_items_item_idx" ON "lcv_allocated_items" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_allocated_items_grn_line_idx" ON "lcv_allocated_items" ("grn_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_applicable_grns_lcv_idx" ON "lcv_applicable_grns" ("lcv_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_applicable_grns_grn_idx" ON "lcv_applicable_grns" ("grn_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_expense_lines_lcv_idx" ON "lcv_expense_lines" ("lcv_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lcv_expense_lines_account_idx" ON "lcv_expense_lines" ("expense_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwcl_challan_idx" ON "job_work_challan_lines" ("challan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwcl_item_idx" ON "job_work_challan_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwc_order_idx" ON "job_work_challans" ("job_work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwc_vendor_idx" ON "job_work_challans" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwom_order_idx" ON "job_work_order_materials" ("job_work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwom_item_idx" ON "job_work_order_materials" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_work_orders_vendor_idx" ON "job_work_orders" ("vendor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_work_orders_status_idx" ON "job_work_orders" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_work_orders_target_item_idx" ON "job_work_orders" ("target_item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwr_order_idx" ON "job_work_receipts" ("job_work_order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jwr_vendor_idx" ON "job_work_receipts" ("vendor_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_blanket_po_line_id_blanket_po_lines_id_fk" FOREIGN KEY ("blanket_po_line_id") REFERENCES "public"."blanket_po_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_blanket_po_id_blanket_purchase_orders_id_fk" FOREIGN KEY ("blanket_po_id") REFERENCES "public"."blanket_purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
