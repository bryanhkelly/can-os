CREATE TABLE "access_account_canonical_principals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"canonical_principal_id" uuid NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"verified_by_account_id" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_account_canonical_principals_not_self_verified" CHECK ("access_account_canonical_principals"."account_id" <> "access_account_canonical_principals"."verified_by_account_id"),
	CONSTRAINT "access_account_canonical_principals_revocation_after_verification" CHECK ("access_account_canonical_principals"."revoked_at" IS NULL OR "access_account_canonical_principals"."revoked_at" >= "access_account_canonical_principals"."verified_at")
);
--> statement-breakpoint
CREATE TABLE "classroom_join_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_session_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"device_key" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_session_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid,
	"title" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"facilitator_person_id" uuid NOT NULL,
	"opened_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_account_canonical_principals" ADD CONSTRAINT "access_account_canonical_principals_account_id_access_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."access_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_account_canonical_principals" ADD CONSTRAINT "access_account_canonical_principals_verified_by_account_id_access_accounts_id_fk" FOREIGN KEY ("verified_by_account_id") REFERENCES "public"."access_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_join_tokens" ADD CONSTRAINT "classroom_join_tokens_session_id_classroom_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."classroom_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_session_connections" ADD CONSTRAINT "classroom_session_connections_participant_id_classroom_session_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."classroom_session_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_session_participants" ADD CONSTRAINT "classroom_session_participants_session_id_classroom_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."classroom_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_session_participants" ADD CONSTRAINT "classroom_session_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_sessions" ADD CONSTRAINT "classroom_sessions_facilitator_person_id_people_id_fk" FOREIGN KEY ("facilitator_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_account_canonical_principals_active_account_uq" ON "access_account_canonical_principals" USING btree ("account_id") WHERE "access_account_canonical_principals"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "access_account_canonical_principals_principal_idx" ON "access_account_canonical_principals" USING btree ("canonical_principal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_join_token_code_uq" ON "classroom_join_tokens" USING btree ("code");--> statement-breakpoint
CREATE INDEX "classroom_join_token_session_idx" ON "classroom_join_tokens" USING btree ("session_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_connection_idempotency_uq" ON "classroom_session_connections" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "classroom_connection_participant_idx" ON "classroom_session_connections" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "classroom_session_participant_uq" ON "classroom_session_participants" USING btree ("session_id","person_id");--> statement-breakpoint
CREATE INDEX "classroom_session_participant_person_idx" ON "classroom_session_participants" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "classroom_session_site_idx" ON "classroom_sessions" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "classroom_session_status_idx" ON "classroom_sessions" USING btree ("status");