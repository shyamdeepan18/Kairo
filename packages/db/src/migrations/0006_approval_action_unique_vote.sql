-- Phase 5 (approval integrity): one vote per approver per level.
-- Dedup first — existing data may contain a same-user double-vote at a level
-- (the N-of-M bypass this constraint closes); keep the earliest action row per
-- (request_id, level, performed_by), drop the rest, then add the unique index.
DELETE FROM "approval_actions" a
USING "approval_actions" b
WHERE a."request_id" = b."request_id"
  AND a."level" = b."level"
  AND a."performed_by" = b."performed_by"
  AND (a."performed_at" > b."performed_at"
       OR (a."performed_at" = b."performed_at" AND a."id" > b."id"));
--> statement-breakpoint
ALTER TABLE "approval_actions" ADD CONSTRAINT "approval_actions_request_level_user_uq" UNIQUE("request_id","level","performed_by");
