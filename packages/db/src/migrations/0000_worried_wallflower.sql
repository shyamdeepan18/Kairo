DO $$ BEGIN
 CREATE TYPE "public"."warehouse_type" AS ENUM('raw_material', 'work_in_progress', 'finished_goods', 'scrap', 'transit', 'consignment');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."purchase_payment_mode" AS ENUM('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'adjustment');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."supplier_type" AS ENUM('registered', 'unregistered', 'composition', 'sez', 'import', 'government');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."customer_address_type" AS ENUM('billing', 'shipping', 'both');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."customer_type" AS ENUM('registered', 'unregistered', 'composition', 'sez', 'export', 'government');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."sales_receipt_mode" AS ENUM('cash', 'bank_transfer', 'cheque', 'upi', 'card', 'adjustment');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."cost_allocation_basis" AS ENUM('percent', 'by_weight', 'by_value', 'nrv');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."manufacturing_type" AS ENUM('discrete', 'process');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."formula_output_type" AS ENUM('primary', 'co_product', 'by_product');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."approver_type" AS ENUM('role', 'user');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token" text NOT NULL,
	"user_agent" text,
	"ip_address" varchar(45),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system_admin" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"gstin" varchar(15),
	"pan" varchar(10),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"state_code" varchar(2),
	"pincode" varchar(6),
	"phone" varchar(20),
	"email" varchar(255),
	"website" varchar(255),
	"base_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"financial_year_start" varchar(5) DEFAULT '04-01' NOT NULL,
	"logo_path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"gstin" varchar(15),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"state_code" varchar(2),
	"pincode" varchar(6),
	"phone" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"warehouse_type" "warehouse_type" DEFAULT 'raw_material' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"module" varchar(50) NOT NULL,
	"document_type" varchar(50),
	"action" varchar(50) NOT NULL,
	"label" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_system_role" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_approval_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"document_type" varchar(100) NOT NULL,
	"max_amount_paise" integer DEFAULT -1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"is_granted" boolean NOT NULL,
	"reason" text,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_plant_access" (
	"user_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_plant_access_user_id_plant_id_pk" PRIMARY KEY("user_id","plant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_warehouse_access" (
	"user_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"can_issue" boolean DEFAULT true NOT NULL,
	"can_receive" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_warehouse_access_user_id_warehouse_id_pk" PRIMARY KEY("user_id","warehouse_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" varchar(50),
	"action" varchar(50) NOT NULL,
	"from_status" varchar(50),
	"to_status" varchar(50),
	"changes" jsonb,
	"remarks" text,
	"performed_by" uuid NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_number_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"document_type" varchar(100) NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"fiscal_year" varchar(5),
	"include_fiscal_year" boolean DEFAULT true NOT NULL,
	"include_plant_code" boolean DEFAULT false NOT NULL,
	"padding" integer DEFAULT 4 NOT NULL,
	"current_number" integer DEFAULT 0 NOT NULL,
	"reset_on_new_year" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_number_series_uq" UNIQUE("company_id","document_type","plant_id","fiscal_year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_type_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"l1_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"l2_fields" jsonb DEFAULT '{"fields":[]}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_type_config_company_type_uq" UNIQUE("company_id","document_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"account_type" varchar(20) NOT NULL,
	"normal_balance" varchar(10) NOT NULL,
	"parent_id" uuid,
	"is_group" boolean DEFAULT false NOT NULL,
	"posting_category" varchar(100),
	"is_system_account" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chart_of_accounts_code_company_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_account_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_account_config_uq" UNIQUE("company_id","plant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"document_type" varchar(100),
	"document_id" uuid,
	"document_number" varchar(50),
	"entry_number" varchar(50) NOT NULL,
	"posting_date" date NOT NULL,
	"fiscal_year" varchar(5) NOT NULL,
	"period" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"exchange_rate" numeric(10, 6) DEFAULT '1' NOT NULL,
	"narration" text,
	"status" varchar(20) DEFAULT 'posted' NOT NULL,
	"is_reversed" boolean DEFAULT false NOT NULL,
	"reversed_by" uuid,
	"reversal_of" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_entry_number_unique" UNIQUE("entry_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journal_entry_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_amount_paise" integer DEFAULT 0 NOT NULL,
	"credit_amount_paise" integer DEFAULT 0 NOT NULL,
	"party_type" varchar(20),
	"party_id" uuid,
	"cost_centre_id" uuid,
	"narration" text,
	"tax_code" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_tax_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" varchar(50),
	"line_number" integer NOT NULL,
	"tax_code_id" uuid,
	"tax_code" varchar(20),
	"hsn_code" varchar(10),
	"is_service" boolean DEFAULT false NOT NULL,
	"item_description" varchar(300),
	"quantity" numeric(15, 4),
	"unit" varchar(20),
	"base_amount_paise" integer DEFAULT 0 NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"assessable_amount_paise" integer DEFAULT 0 NOT NULL,
	"gst_rate_bp" integer DEFAULT 0 NOT NULL,
	"cgst_rate_bp" integer DEFAULT 0 NOT NULL,
	"sgst_rate_bp" integer DEFAULT 0 NOT NULL,
	"igst_rate_bp" integer DEFAULT 0 NOT NULL,
	"cess_rate_bp" integer DEFAULT 0 NOT NULL,
	"cgst_amount_paise" integer DEFAULT 0 NOT NULL,
	"sgst_amount_paise" integer DEFAULT 0 NOT NULL,
	"igst_amount_paise" integer DEFAULT 0 NOT NULL,
	"cess_amount_paise" integer DEFAULT 0 NOT NULL,
	"total_tax_paise" integer DEFAULT 0 NOT NULL,
	"total_line_paise" integer DEFAULT 0 NOT NULL,
	"place_of_supply" varchar(2),
	"is_inter_state" boolean DEFAULT false NOT NULL,
	"supply_type" varchar(10),
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"posting_date" date,
	"fiscal_year" varchar(5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "e_invoice_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"irn" varchar(64),
	"ack_no" varchar(20),
	"ack_date" timestamp with time zone,
	"signed_invoice" text,
	"signed_qr_code" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"irp_payload" jsonb,
	"irp_response" jsonb,
	"error_message" text,
	"cancel_reason" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "e_invoice_records_irn_unique" UNIQUE("irn")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hsn_sac_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"description" varchar(500) NOT NULL,
	"is_service" boolean DEFAULT false NOT NULL,
	"default_gst_rate_bp" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hsn_sac_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"rate_type" varchar(20) NOT NULL,
	"gst_rate_bp" integer DEFAULT 0 NOT NULL,
	"cgst_rate_bp" integer DEFAULT 0 NOT NULL,
	"sgst_rate_bp" integer DEFAULT 0 NOT NULL,
	"igst_rate_bp" integer DEFAULT 0 NOT NULL,
	"cess_rate_bp" integer DEFAULT 0 NOT NULL,
	"is_system_code" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_codes_company_code_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"batch_number" varchar(100) NOT NULL,
	"supplier_batch_ref" varchar(100),
	"manufacture_date" date,
	"expiry_date" date,
	"qc_status" varchar(20) DEFAULT 'approved' NOT NULL,
	"properties" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_batches_number_uq" UNIQUE("company_id","item_id","batch_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"parent_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_groups_code_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_serials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"serial_number" varchar(100) NOT NULL,
	"current_status" varchar(20) DEFAULT 'in_stock' NOT NULL,
	"current_warehouse_id" uuid,
	"receipt_document_type" varchar(50),
	"receipt_document_id" uuid,
	"receipt_document_number" varchar(50),
	"warranty_expiry" date,
	"properties" jsonb,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_serials_number_uq" UNIQUE("company_id","item_id","serial_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"item_code" varchar(50) NOT NULL,
	"item_name" varchar(255) NOT NULL,
	"description" text,
	"item_type" varchar(30) NOT NULL,
	"item_group_id" uuid,
	"primary_uom" varchar(20) NOT NULL,
	"secondary_uom" varchar(20),
	"conversion_factor" numeric(18, 6),
	"hsn_sac_code" varchar(10),
	"default_tax_code_id" uuid,
	"is_stock_item" boolean DEFAULT true NOT NULL,
	"tracking_type" varchar(10) DEFAULT 'none' NOT NULL,
	"valuation_method" varchar(20) DEFAULT 'weighted_average' NOT NULL,
	"standard_cost_paise" integer DEFAULT 0 NOT NULL,
	"reorder_level_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"reorder_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"lead_time_days" integer DEFAULT 0 NOT NULL,
	"min_order_qty" numeric(18, 4) DEFAULT '1' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_company_uq" UNIQUE("company_id","item_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_adjustment_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adjustment_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"description" text,
	"movement_type" varchar(50) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"valuation_rate_paise" integer DEFAULT 0 NOT NULL,
	"valuation_amount_paise" integer DEFAULT 0 NOT NULL,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"posting_date" date NOT NULL,
	"fiscal_year" varchar(5) NOT NULL,
	"period" smallint NOT NULL,
	"adjustment_type" varchar(50) DEFAULT 'physical_count' NOT NULL,
	"reason" text,
	"remarks" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"total_amount_paise" integer DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_by" uuid,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity_on_hand" numeric(18, 4) DEFAULT '0' NOT NULL,
	"quantity_reserved" numeric(18, 4) DEFAULT '0' NOT NULL,
	"quantity_ordered" numeric(18, 4) DEFAULT '0' NOT NULL,
	"valuation_rate_paise" integer DEFAULT 0 NOT NULL,
	"valuation_amount_paise" integer DEFAULT 0 NOT NULL,
	"last_movement_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_key_uq" UNIQUE("company_id","plant_id","warehouse_id","item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"document_line_number" integer,
	"movement_type" varchar(50) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"quantity_in_primary_uom" numeric(18, 4) NOT NULL,
	"valuation_rate_paise" integer NOT NULL,
	"valuation_amount_paise" integer NOT NULL,
	"batch_id" uuid,
	"serial_id" uuid,
	"cost_centre_id" uuid,
	"production_order_id" uuid,
	"posting_date" date NOT NULL,
	"fiscal_year" varchar(5) NOT NULL,
	"period" smallint NOT NULL,
	"remarks" text,
	"is_reversal" boolean DEFAULT false NOT NULL,
	"reversed_by" uuid,
	"reversal_of" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"document_line_number" integer NOT NULL,
	"reserved_qty" numeric(18, 4) NOT NULL,
	"fulfilled_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"valuation_rate_paise" integer DEFAULT 0 NOT NULL,
	"valuation_amount_paise" integer DEFAULT 0 NOT NULL,
	"batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_number" varchar(50) NOT NULL,
	"posting_date" date NOT NULL,
	"fiscal_year" varchar(5) NOT NULL,
	"period" smallint NOT NULL,
	"from_warehouse_id" uuid NOT NULL,
	"to_warehouse_id" uuid NOT NULL,
	"reason" text,
	"remarks" text,
	"vehicle_no" varchar(30),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"total_amount_paise" integer DEFAULT 0 NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"rejected_at" timestamp with time zone,
	"rejected_by" uuid,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_of_measures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_of_measures_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "uom_conversions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"item_id" uuid,
	"from_uom" varchar(20) NOT NULL,
	"to_uom" varchar(20) NOT NULL,
	"factor" numeric(18, 8) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uom_conversions_uq" UNIQUE("company_id","item_id","from_uom","to_uom")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goods_receipt_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grn_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"po_line_id" uuid,
	"item_id" uuid NOT NULL,
	"description" text,
	"received_qty" numeric(18, 4) NOT NULL,
	"accepted_qty" numeric(18, 4) NOT NULL,
	"rejected_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"valuation_rate_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(10),
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint NOT NULL,
	"warehouse_id" uuid,
	"batch_id" uuid,
	"batch_number" varchar(100),
	"billed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"rejection_reason" text,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goods_receipt_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.grn' NOT NULL,
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
	"po_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"supplier_dc_no" varchar(50),
	"supplier_dc_date" date,
	"gate_entry_no" varchar(50),
	"vehicle_no" varchar(20),
	"qc_required" boolean DEFAULT false NOT NULL,
	"qc_status" varchar(20) DEFAULT 'not_required' NOT NULL,
	"billing_status" varchar(20) DEFAULT 'not_billed' NOT NULL,
	"journal_entry_id" uuid,
	CONSTRAINT "goods_receipt_notes_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"po_line_id" uuid,
	"grn_line_id" uuid,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(10),
	"cgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"igst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"cess_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.invoice' NOT NULL,
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
	"po_id" uuid,
	"supplier_invoice_number" varchar(50) NOT NULL,
	"supplier_invoice_date" date NOT NULL,
	"due_date" date,
	"place_of_supply" varchar(2),
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"supplier_irn" varchar(64),
	"itc_eligible" boolean DEFAULT true NOT NULL,
	"tds_amount_paise" bigint DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"payment_status" varchar(20) DEFAULT 'unpaid' NOT NULL,
	"paid_amount_paise" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "purchase_invoices_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"requisition_line_id" uuid,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(10),
	"cgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"igst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"cess_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint NOT NULL,
	"received_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"billed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"warehouse_id" uuid,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.po' NOT NULL,
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
	"requisition_id" uuid,
	"supplier_ref" varchar(100),
	"expected_delivery_date" date,
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"delivery_warehouse_id" uuid,
	"delivery_address" text,
	"place_of_supply" varchar(2),
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"receipt_status" varchar(20) DEFAULT 'not_received' NOT NULL,
	"billing_status" varchar(20) DEFAULT 'not_billed' NOT NULL,
	CONSTRAINT "purchase_orders_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"allocated_amount_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.payment' NOT NULL,
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
	"payment_mode" "purchase_payment_mode" DEFAULT 'bank_transfer' NOT NULL,
	"instrument_no" varchar(50),
	"instrument_date" date,
	"bank_reference" varchar(100),
	"paid_amount_paise" bigint NOT NULL,
	"allocated_amount_paise" bigint DEFAULT 0 NOT NULL,
	"unallocated_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tds_amount_paise" bigint DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	CONSTRAINT "purchase_payments_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_requisition_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requisition_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"required_by_date" date,
	"estimated_rate_paise" bigint DEFAULT 0 NOT NULL,
	"warehouse_id" uuid,
	"suggested_supplier_id" uuid,
	"ordered_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_status" varchar(20) DEFAULT 'open' NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "purchase_requisitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.requisition' NOT NULL,
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
	"required_by_date" date,
	"purpose" text,
	"fulfilment_status" varchar(20) DEFAULT 'open' NOT NULL,
	CONSTRAINT "purchase_requisitions_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"supplier_type" "supplier_type" DEFAULT 'registered' NOT NULL,
	"gstin" varchar(15),
	"pan" varchar(10),
	"state_code" varchar(2),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"pincode" varchar(6),
	"country" varchar(100) DEFAULT 'India' NOT NULL,
	"contact_person" varchar(255),
	"phone" varchar(20),
	"email" varchar(255),
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"credit_limit_paise" bigint DEFAULT 0 NOT NULL,
	"default_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"tds_applicable" boolean DEFAULT false NOT NULL,
	"tds_section" varchar(20),
	"bank_account_name" varchar(255),
	"bank_account_number" varchar(30),
	"bank_ifsc" varchar(11),
	"bank_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_company_code_uq" UNIQUE("company_id","supplier_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"address_type" "customer_address_type" DEFAULT 'both' NOT NULL,
	"label" varchar(100),
	"gstin" varchar(15),
	"state_code" varchar(2),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"pincode" varchar(6),
	"country" varchar(100) DEFAULT 'India' NOT NULL,
	"contact_person" varchar(255),
	"phone" varchar(20),
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"customer_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"legal_name" varchar(255),
	"customer_type" "customer_type" DEFAULT 'registered' NOT NULL,
	"gstin" varchar(15),
	"pan" varchar(10),
	"state_code" varchar(2),
	"contact_person" varchar(255),
	"phone" varchar(20),
	"email" varchar(255),
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"credit_limit_paise" bigint DEFAULT 0 NOT NULL,
	"credit_hold" boolean DEFAULT false NOT NULL,
	"default_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"default_discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"tcs_applicable" boolean DEFAULT false NOT NULL,
	"tcs_section" varchar(20),
	"bank_account_name" varchar(255),
	"bank_account_number" varchar(30),
	"bank_ifsc" varchar(11),
	"bank_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_company_code_uq" UNIQUE("company_id","customer_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"so_line_id" uuid,
	"item_id" uuid NOT NULL,
	"description" text,
	"delivered_qty" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"cogs_rate_paise" bigint DEFAULT 0 NOT NULL,
	"cogs_amount_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(10),
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint DEFAULT 0 NOT NULL,
	"warehouse_id" uuid,
	"batch_id" uuid,
	"batch_number" varchar(100),
	"billed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'sales.delivery' NOT NULL,
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
	"customer_id" uuid NOT NULL,
	"so_id" uuid,
	"warehouse_id" uuid NOT NULL,
	"shipping_address_id" uuid,
	"transporter_name" varchar(255),
	"vehicle_no" varchar(20),
	"lr_number" varchar(50),
	"eway_bill_no" varchar(15),
	"eway_bill_date" date,
	"distance_km" integer,
	"billing_status" varchar(20) DEFAULT 'not_billed' NOT NULL,
	"journal_entry_id" uuid,
	CONSTRAINT "delivery_notes_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"so_line_id" uuid,
	"delivery_line_id" uuid,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(10),
	"cgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"igst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"cess_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'sales.invoice' NOT NULL,
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
	"customer_id" uuid NOT NULL,
	"so_id" uuid,
	"delivery_id" uuid,
	"billing_address_id" uuid,
	"shipping_address_id" uuid,
	"due_date" date,
	"place_of_supply" varchar(2),
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"supply_type" varchar(10) DEFAULT 'B2B' NOT NULL,
	"is_export" boolean DEFAULT false NOT NULL,
	"export_type" varchar(20),
	"einvoice_applicable" boolean DEFAULT false NOT NULL,
	"einvoice_status" varchar(20) DEFAULT 'not_applicable' NOT NULL,
	"eway_bill_no" varchar(15),
	"tcs_amount_paise" bigint DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	"payment_status" varchar(20) DEFAULT 'unpaid' NOT NULL,
	"received_amount_paise" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "sales_invoices_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"so_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"quotation_line_id" uuid,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(10),
	"cgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"igst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"cess_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint NOT NULL,
	"delivered_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"billed_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"reserved_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"warehouse_id" uuid,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'sales.so' NOT NULL,
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
	"customer_id" uuid NOT NULL,
	"quotation_id" uuid,
	"billing_address_id" uuid,
	"shipping_address_id" uuid,
	"customer_po_number" varchar(50),
	"customer_po_date" date,
	"expected_delivery_date" date,
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"place_of_supply" varchar(2),
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"delivery_status" varchar(20) DEFAULT 'not_delivered' NOT NULL,
	"billing_status" varchar(20) DEFAULT 'not_billed' NOT NULL,
	CONSTRAINT "sales_orders_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_quotation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"rate_paise" bigint NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_paise" bigint DEFAULT 0 NOT NULL,
	"net_amount_paise" bigint NOT NULL,
	"tax_code_id" uuid,
	"hsn_sac_code" varchar(10),
	"cgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"sgst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"igst_amount_paise" bigint DEFAULT 0 NOT NULL,
	"cess_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tax_amount_paise" bigint DEFAULT 0 NOT NULL,
	"total_amount_paise" bigint NOT NULL,
	"ordered_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"line_status" varchar(20) DEFAULT 'open' NOT NULL,
	"custom_data" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'sales.quotation' NOT NULL,
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
	"customer_id" uuid NOT NULL,
	"billing_address_id" uuid,
	"shipping_address_id" uuid,
	"valid_until_date" date,
	"place_of_supply" varchar(2),
	"is_reverse_charge" boolean DEFAULT false NOT NULL,
	"fulfilment_status" varchar(20) DEFAULT 'open' NOT NULL,
	CONSTRAINT "sales_quotations_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_receipt_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"allocated_amount_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sales_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'sales.payment' NOT NULL,
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
	"customer_id" uuid NOT NULL,
	"receipt_mode" "sales_receipt_mode" DEFAULT 'bank_transfer' NOT NULL,
	"instrument_no" varchar(50),
	"instrument_date" date,
	"bank_reference" varchar(100),
	"received_amount_paise" bigint NOT NULL,
	"allocated_amount_paise" bigint DEFAULT 0 NOT NULL,
	"unallocated_amount_paise" bigint DEFAULT 0 NOT NULL,
	"tcs_amount_paise" bigint DEFAULT 0 NOT NULL,
	"journal_entry_id" uuid,
	CONSTRAINT "sales_receipts_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "formula_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formula_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"qty_per_batch" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"scrap_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"substitute_group" varchar(30)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "formula_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formula_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"work_center_id" uuid,
	"operation_name" varchar(255) NOT NULL,
	"setup_mins" integer DEFAULT 0 NOT NULL,
	"run_mins_per_unit" numeric(12, 4) DEFAULT '0' NOT NULL,
	"overhead_rate_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "formula_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formula_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"qty_per_batch" numeric(18, 4) NOT NULL,
	"uom" varchar(20) NOT NULL,
	"output_type" "formula_output_type" DEFAULT 'primary' NOT NULL,
	"cost_allocation_basis" "cost_allocation_basis" DEFAULT 'by_value' NOT NULL,
	"cost_allocation_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"market_rate_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_formulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"version" varchar(10) DEFAULT '1' NOT NULL,
	"name" varchar(255) NOT NULL,
	"manufacturing_type" "manufacturing_type" NOT NULL,
	"batch_size" numeric(18, 4) NOT NULL,
	"base_uom" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"remarks" text,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_formulas_code_version_uq" UNIQUE("company_id","code","version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_order_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"material_paise" bigint DEFAULT 0 NOT NULL,
	"labour_paise" bigint DEFAULT 0 NOT NULL,
	"overhead_paise" bigint DEFAULT 0 NOT NULL,
	"variance_paise" bigint DEFAULT 0 NOT NULL,
	"total_paise" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_order_costs_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_order_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"formula_input_id" uuid,
	"item_id" uuid NOT NULL,
	"uom" varchar(20) NOT NULL,
	"required_qty" numeric(18, 4) NOT NULL,
	"issued_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"warehouse_id" uuid,
	"batch_id" uuid,
	"issued_value_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_order_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"work_center_id" uuid,
	"operation_name" varchar(255) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"planned_mins" numeric(12, 2) DEFAULT '0' NOT NULL,
	"actual_mins" numeric(12, 2) DEFAULT '0' NOT NULL,
	"actual_labour_paise" bigint DEFAULT 0 NOT NULL,
	"actual_overhead_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_order_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"formula_output_id" uuid,
	"item_id" uuid NOT NULL,
	"uom" varchar(20) NOT NULL,
	"output_type" "formula_output_type" DEFAULT 'primary' NOT NULL,
	"expected_qty" numeric(18, 4) NOT NULL,
	"produced_qty" numeric(18, 4) DEFAULT '0' NOT NULL,
	"warehouse_id" uuid,
	"batch_id" uuid,
	"cost_allocated_paise" bigint DEFAULT 0 NOT NULL,
	"valuation_rate_paise" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "production_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'manufacturing.order' NOT NULL,
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
	"formula_id" uuid NOT NULL,
	"manufacturing_type" "manufacturing_type" NOT NULL,
	"planned_qty" numeric(18, 4) NOT NULL,
	"batch_size" numeric(18, 4) NOT NULL,
	"scale_factor" numeric(18, 6) NOT NULL,
	"target_warehouse_id" uuid,
	"source_warehouse_id" uuid,
	"expected_start_date" date,
	"expected_end_date" date,
	"actual_start_date" date,
	"actual_end_date" date,
	"wip_value_paise" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "production_orders_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"code" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"capacity_mins_per_day" integer DEFAULT 0 NOT NULL,
	"labour_rate_paise" bigint DEFAULT 0 NOT NULL,
	"overhead_rate_paise" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_centers_company_code_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"performed_by" uuid NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"remarks" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"document_id" uuid NOT NULL,
	"document_number" varchar(50),
	"amount_paise" bigint DEFAULT 0 NOT NULL,
	"workflow_id" uuid NOT NULL,
	"current_level" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_workflow_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"name" varchar(255),
	"threshold_min_paise" bigint DEFAULT 0 NOT NULL,
	"threshold_max_paise" bigint,
	"approver_type" "approver_type" NOT NULL,
	"approver_role_id" uuid,
	"approver_user_id" uuid,
	"required_approvals" integer DEFAULT 1 NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	CONSTRAINT "approval_workflow_levels_uq" UNIQUE("workflow_id","level")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "approval_workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_workflows_company_type_uq" UNIQUE("company_id","document_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_license" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"edition" varchar(50),
	"max_users" integer DEFAULT -1 NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"license_key" text,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_license_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"module" varchar(30) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"activated_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_modules_company_module_uq" UNIQUE("company_id","module")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plants" ADD CONSTRAINT "plants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "plants" ADD CONSTRAINT "plants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "roles" ADD CONSTRAINT "roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_approval_limits" ADD CONSTRAINT "user_approval_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_approval_limits" ADD CONSTRAINT "user_approval_limits_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_approval_limits" ADD CONSTRAINT "user_approval_limits_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_plant_access" ADD CONSTRAINT "user_plant_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_plant_access" ADD CONSTRAINT "user_plant_access_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_plant_access" ADD CONSTRAINT "user_plant_access_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_warehouse_access" ADD CONSTRAINT "user_warehouse_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_warehouse_access" ADD CONSTRAINT "user_warehouse_access_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_warehouse_access" ADD CONSTRAINT "user_warehouse_access_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_audit_log" ADD CONSTRAINT "document_audit_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_number_series" ADD CONSTRAINT "document_number_series_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_number_series" ADD CONSTRAINT "document_number_series_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_type_config" ADD CONSTRAINT "document_type_config_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_type_config" ADD CONSTRAINT "document_type_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_chart_of_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_account_config" ADD CONSTRAINT "company_account_config_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_account_config" ADD CONSTRAINT "company_account_config_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_account_config" ADD CONSTRAINT "company_account_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_tax_lines" ADD CONSTRAINT "document_tax_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_tax_lines" ADD CONSTRAINT "document_tax_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_invoice_records" ADD CONSTRAINT "e_invoice_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_invoice_records" ADD CONSTRAINT "e_invoice_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "e_invoice_records" ADD CONSTRAINT "e_invoice_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tax_codes" ADD CONSTRAINT "tax_codes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_batches" ADD CONSTRAINT "item_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_serials" ADD CONSTRAINT "item_serials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_serials" ADD CONSTRAINT "item_serials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_serials" ADD CONSTRAINT "item_serials_current_warehouse_id_warehouses_id_fk" FOREIGN KEY ("current_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_serials" ADD CONSTRAINT "item_serials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_item_group_id_item_groups_id_fk" FOREIGN KEY ("item_group_id") REFERENCES "public"."item_groups"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_primary_uom_unit_of_measures_code_fk" FOREIGN KEY ("primary_uom") REFERENCES "public"."unit_of_measures"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_secondary_uom_unit_of_measures_code_fk" FOREIGN KEY ("secondary_uom") REFERENCES "public"."unit_of_measures"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "items" ADD CONSTRAINT "items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_stock_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."stock_adjustments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_serial_id_item_serials_id_fk" FOREIGN KEY ("serial_id") REFERENCES "public"."item_serials"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uom_conversions" ADD CONSTRAINT "uom_conversions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uom_conversions" ADD CONSTRAINT "uom_conversions_from_uom_unit_of_measures_code_fk" FOREIGN KEY ("from_uom") REFERENCES "public"."unit_of_measures"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "uom_conversions" ADD CONSTRAINT "uom_conversions_to_uom_unit_of_measures_code_fk" FOREIGN KEY ("to_uom") REFERENCES "public"."unit_of_measures"("code") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_note_lines" ADD CONSTRAINT "goods_receipt_note_lines_grn_id_goods_receipt_notes_id_fk" FOREIGN KEY ("grn_id") REFERENCES "public"."goods_receipt_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_note_lines" ADD CONSTRAINT "goods_receipt_note_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_note_lines" ADD CONSTRAINT "goods_receipt_note_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_note_lines" ADD CONSTRAINT "goods_receipt_note_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_note_lines" ADD CONSTRAINT "goods_receipt_note_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_note_lines" ADD CONSTRAINT "goods_receipt_note_lines_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goods_receipt_notes" ADD CONSTRAINT "goods_receipt_notes_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_po_line_id_purchase_order_lines_id_fk" FOREIGN KEY ("po_line_id") REFERENCES "public"."purchase_order_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_grn_line_id_goods_receipt_note_lines_id_fk" FOREIGN KEY ("grn_line_id") REFERENCES "public"."goods_receipt_note_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_po_id_purchase_orders_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_requisition_line_id_purchase_requisition_lines_id_fk" FOREIGN KEY ("requisition_line_id") REFERENCES "public"."purchase_requisition_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_delivery_warehouse_id_warehouses_id_fk" FOREIGN KEY ("delivery_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payment_allocations" ADD CONSTRAINT "purchase_payment_allocations_payment_id_purchase_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."purchase_payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payment_allocations" ADD CONSTRAINT "purchase_payment_allocations_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_requisition_id_purchase_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."purchase_requisitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisition_lines" ADD CONSTRAINT "purchase_requisition_lines_suggested_supplier_id_suppliers_id_fk" FOREIGN KEY ("suggested_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_requisitions" ADD CONSTRAINT "purchase_requisitions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_delivery_id_delivery_notes_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_so_line_id_sales_order_lines_id_fk" FOREIGN KEY ("so_line_id") REFERENCES "public"."sales_order_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_note_lines" ADD CONSTRAINT "delivery_note_lines_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_so_id_sales_orders_id_fk" FOREIGN KEY ("so_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_shipping_address_id_customer_addresses_id_fk" FOREIGN KEY ("shipping_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery_notes" ADD CONSTRAINT "delivery_notes_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_so_line_id_sales_order_lines_id_fk" FOREIGN KEY ("so_line_id") REFERENCES "public"."sales_order_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_delivery_line_id_delivery_note_lines_id_fk" FOREIGN KEY ("delivery_line_id") REFERENCES "public"."delivery_note_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoice_lines" ADD CONSTRAINT "sales_invoice_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_so_id_sales_orders_id_fk" FOREIGN KEY ("so_id") REFERENCES "public"."sales_orders"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_delivery_id_delivery_notes_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery_notes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_billing_address_id_customer_addresses_id_fk" FOREIGN KEY ("billing_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_shipping_address_id_customer_addresses_id_fk" FOREIGN KEY ("shipping_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_invoices" ADD CONSTRAINT "sales_invoices_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_so_id_sales_orders_id_fk" FOREIGN KEY ("so_id") REFERENCES "public"."sales_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_quotation_line_id_sales_quotation_lines_id_fk" FOREIGN KEY ("quotation_line_id") REFERENCES "public"."sales_quotation_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_sales_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."sales_quotations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_billing_address_id_customer_addresses_id_fk" FOREIGN KEY ("billing_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_shipping_address_id_customer_addresses_id_fk" FOREIGN KEY ("shipping_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_quotation_id_sales_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."sales_quotations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotation_lines" ADD CONSTRAINT "sales_quotation_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_billing_address_id_customer_addresses_id_fk" FOREIGN KEY ("billing_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_quotations" ADD CONSTRAINT "sales_quotations_shipping_address_id_customer_addresses_id_fk" FOREIGN KEY ("shipping_address_id") REFERENCES "public"."customer_addresses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipt_allocations" ADD CONSTRAINT "sales_receipt_allocations_receipt_id_sales_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."sales_receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipt_allocations" ADD CONSTRAINT "sales_receipt_allocations_invoice_id_sales_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."sales_invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formula_inputs" ADD CONSTRAINT "formula_inputs_formula_id_production_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."production_formulas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formula_inputs" ADD CONSTRAINT "formula_inputs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formula_operations" ADD CONSTRAINT "formula_operations_formula_id_production_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."production_formulas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formula_operations" ADD CONSTRAINT "formula_operations_work_center_id_work_centers_id_fk" FOREIGN KEY ("work_center_id") REFERENCES "public"."work_centers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formula_outputs" ADD CONSTRAINT "formula_outputs_formula_id_production_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."production_formulas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formula_outputs" ADD CONSTRAINT "formula_outputs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_formulas" ADD CONSTRAINT "production_formulas_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_costs" ADD CONSTRAINT "production_order_costs_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_formula_input_id_formula_inputs_id_fk" FOREIGN KEY ("formula_input_id") REFERENCES "public"."formula_inputs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_materials" ADD CONSTRAINT "production_order_materials_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_operations" ADD CONSTRAINT "production_order_operations_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_operations" ADD CONSTRAINT "production_order_operations_work_center_id_work_centers_id_fk" FOREIGN KEY ("work_center_id") REFERENCES "public"."work_centers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_outputs" ADD CONSTRAINT "production_order_outputs_order_id_production_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."production_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_outputs" ADD CONSTRAINT "production_order_outputs_formula_output_id_formula_outputs_id_fk" FOREIGN KEY ("formula_output_id") REFERENCES "public"."formula_outputs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_outputs" ADD CONSTRAINT "production_order_outputs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_outputs" ADD CONSTRAINT "production_order_outputs_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_order_outputs" ADD CONSTRAINT "production_order_outputs_batch_id_item_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."item_batches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_formula_id_production_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."production_formulas"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_target_warehouse_id_warehouses_id_fk" FOREIGN KEY ("target_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_source_warehouse_id_warehouses_id_fk" FOREIGN KEY ("source_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_centers" ADD CONSTRAINT "work_centers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_request_id_approval_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_workflow_levels" ADD CONSTRAINT "approval_workflow_levels_workflow_id_approval_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."approval_workflows"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_workflow_levels" ADD CONSTRAINT "approval_workflow_levels_approver_role_id_roles_id_fk" FOREIGN KEY ("approver_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_workflow_levels" ADD CONSTRAINT "approval_workflow_levels_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_workflows" ADD CONSTRAINT "approval_workflows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_license" ADD CONSTRAINT "company_license_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_modules" ADD CONSTRAINT "company_modules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_refresh_token_idx" ON "sessions" ("refresh_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plants_company_id_idx" ON "plants" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plants_code_company_idx" ON "plants" ("company_id","code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouses_plant_id_idx" ON "warehouses" ("plant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "warehouses_company_id_idx" ON "warehouses" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "permissions_module_idx" ON "permissions" ("module");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "roles_company_id_idx" ON "roles" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_approval_limits_user_doc_idx" ON "user_approval_limits" ("user_id","document_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_permissions_user_id_idx" ON "user_permissions" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_permissions_user_company_idx" ON "user_permissions" ("user_id","company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_plant_access_user_id_idx" ON "user_plant_access" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_user_id_idx" ON "user_roles" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_company_id_idx" ON "user_roles" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_roles_user_company_idx" ON "user_roles" ("user_id","company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_audit_log_doc_idx" ON "document_audit_log" ("document_type","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_audit_log_company_idx" ON "document_audit_log" ("company_id","performed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_number_series_company_type_idx" ON "document_number_series" ("company_id","document_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_type_config_company_idx" ON "document_type_config" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chart_of_accounts_company_idx" ON "chart_of_accounts" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chart_of_accounts_parent_idx" ON "chart_of_accounts" ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_account_config_company_idx" ON "company_account_config" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_company_date_idx" ON "journal_entries" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_doc_idx" ON "journal_entries" ("document_type","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entries_fy_period_idx" ON "journal_entries" ("company_id","fiscal_year","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_entry_idx" ON "journal_entry_lines" ("journal_entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_account_idx" ON "journal_entry_lines" ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journal_entry_lines_party_idx" ON "journal_entry_lines" ("party_type","party_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_tax_lines_doc_idx" ON "document_tax_lines" ("document_type","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_tax_lines_company_fy_idx" ON "document_tax_lines" ("company_id","fiscal_year");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_tax_lines_hsn_idx" ON "document_tax_lines" ("hsn_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_invoice_records_doc_idx" ON "e_invoice_records" ("document_type","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_invoice_records_irn_idx" ON "e_invoice_records" ("irn");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "e_invoice_records_status_idx" ON "e_invoice_records" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hsn_sac_codes_code_idx" ON "hsn_sac_codes" ("code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tax_codes_company_idx" ON "tax_codes" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_batches_item_idx" ON "item_batches" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_batches_expiry_idx" ON "item_batches" ("expiry_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_groups_company_idx" ON "item_groups" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_serials_item_idx" ON "item_serials" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_serials_status_idx" ON "item_serials" ("company_id","current_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_company_idx" ON "items" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_name_idx" ON "items" ("company_id","item_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_adj_lines_adj_idx" ON "stock_adjustment_lines" ("adjustment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_adj_company_idx" ON "stock_adjustments" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_adj_date_idx" ON "stock_adjustments" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_balances_company_item_idx" ON "stock_balances" ("company_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_balances_wh_item_idx" ON "stock_balances" ("warehouse_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sle_item_date_idx" ON "stock_ledger_entries" ("company_id","item_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sle_wh_item_idx" ON "stock_ledger_entries" ("company_id","warehouse_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sle_doc_idx" ON "stock_ledger_entries" ("document_type","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sle_batch_idx" ON "stock_ledger_entries" ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sle_serial_idx" ON "stock_ledger_entries" ("serial_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sle_fy_period_idx" ON "stock_ledger_entries" ("company_id","fiscal_year","period");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_doc_idx" ON "stock_reservations" ("document_type","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_wh_item_idx" ON "stock_reservations" ("warehouse_id","item_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_reservations_company_item_idx" ON "stock_reservations" ("company_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_tr_lines_tr_idx" ON "stock_transfer_lines" ("transfer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_tr_company_idx" ON "stock_transfers" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "uom_conversions_item_idx" ON "uom_conversions" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_lines_grn_idx" ON "goods_receipt_note_lines" ("grn_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_lines_item_idx" ON "goods_receipt_note_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_lines_po_line_idx" ON "goods_receipt_note_lines" ("po_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_lines_batch_idx" ON "goods_receipt_note_lines" ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_company_date_idx" ON "goods_receipt_notes" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_supplier_idx" ON "goods_receipt_notes" ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "grn_po_idx" ON "goods_receipt_notes" ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoice_lines_invoice_idx" ON "purchase_invoice_lines" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoice_lines_item_idx" ON "purchase_invoice_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoice_lines_grn_line_idx" ON "purchase_invoice_lines" ("grn_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_company_date_idx" ON "purchase_invoices" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_supplier_idx" ON "purchase_invoices" ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_supplier_inv_no_idx" ON "purchase_invoices" ("supplier_id","supplier_invoice_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_invoices_po_idx" ON "purchase_invoices" ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_lines_po_idx" ON "purchase_order_lines" ("po_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_lines_item_idx" ON "purchase_order_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_lines_req_line_idx" ON "purchase_order_lines" ("requisition_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_company_date_idx" ON "purchase_orders" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_supplier_idx" ON "purchase_orders" ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_orders_status_idx" ON "purchase_orders" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_payment_alloc_payment_idx" ON "purchase_payment_allocations" ("payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_payment_alloc_invoice_idx" ON "purchase_payment_allocations" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_payments_company_date_idx" ON "purchase_payments" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_payments_supplier_idx" ON "purchase_payments" ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_lines_requisition_idx" ON "purchase_requisition_lines" ("requisition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pr_lines_item_idx" ON "purchase_requisition_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_requisitions_company_date_idx" ON "purchase_requisitions" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_requisitions_status_idx" ON "purchase_requisitions" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_company_idx" ON "suppliers" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_gstin_idx" ON "suppliers" ("gstin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_name_idx" ON "suppliers" ("company_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_addresses_customer_idx" ON "customer_addresses" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_company_idx" ON "customers" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_gstin_idx" ON "customers" ("gstin");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customers_name_idx" ON "customers" ("company_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dn_lines_delivery_idx" ON "delivery_note_lines" ("delivery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dn_lines_item_idx" ON "delivery_note_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dn_lines_so_line_idx" ON "delivery_note_lines" ("so_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dn_lines_batch_idx" ON "delivery_note_lines" ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_notes_company_date_idx" ON "delivery_notes" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_notes_customer_idx" ON "delivery_notes" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delivery_notes_so_idx" ON "delivery_notes" ("so_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoice_lines_invoice_idx" ON "sales_invoice_lines" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoice_lines_item_idx" ON "sales_invoice_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoice_lines_delivery_line_idx" ON "sales_invoice_lines" ("delivery_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_company_date_idx" ON "sales_invoices" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_customer_idx" ON "sales_invoices" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_so_idx" ON "sales_invoices" ("so_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_invoices_delivery_idx" ON "sales_invoices" ("delivery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "so_lines_so_idx" ON "sales_order_lines" ("so_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "so_lines_item_idx" ON "sales_order_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "so_lines_quotation_line_idx" ON "sales_order_lines" ("quotation_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_company_date_idx" ON "sales_orders" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_customer_idx" ON "sales_orders" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_orders_status_idx" ON "sales_orders" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sq_lines_quotation_idx" ON "sales_quotation_lines" ("quotation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sq_lines_item_idx" ON "sales_quotation_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_quotations_company_date_idx" ON "sales_quotations" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_quotations_customer_idx" ON "sales_quotations" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_quotations_status_idx" ON "sales_quotations" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipt_alloc_receipt_idx" ON "sales_receipt_allocations" ("receipt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipt_alloc_invoice_idx" ON "sales_receipt_allocations" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipts_company_date_idx" ON "sales_receipts" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_receipts_customer_idx" ON "sales_receipts" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "formula_inputs_formula_idx" ON "formula_inputs" ("formula_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "formula_operations_formula_idx" ON "formula_operations" ("formula_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "formula_outputs_formula_idx" ON "formula_outputs" ("formula_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_formulas_company_idx" ON "production_formulas" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_formulas_type_idx" ON "production_formulas" ("company_id","manufacturing_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_costs_order_idx" ON "production_order_costs" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_materials_order_idx" ON "production_order_materials" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_materials_item_idx" ON "production_order_materials" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_operations_order_idx" ON "production_order_operations" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_outputs_order_idx" ON "production_order_outputs" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "po_outputs_item_idx" ON "production_order_outputs" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_orders_company_date_idx" ON "production_orders" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_orders_formula_idx" ON "production_orders" ("formula_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "production_orders_status_idx" ON "production_orders" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_centers_company_idx" ON "work_centers" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_actions_request_idx" ON "approval_actions" ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_company_status_idx" ON "approval_requests" ("company_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_doc_idx" ON "approval_requests" ("document_type","document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_workflow_levels_workflow_idx" ON "approval_workflow_levels" ("workflow_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_workflows_company_idx" ON "approval_workflows" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_license_company_idx" ON "company_license" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "company_modules_company_idx" ON "company_modules" ("company_id");