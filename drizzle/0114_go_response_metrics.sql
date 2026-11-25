-- Distinguish successful Go entry requests, redirect responses and rendered pages.
-- Existing redirects is the legacy mixed entry-request count. Never infer
-- historical response types from that counter. New typed counters start at zero.
ALTER TABLE public.site_go_link_daily_visits
  ADD COLUMN link_opens integer NOT NULL DEFAULT 0,
  ADD COLUMN page_views integer NOT NULL DEFAULT 0,
  ADD COLUMN redirect_responses integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT site_go_link_daily_visits_response_counts_ck CHECK (
    link_opens>=0 AND page_views>=0 AND redirect_responses>=0
    AND link_opens<=page_views+redirect_responses
    AND redirect_responses<=link_opens
  );
--> statement-breakpoint
GRANT SELECT (link_opens,page_views,redirect_responses),
  INSERT (link_opens,page_views,redirect_responses),
  UPDATE (link_opens,page_views,redirect_responses)
  ON public.site_go_link_daily_visits TO can_go_gateway;
--> statement-breakpoint
-- Compatibility with the 0113 writer during rollout. Typed counts are written
-- only by the new application; legacy writes still increment redirects.
ALTER POLICY go_gateway_counter_insert ON public.site_go_link_daily_visits
  WITH CHECK (day=(now() AT TIME ZONE 'UTC')::date AND EXISTS (
    SELECT 1 FROM public.site_go_links l WHERE l.id=link_id)
    AND ( (redirects=1 AND link_opens=0 AND page_views=0 AND redirect_responses=0)
       OR (redirects=link_opens AND link_opens IN (0,1)
          AND page_views IN (0,1) AND redirect_responses IN (0,1)
          AND page_views+redirect_responses=1)));
ALTER POLICY go_gateway_counter_update ON public.site_go_link_daily_visits
  WITH CHECK (day=(now() AT TIME ZONE 'UTC')::date AND redirects>=0 AND EXISTS (
    SELECT 1 FROM public.site_go_links l WHERE l.id=link_id));
