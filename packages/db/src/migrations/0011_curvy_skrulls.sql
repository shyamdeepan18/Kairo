CREATE TABLE IF NOT EXISTS "purchase_debit_note_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"debit_note_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"invoice_line_id" uuid,
	"return_line_id" uuid,
	"item_id" uuid NOT NULL,
	"description" text,
	"quantity" numeric(18, 4) NOT NULL,
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
CREATE TABLE IF NOT EXISTS "purchase_debit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"document_type" varchar(100) DEFAULT 'purchase.debit_note' NOT NULL,
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
	"invoice_id" uuid,
	"return_id" uuid,
	"reason" text,
	"supplier_debit_note_number" varchar(50),
	"supplier_debit_note_date" date,
	"journal_entry_id" uuid,
	CONSTRAINT "purchase_debit_notes_number_uq" UNIQUE("company_id","document_number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_note_lines" ADD CONSTRAINT "purchase_debit_note_lines_debit_note_id_purchase_debit_notes_id_fk" FOREIGN KEY ("debit_note_id") REFERENCES "public"."purchase_debit_notes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_note_lines" ADD CONSTRAINT "purchase_debit_note_lines_invoice_line_id_purchase_invoice_lines_id_fk" FOREIGN KEY ("invoice_line_id") REFERENCES "public"."purchase_invoice_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_note_lines" ADD CONSTRAINT "purchase_debit_note_lines_return_line_id_purchase_return_lines_id_fk" FOREIGN KEY ("return_line_id") REFERENCES "public"."purchase_return_lines"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_note_lines" ADD CONSTRAINT "purchase_debit_note_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_note_lines" ADD CONSTRAINT "purchase_debit_note_lines_tax_code_id_tax_codes_id_fk" FOREIGN KEY ("tax_code_id") REFERENCES "public"."tax_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_invoice_id_purchase_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."purchase_invoices"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_return_id_purchase_returns_id_fk" FOREIGN KEY ("return_id") REFERENCES "public"."purchase_returns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "purchase_debit_notes" ADD CONSTRAINT "purchase_debit_notes_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_dn_lines_dn_idx" ON "purchase_debit_note_lines" ("debit_note_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_dn_lines_item_idx" ON "purchase_debit_note_lines" ("item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_dn_lines_inv_line_idx" ON "purchase_debit_note_lines" ("invoice_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_dn_lines_ret_line_idx" ON "purchase_debit_note_lines" ("return_line_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_debit_notes_company_date_idx" ON "purchase_debit_notes" ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_debit_notes_supplier_idx" ON "purchase_debit_notes" ("supplier_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_debit_notes_invoice_idx" ON "purchase_debit_notes" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "purchase_debit_notes_return_idx" ON "purchase_debit_notes" ("return_id");