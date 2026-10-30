CREATE TABLE "access_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_normalized" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"active_grant_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_person_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_challenges" ADD CONSTRAINT "access_challenges_account_id_access_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."access_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_account_id_access_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."access_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_sessions" ADD CONSTRAINT "access_sessions_active_grant_id_account_person_grants_id_fk" FOREIGN KEY ("active_grant_id") REFERENCES "public"."account_person_grants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_person_grants" ADD CONSTRAINT "account_person_grants_account_id_access_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."access_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_person_grants" ADD CONSTRAINT "account_person_grants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_accounts_email_uq" ON "access_accounts" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "access_challenges_hash_uq" ON "access_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "access_challenges_account_idx" ON "access_challenges" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "access_sessions_secret_uq" ON "access_sessions" USING btree ("secret_hash");--> statement-breakpoint
CREATE INDEX "access_sessions_account_idx" ON "access_sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_person_grants_account_idx" ON "account_person_grants" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_person_grants_person_idx" ON "account_person_grants" USING btree ("person_id");