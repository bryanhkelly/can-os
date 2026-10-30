-- Public Site -> verified first-time family. Pending request contains adult
-- email only. A single-use email token is required before any Person, guardian
-- grant or canonical school Application is created.
CREATE TABLE "public_family_start_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "program_id" uuid NOT NULL REFERENCES "public"."programs"("id") ON DELETE RESTRICT,
  "email_normalized" text NOT NULL,
  "adult_first_name" text NOT NULL,
  "adult_last_name" text NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "public_family_starts_token_uq" ON "public_family_start_requests" ("token_hash");
--> statement-breakpoint
CREATE INDEX "public_family_starts_expiry_idx" ON "public_family_start_requests" ("expires_at");
--> statement-breakpoint
CREATE INDEX "public_family_starts_school_idx" ON "public_family_start_requests" ("program_id", "created_at");
