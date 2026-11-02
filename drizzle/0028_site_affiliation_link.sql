CREATE TABLE "site_affiliations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL,
  "denomination_organization_id" uuid NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "request_note" text NOT NULL,
  "requested_by_person_id" uuid NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by_person_id" uuid,
  "reviewed_at" timestamp with time zone,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_affiliations" ADD CONSTRAINT "site_affiliations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_affiliations" ADD CONSTRAINT "site_affiliations_denomination_organization_id_organizations_id_fk" FOREIGN KEY ("denomination_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_affiliations" ADD CONSTRAINT "site_affiliations_requested_by_person_id_people_id_fk" FOREIGN KEY ("requested_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "site_affiliations" ADD CONSTRAINT "site_affiliations_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "site_affiliations_pair_uq" ON "site_affiliations" USING btree ("site_id","denomination_organization_id");
--> statement-breakpoint
CREATE INDEX "site_affiliations_denom_status_idx" ON "site_affiliations" USING btree ("denomination_organization_id","status");
--> statement-breakpoint
CREATE INDEX "site_affiliations_site_idx" ON "site_affiliations" USING btree ("site_id");
