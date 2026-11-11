-- 0079: Non-operational Site Blueprint foundation. Additive. No existing Site, Program,
-- Activity, admissions record, financial record or publication state is modified.
-- Contract and self-declared identity records do not confer operating authority.
ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'community_nonprofit';
--> statement-breakpoint
ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'cultural_organization';
--> statement-breakpoint
ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'religious_organization';
--> statement-breakpoint
ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'independent_school';
--> statement-breakpoint
ALTER TYPE organization_type ADD VALUE IF NOT EXISTS 'facility_provider';
--> statement-breakpoint
CREATE TABLE religious_affiliation_options (
code text PRIMARY KEY,label text NOT NULL,group_code text NOT NULL,parent_code text REFERENCES religious_affiliation_options(code),
classification text NOT NULL DEFAULT 'religious' CHECK(classification IN ('religious','nonsectarian','unaffiliated','interfaith')),
sort_order integer NOT NULL DEFAULT 0,active boolean NOT NULL DEFAULT true);
--> statement-breakpoint
CREATE INDEX religious_affiliation_group_idx ON religious_affiliation_options(group_code,sort_order);
--> statement-breakpoint
CREATE TABLE site_blueprints(
site_id uuid PRIMARY KEY REFERENCES sites(id) ON DELETE RESTRICT,current_revision integer NOT NULL DEFAULT 0 CHECK(current_revision>=0),
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','planning_complete','archived')),
religious_affiliation_code text REFERENCES religious_affiliation_options(code),
editorial_identity text NOT NULL DEFAULT 'community_belonging',
cultural_context jsonb NOT NULL DEFAULT '{}'::jsonb,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,updated_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE site_blueprint_revisions(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,revision integer NOT NULL CHECK(revision>0),
schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version>0),snapshot jsonb NOT NULL,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_blueprint_revision_uq UNIQUE(site_id,revision));
--> statement-breakpoint
CREATE TABLE site_host_relationships(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
role text NOT NULL CHECK(role IN ('facility_host','local_operator','sponsor','property_owner')),
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','revoked','expired')),
is_primary boolean NOT NULL DEFAULT false,services jsonb NOT NULL DEFAULT '[]'::jsonb,
agreement_document_id uuid REFERENCES documents(id) ON DELETE RESTRICT,effective_from date,effective_through date,
approved_by_person_id uuid REFERENCES people(id) ON DELETE RESTRICT,approved_at timestamptz,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_host_relationship_dates_ck CHECK(effective_through IS NULL OR effective_from IS NULL OR effective_through>=effective_from),
CONSTRAINT site_host_relationship_approval_ck CHECK(status<>'approved' OR (agreement_document_id IS NOT NULL AND approved_by_person_id IS NOT NULL AND approved_at IS NOT NULL)));
--> statement-breakpoint
CREATE INDEX site_host_relationship_site_idx ON site_host_relationships(site_id,role,status);
--> statement-breakpoint
CREATE UNIQUE INDEX site_host_relationship_primary_uq ON site_host_relationships(site_id,role) WHERE status='approved' AND is_primary=true;
--> statement-breakpoint
CREATE UNIQUE INDEX site_host_relationship_org_pair_uq ON site_host_relationships(id,organization_id);
--> statement-breakpoint
CREATE TABLE site_host_compensation_terms(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),relationship_id uuid NOT NULL REFERENCES site_host_relationships(id) ON DELETE RESTRICT,
payer_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,payee_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
basis text NOT NULL CHECK(basis IN ('fixed_monthly','per_enrolled_student','reimbursement','hybrid','other')),
amount_cents integer CHECK(amount_cents IS NULL OR amount_cents>=0),currency text NOT NULL DEFAULT 'USD',
terms jsonb NOT NULL DEFAULT '{}'::jsonb,
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','under_review','approved','suspended','expired','cancelled')),
agreement_document_id uuid REFERENCES documents(id) ON DELETE RESTRICT,effective_from date,effective_through date,
approved_by_person_id uuid REFERENCES people(id) ON DELETE RESTRICT,approved_at timestamptz,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_host_compensation_dates_ck CHECK(effective_through IS NULL OR effective_from IS NULL OR effective_through>=effective_from),
CONSTRAINT site_host_compensation_approval_ck CHECK(status<>'approved' OR (agreement_document_id IS NOT NULL AND approved_by_person_id IS NOT NULL AND approved_at IS NOT NULL AND effective_from IS NOT NULL)),
CONSTRAINT site_host_compensation_payee_fk FOREIGN KEY(relationship_id,payee_organization_id) REFERENCES site_host_relationships(id,organization_id));
--> statement-breakpoint
CREATE INDEX site_host_compensation_relationship_idx ON site_host_compensation_terms(relationship_id,status);
--> statement-breakpoint
CREATE TABLE blueprint_catalog_items(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,
kind text NOT NULL CHECK(kind IN ('program','community','experience','club','activity')),
category text NOT NULL,name text NOT NULL,summary text NOT NULL,
status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','retired')),
sort_order integer NOT NULL DEFAULT 0,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE INDEX blueprint_catalog_kind_category_idx ON blueprint_catalog_items(kind,category,status);
--> statement-breakpoint
CREATE TABLE blueprint_catalog_item_versions(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_id uuid NOT NULL REFERENCES blueprint_catalog_items(id) ON DELETE RESTRICT,
version integer NOT NULL CHECK(version>0),description text NOT NULL,grade_range jsonb NOT NULL DEFAULT '{}'::jsonb,
schedule_suggestion jsonb NOT NULL DEFAULT '{}'::jsonb,configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
published_at timestamptz NOT NULL DEFAULT now(),CONSTRAINT blueprint_catalog_item_version_uq UNIQUE(item_id,version));
--> statement-breakpoint
CREATE TABLE site_program_plans(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,catalog_version_id uuid REFERENCES blueprint_catalog_item_versions(id) ON DELETE RESTRICT,
name text NOT NULL,kind text NOT NULL,grade_range jsonb NOT NULL DEFAULT '{}'::jsonb,
delivery_model jsonb NOT NULL DEFAULT '{}'::jsonb,religious_affiliation_code text REFERENCES religious_affiliation_options(code),
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','ready_to_convert','linked','retired')),
revision integer NOT NULL DEFAULT 1 CHECK(revision>0),canonical_program_id uuid UNIQUE REFERENCES programs(id) ON DELETE RESTRICT,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_program_plan_link_ck CHECK(status<>'linked' OR canonical_program_id IS NOT NULL),
CONSTRAINT site_program_plan_site_pair_uq UNIQUE(id,site_id));
--> statement-breakpoint
CREATE INDEX site_program_plan_site_status_idx ON site_program_plans(site_id,status);
--> statement-breakpoint
CREATE TABLE site_schedule_plans(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
program_plan_id uuid,name text NOT NULL,timezone text NOT NULL,
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','approved_plan','retired')),
valid_from date,valid_through date,created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_schedule_plan_dates_ck CHECK(valid_through IS NULL OR valid_from IS NULL OR valid_through>=valid_from),
CONSTRAINT site_schedule_plan_program_site_fk FOREIGN KEY(program_plan_id,site_id) REFERENCES site_program_plans(id,site_id));
--> statement-breakpoint
CREATE INDEX site_schedule_plan_site_idx ON site_schedule_plans(site_id,program_plan_id);
--> statement-breakpoint
CREATE TABLE site_schedule_plan_periods(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),schedule_plan_id uuid NOT NULL REFERENCES site_schedule_plans(id) ON DELETE CASCADE,
day_of_week integer NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
starts_at_local time NOT NULL,ends_at_local time NOT NULL,
kind text NOT NULL CHECK(kind IN ('site_hours','attendance','instruction','support','enrichment')),
label text NOT NULL,CONSTRAINT site_schedule_plan_period_time_ck CHECK(starts_at_local<ends_at_local),
CONSTRAINT site_schedule_plan_period_uq UNIQUE(schedule_plan_id,day_of_week,starts_at_local,ends_at_local,kind));
--> statement-breakpoint
CREATE TABLE site_curriculum_plans(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,program_plan_id uuid,
subject text NOT NULL,pathway text NOT NULL DEFAULT 'core',
pack_id uuid REFERENCES curriculum_packs(id) ON DELETE RESTRICT,
pack_version_id uuid REFERENCES curriculum_pack_versions(id) ON DELETE RESTRICT,
notes text NOT NULL DEFAULT '',status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','ready_to_adopt','linked','retired')),
canonical_adoption_id uuid UNIQUE REFERENCES curriculum_adoptions(id) ON DELETE RESTRICT,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_curriculum_plan_program_site_fk FOREIGN KEY(program_plan_id,site_id) REFERENCES site_program_plans(id,site_id),
CONSTRAINT site_curriculum_plan_pack_ck CHECK(pack_version_id IS NULL OR pack_id IS NOT NULL),
CONSTRAINT site_curriculum_plan_link_ck CHECK(status<>'linked' OR canonical_adoption_id IS NOT NULL));
--> statement-breakpoint
CREATE INDEX site_curriculum_plan_site_idx ON site_curriculum_plans(site_id,program_plan_id,status);
--> statement-breakpoint
CREATE TABLE site_blueprint_items(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,program_plan_id uuid,
catalog_version_id uuid REFERENCES blueprint_catalog_item_versions(id) ON DELETE RESTRICT,
kind text NOT NULL CHECK(kind IN ('community','experience','club','activity')),
title text NOT NULL,summary text NOT NULL DEFAULT '',configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','ready_to_convert','linked','retired')),
revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
canonical_activity_id uuid UNIQUE REFERENCES activities(id) ON DELETE RESTRICT,
canonical_field_trip_id uuid UNIQUE REFERENCES field_trips(id) ON DELETE RESTRICT,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_blueprint_item_program_site_fk FOREIGN KEY(program_plan_id,site_id) REFERENCES site_program_plans(id,site_id),
CONSTRAINT site_blueprint_item_single_link_ck CHECK(NOT(canonical_activity_id IS NOT NULL AND canonical_field_trip_id IS NOT NULL)),
CONSTRAINT site_blueprint_item_link_ck CHECK(status<>'linked' OR canonical_activity_id IS NOT NULL OR canonical_field_trip_id IS NOT NULL));
--> statement-breakpoint
CREATE INDEX site_blueprint_item_site_kind_idx ON site_blueprint_items(site_id,kind,status);
--> statement-breakpoint
CREATE TABLE site_concept_contacts(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,first_name text NOT NULL,last_name text NOT NULL,
email_normalized text NOT NULL,email_digest text NOT NULL,contact_consent_at timestamptz,consent_withdrawn_at timestamptz,
status text NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','invited','responded','opted_out','converted')),
created_by_person_id uuid REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_concept_contact_dedupe_uq UNIQUE(site_id,email_digest),
CONSTRAINT site_concept_contact_site_pair_uq UNIQUE(id,site_id));
--> statement-breakpoint
CREATE INDEX site_concept_contacts_site_status_idx ON site_concept_contacts(site_id,status);
--> statement-breakpoint
CREATE TABLE site_concept_campaigns(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,name text NOT NULL,
kind text NOT NULL DEFAULT 'family_introduction' CHECK(kind IN ('family_introduction','survey','interest_event')),
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','sending','completed','cancelled')),
website_revision_id uuid REFERENCES site_local_content_versions(id) ON DELETE RESTRICT,
created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_concept_campaign_site_pair_uq UNIQUE(id,site_id));
--> statement-breakpoint
CREATE INDEX site_concept_campaign_site_idx ON site_concept_campaigns(site_id,status);
--> statement-breakpoint
CREATE TABLE site_concept_responses(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,contact_id uuid NOT NULL,campaign_id uuid NOT NULL,
answers jsonb NOT NULL DEFAULT '{}'::jsonb,contact_consent_at timestamptz,
status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','updated','withdrawn')),
created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_concept_response_contact_campaign_uq UNIQUE(contact_id,campaign_id),
CONSTRAINT site_concept_response_contact_site_fk FOREIGN KEY(contact_id,site_id) REFERENCES site_concept_contacts(id,site_id),
CONSTRAINT site_concept_response_campaign_site_fk FOREIGN KEY(campaign_id,site_id) REFERENCES site_concept_campaigns(id,site_id));
--> statement-breakpoint
CREATE INDEX site_concept_response_site_idx ON site_concept_responses(site_id,status);
--> statement-breakpoint
CREATE TABLE site_publication_releases(
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,revision integer NOT NULL CHECK(revision>0),
status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','in_review','approved','published','withdrawn')),
website_revision_id uuid REFERENCES site_local_content_versions(id) ON DELETE RESTRICT,
content_snapshot jsonb NOT NULL,source_revision_map jsonb NOT NULL DEFAULT '{}'::jsonb,
reviewed_by_person_id uuid REFERENCES people(id) ON DELETE RESTRICT,reviewed_at timestamptz,
published_by_person_id uuid REFERENCES people(id) ON DELETE RESTRICT,published_at timestamptz,
created_at timestamptz NOT NULL DEFAULT now(),
CONSTRAINT site_publication_release_site_revision_uq UNIQUE(site_id,revision),
CONSTRAINT site_publication_release_published_ck CHECK(status<>'published' OR (reviewed_by_person_id IS NOT NULL AND reviewed_at IS NOT NULL AND published_by_person_id IS NOT NULL AND published_at IS NOT NULL)));
--> statement-breakpoint
CREATE INDEX site_publication_release_status_idx ON site_publication_releases(site_id,status,revision);
