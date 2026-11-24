-- Explicit, typed geography declarations. Site delivery remains the one
-- derived Site geography model (site_geography_versions and memberships).
CREATE TABLE public.entity_geographic_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 entity_kind text NOT NULL,
 organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 person_id uuid REFERENCES public.people(id) ON DELETE RESTRICT,
 program_id uuid REFERENCES public.programs(id) ON DELETE RESTRICT,
 offering_id uuid REFERENCES public.offerings(id) ON DELETE RESTRICT,
 campaign_id uuid REFERENCES public.engagement_campaigns(id) ON DELETE RESTRICT,
 partner_organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT,
 funding_opportunity_id uuid REFERENCES public.funding_opportunities(id) ON DELETE RESTRICT,
 noncredit_activity_id uuid REFERENCES public.noncredit_participation_events(id) ON DELETE RESTRICT,
 entity_id uuid GENERATED ALWAYS AS (coalesce(organization_id,person_id,program_id,offering_id,campaign_id,partner_organization_id,funding_opportunity_id,noncredit_activity_id)) STORED,
 role_code text NOT NULL,
 area_id uuid NOT NULL REFERENCES public.geographic_areas(id) ON DELETE RESTRICT,
 area_name text NOT NULL, area_kind text NOT NULL, area_source text, area_vintage text,
 source text NOT NULL CHECK(source IN ('governed_declaration','self_declared')),
 assigned_by_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
 consent_at timestamptz,
 valid_from timestamptz NOT NULL DEFAULT clock_timestamp(), valid_through timestamptz,
 CHECK(valid_through IS NULL OR valid_through>=valid_from),
 CHECK(num_nonnulls(organization_id,person_id,program_id,offering_id,campaign_id,partner_organization_id,funding_opportunity_id,noncredit_activity_id)=1),
 CHECK(
  (entity_kind='organization' AND organization_id IS NOT NULL AND role_code IN ('headquarters','operating_footprint'))
  OR (entity_kind='person' AND person_id IS NOT NULL AND role_code='residence')
  OR (entity_kind='program' AND program_id IS NOT NULL AND role_code='intended_service')
  OR (entity_kind='offering' AND offering_id IS NOT NULL AND role_code IN ('availability','delivery'))
  OR (entity_kind='campaign' AND campaign_id IS NOT NULL AND role_code='target')
  OR (entity_kind='partner' AND partner_organization_id IS NOT NULL AND role_code='coverage')
  OR (entity_kind='funding_opportunity' AND funding_opportunity_id IS NOT NULL AND role_code='eligibility')
  OR (entity_kind='learning_activity' AND noncredit_activity_id IS NOT NULL AND role_code IN ('delivery','participation'))
 ),
 CHECK(
  ((entity_kind='person' OR (entity_kind='learning_activity' AND role_code='participation'))
   AND source='self_declared' AND consent_at IS NOT NULL AND area_kind IN ('country','state','territory','federal_district','metro','micro','csa','region'))
  OR
  (entity_kind<>'person' AND NOT(entity_kind='learning_activity' AND role_code='participation') AND source='governed_declaration' AND consent_at IS NULL)
 ),
 CHECK(entity_kind<>'person' OR person_id=assigned_by_person_id)
);
CREATE UNIQUE INDEX entity_geography_active_uq ON public.entity_geographic_assignments(entity_kind,entity_id,role_code,area_id) WHERE valid_through IS NULL;
CREATE INDEX entity_geography_history_idx ON public.entity_geographic_assignments(entity_kind,entity_id,role_code,valid_from);
CREATE INDEX entity_geography_area_idx ON public.entity_geographic_assignments(area_id,entity_kind,role_code) WHERE valid_through IS NULL;
ALTER TABLE public.entity_geographic_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_geographic_assignments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.entity_geographic_assignments FROM PUBLIC,anonymous,authenticated;
