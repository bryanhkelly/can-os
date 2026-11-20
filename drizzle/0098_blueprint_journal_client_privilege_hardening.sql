-- Neon default privileges explicitly grant EXECUTE to authenticated for new
-- public functions. An ordinary REVOKE FROM PUBLIC is insufficient.
-- These new Blueprint helpers may be invoked ONLY by DB-approved purpose
-- roles, granted individually by the reviewed per-Organization script.
REVOKE ALL ON FUNCTION public.append_restricted_blueprint_transition(
  text,text,uuid,uuid,uuid,jsonb,text,text,uuid,jsonb
) FROM PUBLIC, authenticated, anonymous;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.has_restricted_blueprint_purpose(
  uuid,text
) FROM PUBLIC, authenticated, anonymous;
