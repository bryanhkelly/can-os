-- A draft planning configuration is not approval for onsite minors.
-- Program-scoped CAN authorization remains separately contingent on current
-- school services, verified operating evidence and per-day supervision.
ALTER TYPE "public"."school_configuration_status" ADD VALUE IF NOT EXISTS 'approved';
--> statement-breakpoint
ALTER TYPE "public"."school_configuration_status" ADD VALUE IF NOT EXISTS 'suspended';
