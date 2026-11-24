-- Public HTTP resolution uses an explicitly assumed, non-owner capability.
-- Membership must be granted separately to the verified server runtime principal.
-- No direct browser role access, no link issuance, no unscoped registry reads.
DO $go_gateway$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='can_go_gateway') THEN
    CREATE ROLE can_go_gateway NOLOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS;
  ELSIF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='can_go_gateway'
    AND (rolcanlogin OR rolbypassrls OR rolsuper OR rolcreaterole OR rolcreatedb)) THEN
    RAISE EXCEPTION 'Unsafe existing can_go_gateway role';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
    WHERE r.rolname='can_go_gateway') THEN
    RAISE EXCEPTION 'Go gateway must not inherit other roles';
  END IF;
END;
$go_gateway$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO can_go_gateway;
REVOKE ALL ON public.site_go_links, public.site_go_link_daily_visits FROM can_go_gateway;
GRANT SELECT (id,code,starts_at,expires_at,destination,status,site_id,organization_id,package_id,engagement_version_id)
  ON public.site_go_links TO can_go_gateway;
GRANT SELECT (link_id,day,redirects), INSERT (link_id,day,redirects), UPDATE (redirects)
  ON public.site_go_link_daily_visits TO can_go_gateway;
--> statement-breakpoint
CREATE POLICY go_gateway_exact_code ON public.site_go_links FOR SELECT TO can_go_gateway
  USING (code = current_setting('can.go_code',true)
    AND status='active' AND (starts_at IS NULL OR starts_at<=now())
    AND (expires_at IS NULL OR expires_at>now()));
--> statement-breakpoint
CREATE POLICY go_gateway_counter_read ON public.site_go_link_daily_visits FOR SELECT TO can_go_gateway
  USING (day=(now() AT TIME ZONE 'UTC')::date AND EXISTS (
    SELECT 1 FROM public.site_go_links l WHERE l.id=link_id));
CREATE POLICY go_gateway_counter_insert ON public.site_go_link_daily_visits FOR INSERT TO can_go_gateway
  WITH CHECK (day=(now() AT TIME ZONE 'UTC')::date AND redirects=1 AND EXISTS (
    SELECT 1 FROM public.site_go_links l WHERE l.id=link_id));
CREATE POLICY go_gateway_counter_update ON public.site_go_link_daily_visits FOR UPDATE TO can_go_gateway
  USING (day=(now() AT TIME ZONE 'UTC')::date AND EXISTS (
    SELECT 1 FROM public.site_go_links l WHERE l.id=link_id))
  WITH CHECK (day=(now() AT TIME ZONE 'UTC')::date AND redirects>=1 AND EXISTS (
    SELECT 1 FROM public.site_go_links l WHERE l.id=link_id));
