-- Trusted active tenant context (security release, phase 1)
-- Adds server-bound active company/plant to sessions and makes company_users
-- the authoritative, de-duplicated membership source for context selection.

ALTER TABLE "sessions" ADD COLUMN "active_company_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "active_plant_id" uuid;--> statement-breakpoint

-- FK constraints for the new columns. The schema keeps these as plain uuid
-- (no .references()) to avoid a circular import between auth.ts and company.ts,
-- so the constraints are declared here. ON DELETE SET NULL: deleting a company
-- or plant simply clears the stale context, forcing re-selection.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_company_id_companies_id_fk" FOREIGN KEY ("active_company_id") REFERENCES "companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_plant_id_plants_id_fk" FOREIGN KEY ("active_plant_id") REFERENCES "plants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Backfill company_users from existing user_roles memberships so that
-- context-options has an authoritative source. Idempotent (NOT EXISTS guard).
INSERT INTO "company_users" ("company_id", "user_id")
SELECT DISTINCT ur."company_id", ur."user_id"
FROM "user_roles" ur
WHERE NOT EXISTS (
  SELECT 1 FROM "company_users" cu
  WHERE cu."company_id" = ur."company_id" AND cu."user_id" = ur."user_id"
);--> statement-breakpoint

-- Remove any pre-existing duplicate memberships, keeping the earliest row,
-- so the unique index below can be created safely.
DELETE FROM "company_users" a
USING "company_users" b
WHERE a."company_id" = b."company_id"
  AND a."user_id" = b."user_id"
  AND (a."created_at" > b."created_at"
       OR (a."created_at" = b."created_at" AND a."id" > b."id"));--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "company_users_company_user_uq" ON "company_users" ("company_id","user_id");
