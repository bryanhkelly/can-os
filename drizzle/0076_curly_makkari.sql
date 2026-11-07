CREATE TABLE "school_setup_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"school_name" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"organization_id" uuid,
	"site_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_setup_signups" ADD CONSTRAINT "school_setup_signups_account_id_access_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."access_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_setup_signups" ADD CONSTRAINT "school_setup_signups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_setup_signups" ADD CONSTRAINT "school_setup_signups_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "school_setup_signup_account_uq" ON "school_setup_signups" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_setup_signup_org_uq" ON "school_setup_signups" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "school_setup_signup_site_uq" ON "school_setup_signups" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "school_setup_signup_expiry_idx" ON "school_setup_signups" USING btree ("expires_at");