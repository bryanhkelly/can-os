CREATE TABLE "demo_school_tenants" (
	"domain" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"admin_account_id" uuid NOT NULL,
	"admin_person_id" uuid NOT NULL,
	"admin_grant_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "demo_school_tenants" ADD CONSTRAINT "demo_school_tenants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_school_tenants" ADD CONSTRAINT "demo_school_tenants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_school_tenants" ADD CONSTRAINT "demo_school_tenants_admin_account_id_access_accounts_id_fk" FOREIGN KEY ("admin_account_id") REFERENCES "public"."access_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_school_tenants" ADD CONSTRAINT "demo_school_tenants_admin_person_id_people_id_fk" FOREIGN KEY ("admin_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_school_tenants" ADD CONSTRAINT "demo_school_tenants_admin_grant_id_account_person_grants_id_fk" FOREIGN KEY ("admin_grant_id") REFERENCES "public"."account_person_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "demo_school_tenant_org_uq" ON "demo_school_tenants" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_school_tenant_site_uq" ON "demo_school_tenants" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_school_tenant_account_uq" ON "demo_school_tenants" USING btree ("admin_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_school_tenant_person_uq" ON "demo_school_tenants" USING btree ("admin_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "demo_school_tenant_grant_uq" ON "demo_school_tenants" USING btree ("admin_grant_id");