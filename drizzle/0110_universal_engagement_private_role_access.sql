-- 0110: explicit private database boundary for universal engagement content.
-- Public HTTP experiences are served through authorized server resolvers.
-- Nothing in public.engagement_* or site_go_links is directly readable by
-- anonymous/authenticated database roles even if default privileges change.
-- The server owner connection retains BYPASSRLS; browser roles do not.
ALTER TABLE "public"."engagement_definitions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."engagement_definitions" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."engagement_definitions" FROM PUBLIC, anonymous, authenticated;
--> statement-breakpoint
ALTER TABLE "public"."engagement_definition_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."engagement_definition_versions" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."engagement_definition_versions" FROM PUBLIC, anonymous, authenticated;
--> statement-breakpoint
ALTER TABLE "public"."site_go_links" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."site_go_links" FROM PUBLIC, anonymous, authenticated;
