CREATE TABLE "admission_seat_pools" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE RESTRICT,
 "school_year_id" uuid NOT NULL REFERENCES "school_years"("id") ON DELETE RESTRICT,
 "capacity" integer NOT NULL CHECK ("capacity" >= 0),
 "waitlist_enabled" integer DEFAULT 0 NOT NULL CHECK ("waitlist_enabled" IN (0,1)),
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "admission_seat_pool_scope_uq" UNIQUE ("program_id","school_year_id")
);
--> statement-breakpoint
CREATE TABLE "admission_offers" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "application_id" uuid NOT NULL REFERENCES "applications"("id") ON DELETE RESTRICT,
 "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE RESTRICT,
 "school_year_id" uuid NOT NULL REFERENCES "school_years"("id") ON DELETE RESTRICT,
 "status" text DEFAULT 'draft' NOT NULL CHECK ("status" IN ('draft','issued','accepted','declined','expired','revoked')),
 "expires_at" timestamptz,
 "issued_at" timestamptz,
 "responded_at" timestamptz,
 "issued_by_person_id" uuid REFERENCES "people"("id") ON DELETE RESTRICT,
 "responded_by_person_id" uuid REFERENCES "people"("id") ON DELETE RESTRICT,
 "idempotency_key" text NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL,
 "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "admission_offer_idempotency_uq" UNIQUE ("idempotency_key")
);
--> statement-breakpoint
CREATE INDEX "admission_offer_pool_status_idx" ON "admission_offers" ("program_id","school_year_id","status");
--> statement-breakpoint
CREATE INDEX "admission_offer_application_idx" ON "admission_offers" ("application_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "admission_offer_one_active_per_application_uq" ON "admission_offers" ("application_id","school_year_id") WHERE "status" IN ('draft','issued','accepted');
