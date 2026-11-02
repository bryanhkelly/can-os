CREATE TABLE "network_agreements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "denomination_organization_id" uuid NOT NULL,
  "agreement_reference" text NOT NULL,
  "evidence_document_id" uuid NOT NULL,
  "valid_from" timestamp with time zone NOT NULL,
  "valid_through" timestamp with time zone NOT NULL,
  "verified_by_person_id" uuid NOT NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "network_agreements" ADD CONSTRAINT "network_agreements_denomination_organization_id_organizations_id_fk" FOREIGN KEY ("denomination_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "network_agreements" ADD CONSTRAINT "network_agreements_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "network_agreements" ADD CONSTRAINT "network_agreements_verified_by_person_id_people_id_fk" FOREIGN KEY ("verified_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "network_agreements_reference_uq" ON "network_agreements" USING btree ("denomination_organization_id","agreement_reference");
--> statement-breakpoint
CREATE INDEX "network_agreements_term_idx" ON "network_agreements" USING btree ("denomination_organization_id","valid_through");
