CREATE TABLE "support_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"goal" text NOT NULL,
	"intervention" text NOT NULL,
	"target_date" timestamp with time zone NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_referral_stage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"note" text,
	"actor_person_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"stage" text DEFAULT 'submitted' NOT NULL,
	"category" text NOT NULL,
	"requested_area" text,
	"source" text DEFAULT 'teacher' NOT NULL,
	"include_evidence" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"academic_recommendation" text DEFAULT '' NOT NULL,
	"next_review_at" timestamp with time zone,
	"reporter_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referral_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"created_by_person_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_referral_id_support_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."support_referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_plans" ADD CONSTRAINT "support_plans_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_referral_stage_events" ADD CONSTRAINT "support_referral_stage_events_referral_id_support_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."support_referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_referral_stage_events" ADD CONSTRAINT "support_referral_stage_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_referrals" ADD CONSTRAINT "support_referrals_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_referrals" ADD CONSTRAINT "support_referrals_reporter_person_id_people_id_fk" FOREIGN KEY ("reporter_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_services" ADD CONSTRAINT "support_services_referral_id_support_referrals_id_fk" FOREIGN KEY ("referral_id") REFERENCES "public"."support_referrals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_services" ADD CONSTRAINT "support_services_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_plan_referral_idx" ON "support_plans" USING btree ("referral_id");--> statement-breakpoint
CREATE INDEX "support_referral_stage_event_idx" ON "support_referral_stage_events" USING btree ("referral_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "support_referral_action_uq" ON "support_referrals" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "support_referral_stage_idx" ON "support_referrals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "support_service_referral_idx" ON "support_services" USING btree ("referral_id","status");--> statement-breakpoint

-- Backfill GF41 referral state out of actions.metadata into the typed tables.
INSERT INTO "support_referrals" ("action_id","stage","category","requested_area","source","include_evidence","notes","academic_recommendation","next_review_at","reporter_person_id")
SELECT a."id",
  COALESCE(a."metadata"->>'stage','submitted'),
  COALESCE(a."metadata"->>'category','academic'),
  a."metadata"->>'requestedArea',
  COALESCE(a."metadata"->>'source','teacher'),
  COALESCE((a."metadata"->>'includeEvidence')::boolean,false),
  COALESCE(a."metadata"->>'notes',''),
  COALESCE(a."metadata"->>'academicRecommendation',''),
  NULLIF(a."metadata"->>'nextReview','')::timestamptz,
  NULLIF(a."metadata"->>'reporterPersonId','')::uuid
FROM "actions" a
WHERE a."type"='support_referral'
ON CONFLICT ("action_id") DO NOTHING;--> statement-breakpoint
INSERT INTO "support_plans" ("referral_id","goal","intervention","target_date")
SELECT sr."id", p->>'goal', p->>'intervention', NULLIF(p->>'targetDate','')::timestamptz
FROM "actions" a
JOIN "support_referrals" sr ON sr."action_id" = a."id",
LATERAL (SELECT a."metadata"->'plan' AS p) x
WHERE a."type"='support_referral' AND jsonb_typeof(a."metadata"->'plan')='object'
  AND NULLIF(p->>'targetDate','') IS NOT NULL;--> statement-breakpoint
INSERT INTO "support_services" ("id","referral_id","kind","scheduled_at","status","outcome")
SELECT (s->>'id')::uuid, sr."id", s->>'kind', NULLIF(s->>'scheduledAt','')::timestamptz,
  COALESCE(s->>'status','scheduled'), COALESCE(s->>'outcome','')
FROM "actions" a
JOIN "support_referrals" sr ON sr."action_id" = a."id",
LATERAL jsonb_array_elements(a."metadata"->'services') s
WHERE a."type"='support_referral' AND jsonb_typeof(a."metadata"->'services')='array'
  AND NULLIF(s->>'id','') IS NOT NULL AND NULLIF(s->>'scheduledAt','') IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "support_referral_stage_events" ("referral_id","stage","note","actor_person_id","occurred_at")
SELECT sr."id", h->>'stage', h->>'note', NULLIF(h->>'actor','')::uuid,
  COALESCE(NULLIF(h->>'at','')::timestamptz, now())
FROM "actions" a
JOIN "support_referrals" sr ON sr."action_id" = a."id",
LATERAL jsonb_array_elements(a."metadata"->'history') h
WHERE a."type"='support_referral' AND jsonb_typeof(a."metadata"->'history')='array';--> statement-breakpoint

-- Audit and domain event history are append-only (rule 11): reject edits at the DB level.
CREATE OR REPLACE FUNCTION forbid_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit event history is immutable' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON "audit_events" FOR EACH ROW EXECUTE FUNCTION forbid_audit_event_mutation();--> statement-breakpoint
CREATE OR REPLACE FUNCTION forbid_domain_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'domain event history is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW."event_type" IS DISTINCT FROM OLD."event_type"
    OR NEW."aggregate_type" IS DISTINCT FROM OLD."aggregate_type"
    OR NEW."aggregate_id" IS DISTINCT FROM OLD."aggregate_id"
    OR NEW."actor_person_id" IS DISTINCT FROM OLD."actor_person_id"
    OR NEW."occurred_at" IS DISTINCT FROM OLD."occurred_at"
    OR NEW."payload" IS DISTINCT FROM OLD."payload" THEN
    RAISE EXCEPTION 'domain event facts are immutable; only processing status, attempts, last error and processed time may change' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER domain_events_immutable BEFORE UPDATE OR DELETE ON "domain_events" FOR EACH ROW EXECUTE FUNCTION forbid_domain_event_mutation();