ALTER TABLE "leads" ADD COLUMN "seller_assigned_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing rows get DEFAULT now() on add, which would make every pre-existing
-- lead look "assigned today" the moment this migration runs. Backfill them to
-- their creation time instead — the closest approximation we have for leads
-- that predate this column (their true last-reassignment time isn't tracked).
UPDATE "leads" SET "seller_assigned_at" = "created_at";