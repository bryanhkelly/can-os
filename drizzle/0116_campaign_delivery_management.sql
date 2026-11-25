-- Preserve unknown provider outcomes separately from confirmed rejection.
ALTER TABLE public.campaign_deliveries ADD COLUMN outcome_unconfirmed boolean NOT NULL DEFAULT false;
ALTER TABLE public.campaign_suppressions ADD COLUMN recorded_by_person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT;
