DO $$ BEGIN
 CREATE TYPE "public"."attendance_status" AS ENUM('present', 'absent', 'half_day', 'leave', 'holiday', 'week_off');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."employee_gender" AS ENUM('male', 'female', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."leave_request_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."asset_status" AS ENUM('active', 'disposed', 'written_off');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."depreciation_method" AS ENUM('slm', 'wdv');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"bank_name" varchar(255) NOT NULL,
	"account_number" varchar(30) NOT NULL,
	"ifsc_code" varchar(11),
	"branch" varchar(255),
	"account_type" varchar(20) DEFAULT 'current' NOT NULL,
	"coa_account_id" uuid NOT NULL,
	"opening_balance_paise" bigint DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_company_accno_uq" UNIQUE("company_id","account_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"check_in_time" timestamp with time zone,
	"check_out_time" timestamp with time zone,
	"worked_hours" numeric(5, 2),
	"remarks" text,
	"marked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_logs_emp_date_uq" UNIQUE("employee_id","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"head_user_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_company_code_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"fiscal_year" varchar(5) NOT NULL,
	"opening_balance" numeric(5, 2) DEFAULT '0' NOT NULL,
	"credited" numeric(5, 2) DEFAULT '0' NOT NULL,
	"used" numeric(5, 2) DEFAULT '0' NOT NULL,
	"carried_forward" numeric(5, 2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(5, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "leave_balances_emp_type_fy_uq" UNIQUE("employee_id","leave_type_id","fiscal_year")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"number_of_days" numeric(5, 2) NOT NULL,
	"reason" text,
	"status" "leave_request_status" DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejected_by" uuid,
	"rejected_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"annual_quota" integer DEFAULT 0 NOT NULL,
	"is_carry_forward" boolean DEFAULT false NOT NULL,
	"max_carry_forward" integer DEFAULT 0 NOT NULL,
	"is_paid_leave" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_company_code_uq" UNIQUE("company_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "asset_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"depreciation_method" "depreciation_method" DEFAULT 'slm' NOT NULL,
	"annual_rate_percent" numeric(5, 2) NOT NULL,
	"useful_life_months" integer,
	"asset_coa_account_id" uuid NOT NULL,
	"accum_depn_coa_account_id" uuid NOT NULL,
	"depn_expense_coa_account_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_categories_company_name_uq" UNIQUE("company_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "depreciation_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"fiscal_year" varchar(5),
	"depreciation_amount_paise" bigint NOT NULL,
	"book_value_after_paise" bigint NOT NULL,
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"journal_entry_id" uuid,
	"posted_at" timestamp with time zone,
	"posted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fixed_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid,
	"asset_code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category_id" uuid NOT NULL,
	"purchase_date" date NOT NULL,
	"purchase_invoice_id" uuid,
	"original_cost_paise" bigint NOT NULL,
	"salvage_value_paise" bigint DEFAULT 0 NOT NULL,
	"depreciation_method" "depreciation_method" NOT NULL,
	"annual_rate_percent" numeric(5, 2) NOT NULL,
	"useful_life_months" integer,
	"accumulated_depreciation_paise" bigint DEFAULT 0 NOT NULL,
	"current_book_value_paise" bigint NOT NULL,
	"depreciation_start_date" date NOT NULL,
	"last_depreciation_date" date,
	"status" "asset_status" DEFAULT 'active' NOT NULL,
	"disposal_date" date,
	"disposal_amount_paise" bigint,
	"disposal_journal_entry_id" uuid,
	"disposal_reason" text,
	"location" varchar(255),
	"serial_number" varchar(100),
	"warranty_expiry_date" date,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixed_assets_company_code_uq" UNIQUE("company_id","asset_code")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "department_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "gender" "employee_gender";--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "marital_status" varchar(20);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "blood_group" varchar(5);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "current_address" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "permanent_address" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact_name" varchar(255);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "emergency_contact_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "date_of_exit" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "exit_reason" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_account_name" varchar(255);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "bank_name" varchar(255);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "aadhaar_number" varchar(12);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "uan_number" varchar(22);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "esi_number" varchar(17);--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "pf_number" varchar(30);--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "total_working_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "days_present" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "days_absent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "leave_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "lop_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "employee_pf_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "employer_pf_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "employee_esi_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "employer_esi_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "professional_tax_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "tds_paise" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_coa_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("coa_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_marked_by_users_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_head_user_id_users_id_fk" FOREIGN KEY ("head_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "departments" ADD CONSTRAINT "departments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_asset_coa_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("asset_coa_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_accum_depn_coa_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("accum_depn_coa_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_depn_expense_coa_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("depn_expense_coa_account_id") REFERENCES "public"."chart_of_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "asset_categories" ADD CONSTRAINT "asset_categories_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_asset_id_fixed_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."fixed_assets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "depreciation_schedules" ADD CONSTRAINT "depreciation_schedules_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_category_id_asset_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."asset_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_purchase_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("purchase_invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_disposal_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("disposal_journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_accounts_company_idx" ON "bank_accounts" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_logs_company_date_idx" ON "attendance_logs" ("company_id","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attendance_logs_employee_idx" ON "attendance_logs" ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "departments_company_idx" ON "departments" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_balances_employee_idx" ON "leave_balances" ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_company_idx" ON "leave_requests" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_employee_idx" ON "leave_requests" ("employee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_date_range_idx" ON "leave_requests" ("from_date","to_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_requests_status_idx" ON "leave_requests" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leave_types_company_idx" ON "leave_types" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "asset_categories_company_idx" ON "asset_categories" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "depreciation_schedules_asset_idx" ON "depreciation_schedules" ("asset_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "depreciation_schedules_status_idx" ON "depreciation_schedules" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "depreciation_schedules_period_idx" ON "depreciation_schedules" ("period_start","period_end");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixed_assets_company_idx" ON "fixed_assets" ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixed_assets_category_idx" ON "fixed_assets" ("category_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixed_assets_status_idx" ON "fixed_assets" ("company_id","status");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_department_idx" ON "employees" ("department_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employees_user_idx" ON "employees" ("user_id");