CREATE TABLE "launch_studio_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"grant_id" uuid NOT NULL,
	"audience" text NOT NULL,
	"context" text NOT NULL,
	"value" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "launch_studio_drafts" ADD CONSTRAINT "launch_studio_drafts_account_id_access_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."access_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "launch_studio_drafts" ADD CONSTRAINT "launch_studio_drafts_grant_id_account_person_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."account_person_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "launch_studio_drafts_owner_uq" ON "launch_studio_drafts" USING btree ("account_id","grant_id","audience","context");