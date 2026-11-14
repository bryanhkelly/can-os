-- CAN OS | Education in a Box | INTEGRATION CANONICAL TARGET DDL v3.0.1
-- PostgreSQL 16+. DESIGN TARGET, NOT A PRODUCTION MIGRATION.
-- Domain: organizations, educational operations, optional networks, blueprints,
-- offerings, deployments, learners, academic authority, evidence and funding.
-- Model version: 2026-11-13. v3.0.1 P0 integration candidate. Single fresh-build target; not an in-place migration.
-- Integration additions: canonical Blueprint identity and reference-only catalog for PR279.
-- Application-specific RLS/identity roles must be deployed separately and tested on PostgreSQL.
-- v3.0 covers program catalog, program-fit, activation, freshness, shared resources,
-- learner outcomes, reproducible impact metrics, cross-domain authorization and safety.
-- Namespaced to avoid collisions with legacy CAN OS public.* tables.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS education_v30;
SET LOCAL search_path = education_v30, public;

-- 00. Controlled data vocabularies; no restrictive ENUM for education families.
CREATE TABLE vocabularies (
  code text PRIMARY KEY, description text NOT NULL
);
CREATE TABLE vocabulary_terms (
  vocabulary_code text NOT NULL REFERENCES vocabularies(code),
  code text NOT NULL, name text NOT NULL, active boolean NOT NULL DEFAULT true,
  description text, PRIMARY KEY(vocabulary_code, code),
  CHECK (length(trim(code)) > 0)
);
INSERT INTO vocabularies (code,description) VALUES
 ('organization_class','Business classifications'),('operation_kind','Education operation kind'),
 ('offering_family','Education product families'),('organization_role','Organization authority/responsibility roles'),
 ('site_role','Facility organizational roles'),('delivery_modality','Instruction modalities'),
 ('network_role','Network participation capacity'),('credential_kind','Academic / external credential kinds'),
 ('evidence_kind','Evidence classifications'),('service_kind','Billable/educational service classes'),
 ('funding_kind','Funding mechanisms'),('approval_kind','Internal institutional decision types');
INSERT INTO vocabulary_terms (vocabulary_code, code, name) VALUES
 ('organization_class','school','School'),('organization_class','church','Church'),
 ('organization_class','nonprofit','Nonprofit'),('organization_class','workforce_provider','Workforce provider'),
 ('organization_class','government','Government agency'),('organization_class','college','College'),
 ('organization_class','employer','Employer'),('organization_class','publisher','Curriculum publisher'),
 ('organization_class','microschool','Microschool operator'),('organization_class','other','Other'),
 ('operation_kind','school','School'),('operation_kind','learning_center','Learning center'),
 ('operation_kind','online_academy','Online academy'),('operation_kind','training_center','Training center'),
 ('operation_kind','program_office','Program office'),
 ('offering_family','k12','K-12'),('offering_family','adult_foundations','Adult foundational education'),
 ('offering_family','esl','English language learning'),('offering_family','workforce','Workforce education'),
 ('offering_family','tutoring','Tutoring'),('offering_family','enrichment','Enrichment'),
 ('offering_family','continuing_ed','Continuing education'),('offering_family','homeschool','Home education'),
 ('organization_role','operator','Operational operator'),('organization_role','host','Local host'),
 ('organization_role','academic_provider','Academic provider'),('organization_role','school_of_record','School of record'),
 ('organization_role','records_custodian','Records custodian'),('organization_role','credit_issuer','Academic credit issuer'),
 ('organization_role','credential_issuer','Credential issuer'),('organization_role','instructor_provider','Instructional provider'),
 ('organization_role','contract_holder','Contract holder'),('organization_role','fund_recipient','Funds recipient'),
 ('organization_role','sponsor','Sponsor'),('organization_role','publisher','Publisher'),
 ('site_role','owner','Property owner'),('site_role','host','Site host'),('site_role','operator','Site operator'),
 ('site_role','facility_manager','Facility manager'),
 ('delivery_modality','onsite','In-person'),('delivery_modality','asynchronous','Asynchronous'),
 ('delivery_modality','live_online','Live online'),('delivery_modality','hybrid','Hybrid'),
 ('network_role','member','Network member'),('network_role','sponsor','Sponsor'),
 ('network_role','jurisdiction','Jurisdiction coordinator'),('network_role','service_provider','Service provider'),
 ('credential_kind','diploma','School diploma'),('credential_kind','course_completion','Completion'),
 ('credential_kind','academic_credit','Academic credit'),('credential_kind','industry','Industry credential'),
 ('credential_kind','high_school_equivalency','HSE credential'),
 ('evidence_kind','government_decision','Official decision'),('evidence_kind','contract','Contract'),
 ('evidence_kind','legal_source','Regulation/guidance'),('evidence_kind','instruction','Educational evidence'),
 ('evidence_kind','assessment','Assessment evidence'),('evidence_kind','rights','Content rights'),
 ('evidence_kind','safety','Safety evidence'),('evidence_kind','invoice','Invoice'),
 ('service_kind','instruction','Instruction'),('service_kind','tutoring','Tutoring'),
 ('service_kind','curriculum','Curriculum'),('service_kind','facilitation','Facilitation'),
 ('service_kind','facilities','Facility'),('service_kind','software','Software'),
 ('service_kind','assessment','Assessment'),('service_kind','support','Learner support'),
 ('funding_kind','grant','Grant'),('funding_kind','contract','Government contract'),
 ('funding_kind','voucher','Voucher / ESA'),('funding_kind','training_account','Training account'),
 ('funding_kind','tuition','Private tuition'),('funding_kind','employer','Employer-funded'),
 ('funding_kind','philanthropy','Philanthropy'),
 ('approval_kind','design','Design approval'),('approval_kind','readiness','Operational readiness'),
 ('approval_kind','publication','Publication'),('approval_kind','curriculum','Curriculum approval'),
 ('approval_kind','rights','Rights/accessibility approval');

-- A declared tradition is descriptive identity, never verified network affiliation.
CREATE TABLE religious_affiliation_options (
  code text PRIMARY KEY, label text NOT NULL, group_code text NOT NULL,
  parent_code text REFERENCES religious_affiliation_options(code),
  classification text NOT NULL CHECK(classification IN ('religious','nonsectarian','unaffiliated','interfaith')),
  sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true
);
CREATE INDEX religious_affiliation_group_idx
  ON religious_affiliation_options(group_code,sort_order);
INSERT INTO religious_affiliation_options(code,label,group_code,parent_code,classification,sort_order) VALUES
 ('none','No religious affiliation','none',NULL,'unaffiliated',0),
 ('nonsectarian','Nonsectarian','none',NULL,'nonsectarian',10),
 ('interfaith','Interfaith / Multifaith','interfaith',NULL,'interfaith',20),
 ('christian','Christian','christian',NULL,'religious',30),
 ('christian.baptist','Baptist','christian','christian','religious',40),
 ('christian.cogic','Church of God in Christ (COGIC)','christian','christian','religious',50),
 ('christian.cogbf','Church of God by Faith (COGBF)','christian','christian','religious',60),
 ('christian.ame','African Methodist Episcopal (AME)','christian','christian','religious',70),
 ('christian.paw','Pentecostal Assemblies of the World (PAW)','christian','christian','religious',80),
 ('christian.pentecostal','Pentecostal','christian','christian','religious',90),
 ('christian.apostolic','Apostolic','christian','christian','religious',100),
 ('christian.catholic','Catholic','christian','christian','religious',110),
 ('christian.protestant','Other Protestant','christian','christian','religious',120),
 ('christian.nondenominational','Nondenominational Christian','christian','christian','religious',130),
 ('muslim','Muslim / Islamic','muslim',NULL,'religious',140),
 ('muslim.sunni','Sunni','muslim','muslim','religious',150),
 ('muslim.shia','Shia','muslim','muslim','religious',160),
 ('jewish','Jewish','jewish',NULL,'religious',170),
 ('jewish.orthodox','Orthodox Jewish','jewish','jewish','religious',180),
 ('jewish.conservative','Conservative Jewish','jewish','jewish','religious',190),
 ('jewish.reform','Reform Jewish','jewish','jewish','religious',200),
 ('hindu','Hindu','hindu',NULL,'religious',210),
 ('buddhist','Buddhist','buddhist',NULL,'religious',220),
 ('sikh','Sikh','sikh',NULL,'religious',230),
 ('other','Other / Self-describe','other',NULL,'religious',240);

-- 01. Independent identities. A network is never a mandatory parent.
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_name text NOT NULL,
  display_name text NOT NULL, external_reference text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('prospective','active','inactive','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE organization_classifications (
  organization_id uuid NOT NULL REFERENCES organizations(id), class_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'organization_class' CHECK(vocabulary_code='organization_class'),
  valid_from date NOT NULL DEFAULT CURRENT_DATE, valid_through date,
  PRIMARY KEY(organization_id,class_code,valid_from),
  FOREIGN KEY (vocabulary_code,class_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  CHECK (valid_through IS NULL OR valid_through >= valid_from)
);
CREATE TABLE geographic_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
  name text NOT NULL, level_code text NOT NULL,
  parent_id uuid REFERENCES geographic_areas(id), CHECK(id IS DISTINCT FROM parent_id)
);
CREATE TABLE organization_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), from_organization_id uuid NOT NULL REFERENCES organizations(id),
  to_organization_id uuid NOT NULL REFERENCES organizations(id), relationship_code text NOT NULL,
  valid_from date NOT NULL DEFAULT CURRENT_DATE, valid_through date,
  evidence_version_id uuid, CHECK(from_organization_id<>to_organization_id),
  CHECK(valid_through IS NULL OR valid_through >= valid_from),
  UNIQUE(from_organization_id,to_organization_id,relationship_code,valid_from)
);
CREATE TABLE education_networks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), steward_organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL UNIQUE, name text NOT NULL, status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('planning','active','suspended','closed'))
);
CREATE TABLE network_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), network_id uuid NOT NULL REFERENCES education_networks(id),
  organization_id uuid NOT NULL REFERENCES organizations(id), role_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'network_role' CHECK(vocabulary_code='network_role'),
  FOREIGN KEY(vocabulary_code,role_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  valid_from date NOT NULL, valid_through date,
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','suspended','ended')),
  CHECK(valid_through IS NULL OR valid_through >= valid_from),
  UNIQUE(network_id,organization_id,role_code,valid_from)
);
CREATE TABLE education_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
  name text NOT NULL, kind_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'operation_kind' CHECK(vocabulary_code='operation_kind'),
  FOREIGN KEY(vocabulary_code,kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  status text NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','active','paused','closed')),
  web_identity jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(web_identity)='object'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- Additional descriptive classifications never authorize program delivery by themselves.
CREATE TABLE education_operation_classifications (
 operation_id uuid NOT NULL REFERENCES education_operations(id),
 kind_code text NOT NULL,
 vocabulary_code text NOT NULL DEFAULT 'operation_kind' CHECK(vocabulary_code='operation_kind'),
 valid_from date NOT NULL DEFAULT CURRENT_DATE, valid_through date,
 FOREIGN KEY(vocabulary_code,kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
 CHECK(valid_through IS NULL OR valid_through>=valid_from),
 PRIMARY KEY(operation_id,kind_code,valid_from)
);
COMMENT ON COLUMN education_operations.kind_code IS
 'Primary descriptive classification. Never a source of application eligibility or operational authorization.';
CREATE TABLE education_operation_organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES education_operations(id),
  organization_id uuid NOT NULL REFERENCES organizations(id), role_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'organization_role' CHECK(vocabulary_code='organization_role'),
  FOREIGN KEY(vocabulary_code,role_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  agreement_id uuid, status text NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','approved','suspended','ended')),
  CHECK(valid_through IS NULL OR valid_through > valid_from),
  UNIQUE(operation_id,organization_id,role_code,valid_from)
);
CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
  site_kind text NOT NULL CHECK(site_kind IN ('physical','virtual','mobile')),
  geographic_area_id uuid REFERENCES geographic_areas(id),
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(address)='object'),
  time_zone text NOT NULL DEFAULT 'UTC',
  capacity integer CHECK(capacity IS NULL OR capacity>=0),
  status text NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','active','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Public hostnames bind directly to canonical Sites.
CREATE TABLE site_publication_bindings (
 site_id uuid PRIMARY KEY REFERENCES sites(id),
 public_slug text NOT NULL UNIQUE CHECK(
   length(public_slug) BETWEEN 3 AND 48
   AND public_slug ~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$'
   AND position('--' IN public_slug)=0
   AND public_slug NOT IN (
     'admin','api','app','auth','cdn','dashboard','demo','docs','enrichment',
     'files','help','internal','login','mail','portal','staging','static',
     'support','test','www'
   )
 ),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 published_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((status='published')=(published_at IS NOT NULL))
);
COMMENT ON TABLE site_publication_bindings IS
 'Public claims are resolved through the canonical Site bound to this public slug.';
CREATE TABLE site_organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES sites(id),
  organization_id uuid NOT NULL REFERENCES organizations(id), role_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'site_role' CHECK(vocabulary_code='site_role'),
  FOREIGN KEY(vocabulary_code,role_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  UNIQUE(site_id,organization_id,role_code,valid_from)
);
CREATE TABLE site_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES sites(id),
  code text NOT NULL, name text NOT NULL, max_occupancy integer CHECK(max_occupancy IS NULL OR max_occupancy>=0),
  resources jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE(id,site_id), UNIQUE(site_id,code)
);
CREATE TABLE education_operation_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES education_operations(id),
  site_id uuid NOT NULL REFERENCES sites(id), valid_from timestamptz NOT NULL, valid_through timestamptz,
  purpose text, CHECK(valid_through IS NULL OR valid_through>valid_from),
  UNIQUE(operation_id,site_id,valid_from), UNIQUE(id,operation_id,site_id)
);
CREATE TABLE network_operation_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), network_id uuid NOT NULL REFERENCES education_networks(id),
  operation_id uuid NOT NULL REFERENCES education_operations(id), agreement_id uuid,
  valid_from date NOT NULL, valid_through date, status text NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','active','suspended','ended')),
  CHECK(valid_through IS NULL OR valid_through>=valid_from),
  UNIQUE(network_id,operation_id,valid_from)
);
CREATE TABLE persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), legal_first_name text, legal_last_name text,
  preferred_name text, birth_date date, created_at timestamptz NOT NULL DEFAULT now()
);
-- CAN OS v3.0.1 accounts and permissions belong directly to this database.
CREATE TABLE canonical_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email_normalized text NOT NULL UNIQUE,
 email_verified_at timestamptz,
 disabled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(email_normalized=lower(btrim(email_normalized))
   AND email_normalized LIKE '%@%' AND length(email_normalized)<=254)
);
CREATE TABLE canonical_account_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES canonical_accounts(id),
 person_id uuid NOT NULL REFERENCES persons(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid REFERENCES sites(id),
 role_code text NOT NULL CHECK(role_code IN ('site_admin','registrar','blueprint_reviewer','learner')),
 active boolean NOT NULL DEFAULT true,
 granted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 UNIQUE(id,account_id),
 CHECK((role_code IN ('blueprint_reviewer','learner') AND site_id IS NULL)
    OR (role_code IN ('site_admin','registrar') AND site_id IS NOT NULL)),
 CHECK(revoked_at IS NULL OR revoked_at>=granted_at)
);
CREATE INDEX canonical_account_grants_account_idx
  ON canonical_account_grants(account_id) WHERE active AND revoked_at IS NULL;
CREATE TABLE canonical_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 account_id uuid NOT NULL REFERENCES canonical_accounts(id),
 active_grant_id uuid NOT NULL,
 secret_hash text NOT NULL UNIQUE CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 last_activity_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 FOREIGN KEY(active_grant_id,account_id)
   REFERENCES canonical_account_grants(id,account_id),
 CHECK(expires_at>created_at),
 CHECK(revoked_at IS NULL OR revoked_at>=created_at)
);
CREATE INDEX canonical_sessions_account_idx ON canonical_sessions(account_id)
 WHERE revoked_at IS NULL;

CREATE TABLE learner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL UNIQUE REFERENCES persons(id),
  created_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE guardian_authorities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guardian_person_id uuid NOT NULL REFERENCES persons(id),
  learner_id uuid NOT NULL REFERENCES learner_profiles(id), authority_kind text NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz, verified_at timestamptz,
  CHECK(ends_at IS NULL OR ends_at>starts_at), UNIQUE(guardian_person_id,learner_id,starts_at)
);

-- 02. Evidence is versioned. Document references do not itself grant authority.
CREATE TABLE evidence_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'evidence_kind' CHECK(vocabulary_code='evidence_kind'),
  FOREIGN KEY(vocabulary_code,kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  owning_organization_id uuid REFERENCES organizations(id), title text NOT NULL,
  privacy_class text NOT NULL DEFAULT 'restricted'
    CHECK(privacy_class IN ('public','internal','restricted','highly_restricted')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evidence_document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES evidence_documents(id),
  version_no integer NOT NULL CHECK(version_no>0), source_uri text, storage_reference text,
  mime_type text CHECK(mime_type IS NULL OR mime_type ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  sha256 text CHECK(sha256 IS NULL OR sha256 ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  valid_from date, valid_through date, verified_by_person_id uuid REFERENCES persons(id),
  verified_at timestamptz, UNIQUE(document_id,version_no)
);
ALTER TABLE organization_relationships ADD CONSTRAINT organization_relationship_evidence_fk
  FOREIGN KEY(evidence_version_id) REFERENCES evidence_document_versions(id);

-- 02b. People & Services: a person is not a job classification, employer, or permission.
CREATE TABLE professional_profiles (
  person_id uuid PRIMARY KEY REFERENCES persons(id), public_name text,
  biography text, publication_state text NOT NULL DEFAULT 'private'
    CHECK(publication_state IN ('private','in_review','published','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE workforce_families (
  code text PRIMARY KEY, name text NOT NULL
);
INSERT INTO workforce_families(code,name) VALUES
 ('academic_leadership','Academic leadership'),('content_creation','Content creation'),
 ('instructional_delivery','Instructional delivery'),('learner_support','Learner support'),
 ('site_operations','Site operations'),('enrichment','Enrichment and community'),
 ('assessment_credentials','Assessment and credentials'),('career_adult','Career and adult education'),
 ('administration_oversight','Administration and oversight');
CREATE TABLE professional_specialties (
  person_id uuid NOT NULL REFERENCES persons(id), specialty_code text NOT NULL,
  proficiency_note text, PRIMARY KEY(person_id,specialty_code)
);
CREATE TABLE service_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
  name text NOT NULL, family_code text NOT NULL REFERENCES workforce_families(code),
  requires_independent_authority boolean NOT NULL DEFAULT false,
  requires_supervised_minor_contact boolean NOT NULL DEFAULT false
);
INSERT INTO service_capabilities(code,name,family_code,requires_independent_authority,requires_supervised_minor_contact) VALUES
 ('recorded_presenter','Recorded instructor','content_creation',false,false),
 ('curriculum_author','Curriculum author','content_creation',false,false),
 ('content_reviewer','Academic and rights reviewer','content_creation',true,false),
 ('live_instructor','Live instructor','instructional_delivery',true,true),
 ('tutor','Tutor','instructional_delivery',false,true),
 ('facilitator','On-site facilitator','site_operations',false,true),
 ('independent_grader','Independent grader','assessment_credentials',true,false),
 ('academic_director','Academic director','academic_leadership',true,false),
 ('specialist_support','Learner support specialist','learner_support',true,true),
 ('mentor','Mentor and enrichment contributor','enrichment',false,true),
 ('industry_trainer','Industry instructor','career_adult',true,true),
 ('workforce_coach','Career coach','career_adult',false,true),
 ('compliance_reviewer','Compliance and safeguarding reviewer','administration_oversight',true,false);
CREATE TABLE workforce_delivery_modes (
  code text PRIMARY KEY, name text NOT NULL
);
INSERT INTO workforce_delivery_modes(code,name) VALUES
 ('onsite','On-site'),('recorded','Reusable recorded content'),
 ('scheduled_live_online','Scheduled live online'),('on_demand_online','On-demand online'),
 ('asynchronous_service','Asynchronous professional service');
CREATE TABLE capability_delivery_modes (
  capability_id uuid NOT NULL REFERENCES service_capabilities(id),
  delivery_mode text NOT NULL REFERENCES workforce_delivery_modes(code),
  PRIMARY KEY(capability_id,delivery_mode)
);
INSERT INTO capability_delivery_modes(capability_id,delivery_mode)
 SELECT id,'recorded' FROM service_capabilities WHERE code='recorded_presenter';
INSERT INTO capability_delivery_modes(capability_id,delivery_mode)
 SELECT id,'asynchronous_service' FROM service_capabilities
 WHERE code IN ('curriculum_author','content_reviewer','independent_grader','compliance_reviewer');
INSERT INTO capability_delivery_modes(capability_id,delivery_mode)
 SELECT c.id,m.mode FROM service_capabilities c
 JOIN (VALUES ('live_instructor','scheduled_live_online'),('live_instructor','onsite'),
 ('tutor','scheduled_live_online'),('tutor','on_demand_online'),('tutor','onsite'),
 ('facilitator','onsite'),('academic_director','asynchronous_service'),
 ('specialist_support','scheduled_live_online'),('specialist_support','onsite'),
 ('mentor','onsite'),('mentor','scheduled_live_online'),('industry_trainer','onsite'),
 ('industry_trainer','scheduled_live_online'),('workforce_coach','on_demand_online'),
 ('workforce_coach','scheduled_live_online')) m(capability_code,mode) ON m.capability_code=c.code;
CREATE TABLE professional_qualifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES persons(id),
  qualification_kind text NOT NULL, subject_code text, issued_by_organization_id uuid REFERENCES organizations(id),
  issuing_authority_name text, geography_id uuid REFERENCES geographic_areas(id),
  valid_from date, valid_through date, evidence_version_id uuid REFERENCES evidence_document_versions(id),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK(verification_status IN ('unverified','verified','rejected','revoked')),
  verified_at timestamptz, verified_by_person_id uuid REFERENCES persons(id),
  CHECK(valid_through IS NULL OR valid_from IS NULL OR valid_through>=valid_from),
  CHECK(verification_status<>'verified' OR (verified_at IS NOT NULL AND verified_by_person_id IS NOT NULL))
);
CREATE TABLE professional_screening_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES persons(id),
  screening_kind text NOT NULL, scope_organization_id uuid REFERENCES organizations(id),
  scope_operation_id uuid REFERENCES education_operations(id),
  decision text NOT NULL CHECK(decision IN ('pending','cleared','denied','expired','revoked')),
  effective_from timestamptz, effective_through timestamptz,
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_by_person_id uuid REFERENCES persons(id),
  CHECK(effective_through IS NULL OR effective_from IS NULL OR effective_through>effective_from)
);

-- 03. Blueprints are recipes. Configuration versions and approvals are independent.
CREATE TABLE blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publisher_organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL, title text NOT NULL, status text NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','retired')), UNIQUE(publisher_organization_id,code)
);
CREATE TABLE blueprint_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blueprint_id uuid NOT NULL REFERENCES blueprints(id),
  version_no integer NOT NULL CHECK(version_no>0), target_kind text NOT NULL
    CHECK(target_kind IN ('offering','operation','composite')),
  spec jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(spec)='object'),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  UNIQUE(blueprint_id,version_no), UNIQUE(id,blueprint_id),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE blueprint_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blueprint_version_id uuid NOT NULL REFERENCES blueprint_versions(id),
  component_key text NOT NULL, component_kind text NOT NULL,
  requirement_mode text NOT NULL DEFAULT 'optional' CHECK(requirement_mode IN ('required','optional','conditional')),
  component_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(id,blueprint_version_id), UNIQUE(blueprint_version_id,component_key)
);
CREATE TABLE blueprint_component_dependencies (
  blueprint_version_id uuid NOT NULL, component_id uuid NOT NULL, depends_on_component_id uuid NOT NULL,
  dependency_kind text NOT NULL CHECK(dependency_kind IN ('requires','excludes','substitutes')),
  PRIMARY KEY(component_id,depends_on_component_id,dependency_kind),
  FOREIGN KEY(component_id,blueprint_version_id) REFERENCES blueprint_components(id,blueprint_version_id),
  FOREIGN KEY(depends_on_component_id,blueprint_version_id) REFERENCES blueprint_components(id,blueprint_version_id),
  CHECK(component_id<>depends_on_component_id)
);
CREATE TABLE blueprint_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blueprint_id uuid NOT NULL REFERENCES blueprints(id),
  owning_organization_id uuid REFERENCES organizations(id), name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,blueprint_id)
);
CREATE TABLE blueprint_configuration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), configuration_id uuid NOT NULL,
  blueprint_id uuid NOT NULL, blueprint_version_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>0), config jsonb NOT NULL DEFAULT '{}'::jsonb,
  religious_affiliation_code text REFERENCES religious_affiliation_options(code),
  editorial_identity text NOT NULL DEFAULT 'community_belonging' CHECK(editorial_identity IN
    ('community_belonging','academic_excellence','innovation_discovery',
     'classical_humanities','creative_expression','leadership_service')),
  cultural_context jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(cultural_context)='object'),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','frozen')),
  created_at timestamptz NOT NULL DEFAULT now(), frozen_at timestamptz,
  FOREIGN KEY(configuration_id,blueprint_id) REFERENCES blueprint_configurations(id,blueprint_id),
  FOREIGN KEY(blueprint_version_id,blueprint_id) REFERENCES blueprint_versions(id,blueprint_id),
  UNIQUE(configuration_id,revision), UNIQUE(id,blueprint_version_id),
  CHECK((lifecycle='frozen')=(frozen_at IS NOT NULL))
);
CREATE TABLE blueprint_configuration_components (
  configuration_version_id uuid NOT NULL, blueprint_version_id uuid NOT NULL,
  component_id uuid NOT NULL,
  FOREIGN KEY(configuration_version_id,blueprint_version_id)
    REFERENCES blueprint_configuration_versions(id,blueprint_version_id),
  FOREIGN KEY(component_id,blueprint_version_id)
    REFERENCES blueprint_components(id,blueprint_version_id),
  selection_status text NOT NULL CHECK(selection_status IN ('selected','excluded','proposed')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(configuration_version_id,component_id)
);
CREATE TABLE blueprint_configuration_local_experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_version_id uuid NOT NULL,
  component_id uuid NOT NULL,
  experience_kind text NOT NULL CHECK(experience_kind IN ('community','experience','club','activity')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK(jsonb_typeof(configuration)='object'),
  FOREIGN KEY(configuration_version_id,component_id)
    REFERENCES blueprint_configuration_components(configuration_version_id,component_id)
);

-- Reference library entries are planning inputs, never executable Programs or Offerings.
CREATE TABLE blueprint_reference_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
  reference_kind text NOT NULL CHECK(reference_kind IN
    ('program_model','community','experience','club','activity')),
  category text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX blueprint_reference_items_kind_category_idx
  ON blueprint_reference_items(reference_kind,category,status);
CREATE TABLE blueprint_reference_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES blueprint_reference_items(id),
  version_no integer NOT NULL CHECK(version_no>0), title text NOT NULL, summary text NOT NULL,
  description text NOT NULL, grade_range jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK(jsonb_typeof(grade_range)='object'),
  schedule_suggestion jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK(jsonb_typeof(schedule_suggestion)='object'),
  configuration_guidance jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK(jsonb_typeof(configuration_guidance)='object'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(metadata)='object'),
  lifecycle text NOT NULL DEFAULT 'published' CHECK(lifecycle IN ('draft','published')),
  published_at timestamptz,
  UNIQUE(item_id,version_no),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE blueprint_configuration_component_references (
  configuration_version_id uuid NOT NULL,
  component_id uuid NOT NULL,
  reference_item_version_id uuid NOT NULL REFERENCES blueprint_reference_item_versions(id),
  PRIMARY KEY(configuration_version_id,component_id,reference_item_version_id),
  FOREIGN KEY(configuration_version_id,component_id)
    REFERENCES blueprint_configuration_components(configuration_version_id,component_id)
);
CREATE TABLE configuration_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), configuration_version_id uuid NOT NULL REFERENCES blueprint_configuration_versions(id),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id), decision text NOT NULL
    CHECK(decision IN ('approved','conditional','rejected','withdrawn')),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_at timestamptz NOT NULL DEFAULT now(), conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(id,configuration_version_id)
);

-- 04. Educational product, courses, tracks, and published content.
CREATE TABLE offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publisher_organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL, title text NOT NULL,
  origin text NOT NULL DEFAULT 'native' CHECK(origin IN ('native','external','licensed')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  UNIQUE(publisher_organization_id,code)
);
CREATE TABLE offering_families (
  offering_id uuid NOT NULL REFERENCES offerings(id), family_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'offering_family' CHECK(vocabulary_code='offering_family'),
  FOREIGN KEY(vocabulary_code,family_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  PRIMARY KEY(offering_id,family_code)
);
CREATE TABLE offering_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), offering_id uuid NOT NULL REFERENCES offerings(id),
  version_no integer NOT NULL CHECK(version_no>0), product_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  created_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz,
  UNIQUE(offering_id,version_no), UNIQUE(id,offering_id),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE blueprint_configuration_offering_intents (
  configuration_version_id uuid NOT NULL,
  component_id uuid NOT NULL,
  offering_version_id uuid NOT NULL REFERENCES offering_versions(id),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK(jsonb_typeof(configuration)='object'),
  PRIMARY KEY(configuration_version_id,component_id,offering_version_id),
  FOREIGN KEY(configuration_version_id,component_id)
    REFERENCES blueprint_configuration_components(configuration_version_id,component_id)
);
CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publisher_organization_id uuid NOT NULL REFERENCES organizations(id),
  course_code text NOT NULL, title text NOT NULL, subject text,
  UNIQUE(publisher_organization_id,course_code)
);
CREATE TABLE course_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES courses(id),
  version_no integer NOT NULL CHECK(version_no>0), syllabus jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  published_at timestamptz,
  UNIQUE(course_id,version_no), UNIQUE(id,course_id),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE course_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_version_id uuid NOT NULL REFERENCES course_versions(id),
  unit_key text NOT NULL, title text NOT NULL, sequence_no integer NOT NULL CHECK(sequence_no>0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(course_version_id,unit_key), UNIQUE(id,course_version_id)
);
CREATE TABLE offering_courses (
  offering_version_id uuid NOT NULL REFERENCES offering_versions(id),
  course_version_id uuid NOT NULL REFERENCES course_versions(id),
  is_required boolean NOT NULL DEFAULT true, sequence_no integer,
  PRIMARY KEY(offering_version_id,course_version_id)
);
CREATE TABLE content_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_organization_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL, kind text NOT NULL, external_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE content_asset_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES content_assets(id),
  version_no integer NOT NULL CHECK(version_no>0), storage_reference text,
  sha256 text, license_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  published_at timestamptz,
  UNIQUE(asset_id,version_no), CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE course_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_version_id uuid NOT NULL,
  course_unit_id uuid NOT NULL, lesson_key text NOT NULL, title text NOT NULL,
  lesson_order integer NOT NULL CHECK(lesson_order>0),
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(course_unit_id,course_version_id) REFERENCES course_units(id,course_version_id),
  UNIQUE(course_version_id,lesson_key), UNIQUE(id,course_version_id)
);
CREATE TABLE course_unit_assets (
  course_unit_id uuid NOT NULL REFERENCES course_units(id),
  asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
  PRIMARY KEY(course_unit_id,asset_version_id)
);
CREATE TABLE instructional_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES courses(id),
  presenter_person_id uuid REFERENCES persons(id), producer_organization_id uuid REFERENCES organizations(id),
  title text NOT NULL,
  UNIQUE(id,course_id)
);
CREATE TABLE instructional_track_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instructional_track_id uuid NOT NULL REFERENCES instructional_tracks(id),
  course_version_id uuid NOT NULL, course_id uuid NOT NULL,
  FOREIGN KEY(course_version_id,course_id) REFERENCES course_versions(id,course_id),
  FOREIGN KEY(instructional_track_id,course_id) REFERENCES instructional_tracks(id,course_id),
  created_by_person_id uuid NOT NULL REFERENCES persons(id),
  version_no integer NOT NULL CHECK(version_no>0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  track_kind text NOT NULL DEFAULT 'primary' CHECK(track_kind IN ('primary','supplemental')),
  submission_manifest_hash text CHECK(submission_manifest_hash ~ '^[a-f0-9]{64}$'),
  submitted_by_person_id uuid REFERENCES persons(id), submitted_at timestamptz,
  published_at timestamptz, UNIQUE(instructional_track_id,version_no),
  UNIQUE(id,course_version_id), UNIQUE(id,instructional_track_id),
  CHECK((submission_manifest_hash IS NULL)=(submitted_by_person_id IS NULL)
    AND (submission_manifest_hash IS NULL)=(submitted_at IS NULL)),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE instructional_track_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), track_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL, course_unit_id uuid NOT NULL,
  asset_version_id uuid REFERENCES content_asset_versions(id),
  material_kind text NOT NULL CHECK(material_kind IN ('instruction','practice','reference')),
  activity_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(track_version_id,course_version_id)
    REFERENCES instructional_track_versions(id,course_version_id),
  FOREIGN KEY(course_unit_id,course_version_id)
    REFERENCES course_units(id,course_version_id)
);
CREATE TABLE published_asset_reviews (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  review_kind text NOT NULL CHECK(review_kind IN ('rights','accessibility','academic','independent')),
  decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
  decided_at timestamptz NOT NULL DEFAULT now(), evidence_version_id uuid REFERENCES evidence_document_versions(id)
);
CREATE TABLE content_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_version_id uuid REFERENCES content_asset_versions(id),
  course_version_id uuid REFERENCES course_versions(id),
  track_version_id uuid REFERENCES instructional_track_versions(id),
  offering_version_id uuid REFERENCES offering_versions(id),
  withdrawal_kind text NOT NULL DEFAULT 'urgent_safety'
    CHECK(withdrawal_kind IN ('routine_retirement','urgent_rights','urgent_safety')),
  effective_at timestamptz NOT NULL, legacy_access_until timestamptz, reason text NOT NULL,
  authorized_by_person_id uuid NOT NULL REFERENCES persons(id),
  CHECK(num_nonnulls(asset_version_id,course_version_id,track_version_id,offering_version_id)=1),
  CHECK(legacy_access_until IS NULL OR
    (track_version_id IS NOT NULL AND withdrawal_kind='routine_retirement'
      AND legacy_access_until>effective_at))
);
CREATE TABLE offering_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  offering_id uuid NOT NULL REFERENCES offerings(id), valid_from timestamptz NOT NULL,
  valid_through timestamptz, allowed_version_policy text NOT NULL
    CHECK(allowed_version_policy IN ('all_published','approved_list','pinned_only')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','ended')),
  CHECK(valid_through IS NULL OR valid_through>valid_from)
);
-- Blueprint component decisions and one execution batch producing multiple independent outputs.
CREATE TABLE blueprint_component_approval_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), configuration_version_id uuid NOT NULL,
 component_id uuid NOT NULL, decision text NOT NULL
 CHECK(decision IN ('approved','conditional','denied','withdrawn')),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 authority_organization_id uuid NOT NULL REFERENCES organizations(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(), conditions text,
 FOREIGN KEY(configuration_version_id,component_id)
 REFERENCES blueprint_configuration_components(configuration_version_id,component_id),
 CHECK(decision<>'approved' OR evidence_version_id IS NOT NULL)
);
CREATE TABLE blueprint_execution_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), configuration_version_id uuid NOT NULL,
 blueprint_version_id uuid NOT NULL, review_id uuid NOT NULL,
 idempotency_key text NOT NULL CHECK(length(btrim(idempotency_key)) BETWEEN 8 AND 200),
 execution_status text NOT NULL DEFAULT 'proposed'
 CHECK(execution_status IN ('proposed','authorized','executed','suspended','voided')),
 executing_organization_id uuid NOT NULL REFERENCES organizations(id),
 executed_by_person_id uuid REFERENCES persons(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 executed_at timestamptz,
 FOREIGN KEY(configuration_version_id,blueprint_version_id)
 REFERENCES blueprint_configuration_versions(id,blueprint_version_id),
 FOREIGN KEY(review_id,configuration_version_id) REFERENCES configuration_reviews(id,configuration_version_id),
 UNIQUE(id,configuration_version_id,blueprint_version_id,review_id),
 UNIQUE(executing_organization_id,idempotency_key),
 CHECK(execution_status<>'executed' OR (executed_at IS NOT NULL AND executed_by_person_id IS NOT NULL))
);


CREATE TABLE professional_capability_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES persons(id),
  capability_id uuid NOT NULL REFERENCES service_capabilities(id),
  approving_organization_id uuid NOT NULL REFERENCES organizations(id),
  geographic_area_id uuid REFERENCES geographic_areas(id),
  operation_id uuid REFERENCES education_operations(id),
  offering_id uuid REFERENCES offerings(id),
  decision text NOT NULL DEFAULT 'pending' CHECK(decision IN ('pending','approved','suspended','revoked','expired')),
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  qualification_id uuid REFERENCES professional_qualifications(id),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  approved_by_person_id uuid REFERENCES persons(id),
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  CHECK(decision<>'approved' OR approved_by_person_id IS NOT NULL),
  UNIQUE(id,person_id,capability_id)
);

-- P0: Recipes and finished educational products state required human capabilities.
CREATE TABLE education_capability_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_version_id uuid REFERENCES blueprint_versions(id),
  offering_version_id uuid REFERENCES offering_versions(id),
  capability_id uuid NOT NULL REFERENCES service_capabilities(id),
  delivery_mode text REFERENCES workforce_delivery_modes(code),
  minimum_count integer NOT NULL DEFAULT 1 CHECK(minimum_count>=0),
  requirement_kind text NOT NULL CHECK(requirement_kind IN ('required','optional','conditional')),
  rule_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(capability_id,delivery_mode) REFERENCES capability_delivery_modes(capability_id,delivery_mode),
  CHECK(num_nonnulls(blueprint_version_id,offering_version_id)=1)
);

-- 04b. Curriculum acquisition and governed creator production pipeline.
CREATE TABLE curriculum_acquisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_id uuid NOT NULL REFERENCES courses(id),
  source_organization_id uuid REFERENCES organizations(id),
  acquired_by_organization_id uuid NOT NULL REFERENCES organizations(id),
  acquisition_kind text NOT NULL CHECK(acquisition_kind IN ('owned','licensed','commissioned','open_license','external')),
  document_version_id uuid REFERENCES evidence_document_versions(id),
  agreed_at timestamptz, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE curriculum_rights_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), acquisition_id uuid NOT NULL REFERENCES curriculum_acquisitions(id),
  rightsholder_organization_id uuid REFERENCES organizations(id),
  licensee_organization_id uuid NOT NULL REFERENCES organizations(id),
  may_record boolean NOT NULL DEFAULT false, may_adapt boolean NOT NULL DEFAULT false,
  may_distribute boolean NOT NULL DEFAULT false, may_sublicense boolean NOT NULL DEFAULT false,
  geographic_area_id uuid REFERENCES geographic_areas(id),
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','suspended','revoked','ended')),
  CHECK(valid_through IS NULL OR valid_through>valid_from)
);
CREATE TABLE curriculum_production_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_version_id uuid NOT NULL REFERENCES course_versions(id),
  rights_grant_id uuid NOT NULL REFERENCES curriculum_rights_grants(id),
  package_revision integer NOT NULL CHECK(package_revision>0),
  required_lessons_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(required_lessons_snapshot)='array'),
  deliverable_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  frozen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_version_id,package_revision), UNIQUE(id,course_version_id)
);
CREATE TABLE production_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), production_package_id uuid NOT NULL REFERENCES curriculum_production_packages(id),
  commissioning_organization_id uuid NOT NULL REFERENCES organizations(id),
  capability_id uuid NOT NULL REFERENCES service_capabilities(id),
  title text NOT NULL, status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','open','paused','filled','closed')),
  closes_at timestamptz, compensation_description text,
  UNIQUE(id,production_package_id)
);
CREATE TABLE creator_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), opportunity_id uuid NOT NULL REFERENCES production_opportunities(id),
  production_package_id uuid NOT NULL,
  creator_person_id uuid NOT NULL REFERENCES persons(id),
  contracting_organization_id uuid NOT NULL REFERENCES organizations(id),
  signed_contract_version_id uuid REFERENCES evidence_document_versions(id),
  status text NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','accepted','active','completed','cancelled')),
  accepted_at timestamptz, expected_delivery_at timestamptz,
  FOREIGN KEY(opportunity_id,production_package_id) REFERENCES production_opportunities(id,production_package_id),
  UNIQUE(id,production_package_id),
  CHECK(status NOT IN ('accepted','active','completed') OR (accepted_at IS NOT NULL AND signed_contract_version_id IS NOT NULL))
);
CREATE TABLE production_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commission_id uuid NOT NULL REFERENCES creator_commissions(id),
  asset_version_id uuid REFERENCES content_asset_versions(id),
  track_version_id uuid REFERENCES instructional_track_versions(id),
  deliverable_code text NOT NULL, revision integer NOT NULL CHECK(revision>0),
  status text NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','submitted','accepted','revision_requested','rejected')),
  submitted_at timestamptz, accepted_at timestamptz,
  UNIQUE(commission_id,deliverable_code,revision),
  CHECK(status<>'accepted' OR accepted_at IS NOT NULL),
  CHECK(num_nonnulls(asset_version_id,track_version_id)>=1)
);
CREATE TABLE production_review_decisions (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deliverable_id uuid NOT NULL REFERENCES production_deliverables(id),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','technical','safeguarding')),
  decision text NOT NULL CHECK(decision IN ('approved','rejected','changes_requested','withdrawn')),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE professional_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contributor_person_id uuid NOT NULL REFERENCES persons(id),
  contribution_kind text NOT NULL CHECK(contribution_kind IN ('recording','curriculum','assessment','supplement','translation','editing','accessibility','other')),
  asset_version_id uuid REFERENCES content_asset_versions(id),
  track_version_id uuid REFERENCES instructional_track_versions(id),
  production_deliverable_id uuid REFERENCES production_deliverables(id),
  contributor_role text NOT NULL DEFAULT 'creator', credit_share_basis_points integer
    CHECK(credit_share_basis_points IS NULL OR credit_share_basis_points BETWEEN 0 AND 10000),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(asset_version_id,track_version_id,production_deliverable_id)>=1)
);
CREATE TABLE instructional_track_reviews (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), track_version_id uuid NOT NULL REFERENCES instructional_track_versions(id),
  manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','coverage','safeguarding')),
  decision text NOT NULL CHECK(decision IN ('approved','rejected','changes_requested','withdrawn')),
  rationale text NOT NULL CHECK(length(btrim(rationale))>=10),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE track_lesson_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), track_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL, course_lesson_id uuid NOT NULL,
  asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
  presentation_kind text NOT NULL CHECK(presentation_kind IN ('primary','worked_example','supplement','alternate_language')),
  ordinal integer NOT NULL DEFAULT 1 CHECK(ordinal>0),
  accessibility_notes jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(track_version_id,course_version_id) REFERENCES instructional_track_versions(id,course_version_id),
  FOREIGN KEY(course_lesson_id,course_version_id) REFERENCES course_lessons(id,course_version_id),
  UNIQUE(track_version_id,course_lesson_id,presentation_kind,ordinal),
  UNIQUE(id,track_version_id,asset_version_id)
);
CREATE TABLE instructor_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), instructional_track_id uuid NOT NULL REFERENCES instructional_tracks(id),
  author_person_id uuid NOT NULL REFERENCES persons(id), title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,instructional_track_id)
);
CREATE TABLE instructor_supplement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplement_id uuid NOT NULL,
  instructional_track_id uuid NOT NULL, track_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL, version_no integer NOT NULL CHECK(version_no>0),
  purpose text NOT NULL CHECK(purpose IN ('formative','optional_extension','enrichment')),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  instructions jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  FOREIGN KEY(supplement_id,instructional_track_id) REFERENCES instructor_supplements(id,instructional_track_id),
  FOREIGN KEY(track_version_id,instructional_track_id) REFERENCES instructional_track_versions(id,instructional_track_id),
  FOREIGN KEY(track_version_id,course_version_id) REFERENCES instructional_track_versions(id,course_version_id),
  UNIQUE(supplement_id,version_no), UNIQUE(id,course_version_id),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE instructor_supplement_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplement_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL, course_lesson_id uuid NOT NULL,
  task_key text NOT NULL, task_kind text NOT NULL
   CHECK(task_kind IN ('worksheet','quiz','speaking','listening','writing','project','exercise','reflection','other')),
  task_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_version_id uuid REFERENCES content_asset_versions(id), ordinal integer NOT NULL CHECK(ordinal>0),
  FOREIGN KEY(supplement_version_id,course_version_id) REFERENCES instructor_supplement_versions(id,course_version_id),
  FOREIGN KEY(course_lesson_id,course_version_id) REFERENCES course_lessons(id,course_version_id),
  UNIQUE(supplement_version_id,task_key), UNIQUE(id,supplement_version_id), UNIQUE(id,course_version_id)
);
CREATE TABLE instructor_supplement_reviews (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplement_version_id uuid NOT NULL REFERENCES instructor_supplement_versions(id),
  review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','safeguarding')),
  decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE instructor_supplement_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplement_version_id uuid NOT NULL REFERENCES instructor_supplement_versions(id),
  effective_at timestamptz NOT NULL, reason text NOT NULL,
  authorized_by_person_id uuid NOT NULL REFERENCES persons(id),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE offering_release_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), offering_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL,
  minimum_approved_primary_tracks integer NOT NULL DEFAULT 1 CHECK(minimum_approved_primary_tracks>=0),
  complete_lesson_coverage_required boolean NOT NULL DEFAULT true,
  independent_academic_review_required boolean NOT NULL DEFAULT true,
  rights_clearance_required boolean NOT NULL DEFAULT true,
  accessibility_review_required boolean NOT NULL DEFAULT true,
  FOREIGN KEY(offering_version_id,course_version_id) REFERENCES offering_courses(offering_version_id,course_version_id),
  UNIQUE(offering_version_id,course_version_id)
);
CREATE TABLE track_distribution_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), track_version_id uuid NOT NULL REFERENCES instructional_track_versions(id),
  approved_organization_id uuid REFERENCES organizations(id),
  approved_operation_id uuid REFERENCES education_operations(id),
  approved_offering_id uuid REFERENCES offerings(id),
  geographic_area_id uuid REFERENCES geographic_areas(id),
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','suspended','revoked')),
  rights_evidence_version_id uuid REFERENCES evidence_document_versions(id),
  CHECK(num_nonnulls(approved_organization_id,approved_operation_id,approved_offering_id)>=1),
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  CHECK(status<>'approved' OR rights_evidence_version_id IS NOT NULL)
);
CREATE INDEX track_material_by_lesson_idx ON track_lesson_presentations(track_version_id,course_lesson_id);
CREATE INDEX track_reviews_by_version_idx ON instructional_track_reviews(track_version_id,review_kind,decided_at DESC);

-- 05. Stable deployments: each belongs to precisely one operation. No network FK.
CREATE TABLE program_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES education_operations(id),
  offering_id uuid NOT NULL REFERENCES offerings(id), code text NOT NULL, name text NOT NULL,
  status text NOT NULL DEFAULT 'planning'
    CHECK(status IN ('planning','review','authorized','active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
  UNIQUE(operation_id,code), UNIQUE(id,operation_id), UNIQUE(id,offering_id)
);

-- Blueprint execution provenance can yield a Deployment of an existing Offering.
CREATE TABLE blueprint_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blueprint_version_id uuid NOT NULL REFERENCES blueprint_versions(id),
  execution_batch_id uuid NOT NULL REFERENCES blueprint_execution_batches(id),
  configuration_version_id uuid NOT NULL, review_id uuid NOT NULL,
  operation_id uuid REFERENCES education_operations(id), offering_version_id uuid REFERENCES offering_versions(id),
  deployment_id uuid REFERENCES program_deployments(id),
  produced_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(configuration_version_id,blueprint_version_id)
    REFERENCES blueprint_configuration_versions(id,blueprint_version_id),
  FOREIGN KEY(review_id,configuration_version_id) REFERENCES configuration_reviews(id,configuration_version_id),
  FOREIGN KEY(execution_batch_id,configuration_version_id,blueprint_version_id,review_id)
    REFERENCES blueprint_execution_batches(id,configuration_version_id,blueprint_version_id,review_id),
  CHECK(num_nonnulls(operation_id,offering_version_id,deployment_id)=1),
  UNIQUE(execution_batch_id,operation_id), UNIQUE(execution_batch_id,offering_version_id),
  UNIQUE(execution_batch_id,deployment_id)
);
-- Outputs are produced only by an executed, approved, immutable recipe batch.
-- Idempotent retry should reuse the original batch by (executing_organization_id,idempotency_key).
CREATE OR REPLACE FUNCTION v301_guard_blueprint_output() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE b record;
BEGIN
 SELECT * INTO b FROM blueprint_execution_batches WHERE id=NEW.execution_batch_id FOR SHARE;
 IF NOT FOUND OR b.execution_status<>'executed' THEN
   RAISE EXCEPTION 'Blueprint output requires an executed batch';
 END IF;
 IF NEW.configuration_version_id<>b.configuration_version_id
     OR NEW.blueprint_version_id<>b.blueprint_version_id OR NEW.review_id<>b.review_id THEN
   RAISE EXCEPTION 'Blueprint output does not match its executed configuration and review';
 END IF;
 IF NEW.deployment_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM program_deployments d
   JOIN blueprint_configuration_versions cv ON cv.id=b.configuration_version_id
   JOIN blueprint_configurations c ON c.id=cv.configuration_id
   JOIN education_operation_organization_roles r ON r.operation_id=d.operation_id
     AND r.organization_id=b.executing_organization_id AND r.role_code='operator'
     AND r.status='approved' AND r.valid_from<=clock_timestamp()
     AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
   WHERE d.id=NEW.deployment_id
     AND (c.owning_organization_id IS NULL OR c.owning_organization_id=b.executing_organization_id)
 ) THEN
   RAISE EXCEPTION 'Blueprint Deployment output must belong to the executing organization';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER blueprint_output_execution_guard BEFORE INSERT ON blueprint_outputs
 FOR EACH ROW EXECUTE FUNCTION v301_guard_blueprint_output();
CREATE OR REPLACE FUNCTION v301_reject_blueprint_output_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Blueprint outputs are append-only'; END $$;
CREATE TRIGGER blueprint_output_append_only BEFORE UPDATE OR DELETE ON blueprint_outputs
 FOR EACH ROW EXECUTE FUNCTION v301_reject_blueprint_output_mutation();

CREATE TABLE deployment_offering_adoptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL,
  offering_id uuid NOT NULL, offering_version_id uuid NOT NULL,
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  approval_status text NOT NULL DEFAULT 'proposed'
    CHECK(approval_status IN ('proposed','approved','suspended','ended')),
  approved_by_person_id uuid REFERENCES persons(id), approved_at timestamptz,
  FOREIGN KEY(deployment_id,offering_id) REFERENCES program_deployments(id,offering_id),
  FOREIGN KEY(offering_version_id,offering_id) REFERENCES offering_versions(id,offering_id),
  UNIQUE(id,deployment_id), UNIQUE(id,offering_version_id), UNIQUE(id,deployment_id,offering_version_id),
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  CHECK(approval_status<>'approved' OR (approved_at IS NOT NULL AND approved_by_person_id IS NOT NULL)),
  EXCLUDE USING gist (deployment_id WITH =,offering_id WITH =,tstzrange(valid_from,valid_through,'[)') WITH &&)
   WHERE (approval_status='approved')
);
CREATE TABLE instructional_track_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid NOT NULL,
  adoption_id uuid NOT NULL,
  offering_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL,
  version_no integer NOT NULL CHECK(version_no>0),
  authoring_enabled boolean NOT NULL DEFAULT false,
  student_choice_enabled boolean NOT NULL DEFAULT false,
  practice_enabled boolean NOT NULL DEFAULT false,
  delivery_enabled boolean NOT NULL DEFAULT false,
  selection_policy text NOT NULL CHECK(selection_policy IN ('student','guardian')),
  allow_switching boolean NOT NULL DEFAULT false,
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  effective_from timestamptz NOT NULL,
  effective_through timestamptz,
  created_by_person_id uuid NOT NULL REFERENCES persons(id),
  published_by_person_id uuid REFERENCES persons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  FOREIGN KEY(adoption_id,deployment_id,offering_version_id)
    REFERENCES deployment_offering_adoptions(id,deployment_id,offering_version_id),
  FOREIGN KEY(offering_version_id,course_version_id)
    REFERENCES offering_courses(offering_version_id,course_version_id),
  UNIQUE(deployment_id,adoption_id,course_version_id,version_no),
  UNIQUE(id,course_version_id),
  EXCLUDE USING gist (
    deployment_id WITH =,
    adoption_id WITH =,
    course_version_id WITH =,
    tstzrange(effective_from,effective_through,'[)') WITH &&
  ) WHERE (lifecycle='published'),
  CHECK(effective_through IS NULL OR effective_through>effective_from),
  CHECK((lifecycle='published')=(published_at IS NOT NULL)),
  CHECK(lifecycle<>'published' OR published_by_person_id IS NOT NULL)
);
CREATE TABLE instructional_track_policy_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id uuid NOT NULL REFERENCES instructional_track_policy_versions(id),
  effective_at timestamptz NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason))>=10),
  authorized_by_person_id uuid NOT NULL REFERENCES persons(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(policy_version_id,effective_at)
);
CREATE TABLE deployment_organization_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
  organization_id uuid NOT NULL REFERENCES organizations(id), role_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'organization_role' CHECK(vocabulary_code='organization_role'),
  FOREIGN KEY(vocabulary_code,role_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  course_id uuid REFERENCES courses(id), site_id uuid REFERENCES sites(id),
  starts_at timestamptz NOT NULL, ends_at timestamptz,
  approval_status text NOT NULL DEFAULT 'proposed' CHECK(approval_status IN ('proposed','approved','suspended','ended')),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  CHECK(ends_at IS NULL OR ends_at>starts_at),
  UNIQUE(deployment_id,organization_id,role_code,starts_at)
);
CREATE TABLE deployment_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
  site_id uuid NOT NULL REFERENCES sites(id), purpose text NOT NULL DEFAULT 'instruction',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(deployment_id,site_id,purpose), UNIQUE(id,deployment_id), UNIQUE(id,site_id),
  UNIQUE(id,deployment_id,site_id)
);

CREATE TABLE shared_resource_pools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL REFERENCES sites(id),
 resource_code text NOT NULL, resource_kind text NOT NULL
  CHECK(resource_kind IN ('devices','seats','room','connectivity','equipment','staffing','other')),
 unit_code text NOT NULL DEFAULT 'units',
 verified_capacity numeric(14,3) NOT NULL CHECK(verified_capacity>=0),
 capacity_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 active boolean NOT NULL DEFAULT true,
 UNIQUE(site_id,resource_code)
);
CREATE TABLE shared_resource_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 pool_id uuid NOT NULL REFERENCES shared_resource_pools(id),
 deployment_id uuid NOT NULL REFERENCES program_deployments(id),
 session_reference text,
 reserved_from timestamptz NOT NULL, reserved_to timestamptz NOT NULL,
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','confirmed','released','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(reserved_to>reserved_from)
);
CREATE INDEX shared_resource_allocations_overlap
 ON shared_resource_allocations(pool_id,reserved_from,reserved_to)
 WHERE status IN ('reserved','confirmed');
CREATE OR REPLACE FUNCTION v30_guard_shared_resource_allocation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE max_units numeric; peak_units numeric; pool_site uuid;
BEGIN
 IF NEW.status NOT IN ('reserved','confirmed') THEN RETURN NEW; END IF;
 SELECT site_id,verified_capacity INTO pool_site,max_units FROM shared_resource_pools
 WHERE id=NEW.pool_id AND active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown or inactive resource pool'; END IF;
 IF NOT EXISTS(SELECT 1 FROM deployment_sites ds WHERE ds.deployment_id=NEW.deployment_id
     AND ds.site_id=pool_site) THEN
   RAISE EXCEPTION 'Resource pool must belong to the deployment site'; END IF;
 SELECT COALESCE(MAX((
   SELECT COALESCE(SUM(a.quantity),0) FROM shared_resource_allocations a
    WHERE a.pool_id=NEW.pool_id AND a.status IN ('reserved','confirmed')
     AND a.id IS DISTINCT FROM NEW.id
     AND a.reserved_from<=point.t AND a.reserved_to>point.t
  )),0) INTO peak_units
 FROM (
   SELECT NEW.reserved_from AS t
   UNION
   SELECT GREATEST(a.reserved_from,NEW.reserved_from) AS t
   FROM shared_resource_allocations a
   WHERE a.pool_id=NEW.pool_id AND a.status IN ('reserved','confirmed')
     AND a.id IS DISTINCT FROM NEW.id
     AND tstzrange(a.reserved_from,a.reserved_to,'[)') &&
         tstzrange(NEW.reserved_from,NEW.reserved_to,'[)')
 ) point;
 IF peak_units+NEW.quantity>max_units THEN
   RAISE EXCEPTION 'Shared resource allocation exceeds verified concurrent capacity'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shared_resource_capacity_gate
 BEFORE INSERT OR UPDATE ON shared_resource_allocations FOR EACH ROW
 EXECUTE FUNCTION v30_guard_shared_resource_allocation();
CREATE TABLE deployment_site_operating_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_site_id uuid NOT NULL REFERENCES deployment_sites(id),
  operating_organization_id uuid NOT NULL REFERENCES organizations(id),
  starts_at timestamptz NOT NULL, ends_at timestamptz,
  capacity integer CHECK(capacity IS NULL OR capacity>=0),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','suspended','ended')),
  operating_agreement_version_id uuid REFERENCES evidence_document_versions(id),
  CHECK(ends_at IS NULL OR ends_at>starts_at),
  UNIQUE(deployment_site_id,operating_organization_id,starts_at)
);
CREATE TABLE program_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
  code text NOT NULL, name text NOT NULL, starts_on date, ends_on date,
  capacity integer CHECK(capacity IS NULL OR capacity>=0),
  UNIQUE(deployment_id,code), UNIQUE(id,deployment_id),
  CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on)
);
CREATE TABLE delivery_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL,
  cohort_id uuid, deployment_site_id uuid, space_id uuid, site_id uuid,
  starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  modality text NOT NULL, modality_vocabulary_code text NOT NULL DEFAULT 'delivery_modality'
    CHECK(modality_vocabulary_code='delivery_modality'),
  FOREIGN KEY(modality_vocabulary_code,modality) REFERENCES vocabulary_terms(vocabulary_code,code),
  FOREIGN KEY(deployment_id) REFERENCES program_deployments(id),
  FOREIGN KEY(cohort_id,deployment_id) REFERENCES program_cohorts(id,deployment_id),
  FOREIGN KEY(deployment_site_id,deployment_id,site_id) REFERENCES deployment_sites(id,deployment_id,site_id),
  FOREIGN KEY(space_id,site_id) REFERENCES site_spaces(id,site_id),
  CHECK(ends_at>starts_at), CHECK(deployment_site_id IS NULL OR site_id IS NOT NULL),
  CHECK(space_id IS NULL OR deployment_site_id IS NOT NULL),
  CHECK(modality<>'onsite' OR deployment_site_id IS NOT NULL),
  UNIQUE(id,deployment_id),
  EXCLUDE USING gist (space_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
    WHERE (space_id IS NOT NULL)
);
CREATE TABLE course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL,
  adoption_id uuid NOT NULL, offering_version_id uuid NOT NULL,
  course_version_id uuid NOT NULL REFERENCES course_versions(id),
  cohort_id uuid, section_code text NOT NULL, title text NOT NULL,
  FOREIGN KEY(deployment_id) REFERENCES program_deployments(id),
  FOREIGN KEY(adoption_id,deployment_id,offering_version_id)
    REFERENCES deployment_offering_adoptions(id,deployment_id,offering_version_id),
  FOREIGN KEY(offering_version_id,course_version_id) REFERENCES offering_courses(offering_version_id,course_version_id),
  FOREIGN KEY(cohort_id,deployment_id) REFERENCES program_cohorts(id,deployment_id),
  UNIQUE(deployment_id,section_code), UNIQUE(id,deployment_id),
  UNIQUE(id,course_version_id),
  UNIQUE(id,deployment_id,course_version_id),
  UNIQUE(id,deployment_id,course_version_id,adoption_id)
);
CREATE TABLE staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
  section_id uuid, person_id uuid NOT NULL REFERENCES persons(id), role_code text NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz,
  FOREIGN KEY(section_id,deployment_id) REFERENCES course_sections(id,deployment_id),
  UNIQUE(id,deployment_id), CHECK(ends_at IS NULL OR ends_at>starts_at),
  exclusive_scheduled_coverage boolean NOT NULL DEFAULT true,
  EXCLUDE USING gist (person_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&)
   WHERE (exclusive_scheduled_coverage)
);
CREATE TABLE session_staff (
  session_id uuid NOT NULL, deployment_id uuid NOT NULL, assignment_id uuid NOT NULL,
  PRIMARY KEY(session_id,assignment_id),
  FOREIGN KEY(session_id,deployment_id) REFERENCES delivery_sessions(id,deployment_id),
  FOREIGN KEY(assignment_id,deployment_id) REFERENCES staff_assignments(id,deployment_id)
);

CREATE TABLE professional_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES persons(id),
  appointing_organization_id uuid NOT NULL REFERENCES organizations(id),
  role_code text NOT NULL, organization_id uuid REFERENCES organizations(id),
  operation_id uuid REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id), section_id uuid REFERENCES course_sections(id),
  learner_id uuid REFERENCES learner_profiles(id), course_id uuid REFERENCES courses(id),
  offering_id uuid REFERENCES offerings(id),
  capability_authorization_id uuid, capability_id uuid,
  begins_at timestamptz NOT NULL, ends_at timestamptz,
  state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','approved','suspended','ended')),
  authority_evidence_id uuid REFERENCES evidence_document_versions(id),
  FOREIGN KEY(capability_authorization_id,person_id,capability_id)
    REFERENCES professional_capability_authorizations(id,person_id,capability_id),
  CHECK(ends_at IS NULL OR ends_at>begins_at),
  CHECK(num_nonnulls(organization_id,operation_id,deployment_id,section_id,learner_id,course_id,offering_id)>=1),
  CHECK((capability_authorization_id IS NULL)=(capability_id IS NULL)),
  UNIQUE(id,person_id)
);
CREATE INDEX professional_authorizations_by_person_idx ON professional_capability_authorizations(person_id,decision,valid_from);
CREATE INDEX professional_roles_by_person_idx ON professional_role_assignments(person_id,begins_at DESC);

-- 06. Learner participation. Adults have no guardian/household dependency.
CREATE TABLE enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  deployment_id uuid NOT NULL REFERENCES program_deployments(id),
  cohort_id uuid, enrolled_at timestamptz NOT NULL DEFAULT now(), exited_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','completed','withdrawn','cancelled')),
  FOREIGN KEY(cohort_id,deployment_id) REFERENCES program_cohorts(id,deployment_id),
  UNIQUE(id,deployment_id), UNIQUE(id,deployment_id,learner_id),
  CHECK(exited_at IS NULL OR exited_at>=enrolled_at)
);
CREATE TABLE enrollment_site_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL,
  deployment_id uuid NOT NULL, deployment_site_id uuid NOT NULL,
  starts_at timestamptz NOT NULL, ends_at timestamptz, purpose text NOT NULL,
  FOREIGN KEY(enrollment_id,deployment_id) REFERENCES enrollments(id,deployment_id),
  FOREIGN KEY(deployment_site_id,deployment_id) REFERENCES deployment_sites(id,deployment_id),
  CHECK(ends_at IS NULL OR ends_at>starts_at),
  UNIQUE(enrollment_id,deployment_site_id,starts_at)
);
CREATE TABLE enrollment_referral_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL REFERENCES enrollments(id),
  source_organization_id uuid REFERENCES organizations(id), source_network_id uuid REFERENCES education_networks(id),
  source_description text, recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(source_organization_id,source_network_id,source_description)=1)
);
CREATE TABLE learner_course_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid,
  noncredit_registration_id uuid,
  deployment_id uuid NOT NULL, adoption_id uuid NOT NULL,
  offering_version_id uuid NOT NULL, course_version_id uuid NOT NULL REFERENCES course_versions(id),
  section_id uuid, attempt_no integer NOT NULL CHECK(attempt_no>0),
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('planned','active','completed','withdrawn')),
  FOREIGN KEY(enrollment_id,deployment_id) REFERENCES enrollments(id,deployment_id),
  FOREIGN KEY(adoption_id,deployment_id,offering_version_id)
    REFERENCES deployment_offering_adoptions(id,deployment_id,offering_version_id),
  FOREIGN KEY(offering_version_id,course_version_id) REFERENCES offering_courses(offering_version_id,course_version_id),
  FOREIGN KEY(section_id,deployment_id,course_version_id,adoption_id)
    REFERENCES course_sections(id,deployment_id,course_version_id,adoption_id),
  UNIQUE(enrollment_id,course_version_id,attempt_no),
  UNIQUE(noncredit_registration_id,course_version_id,attempt_no),
  UNIQUE(id,course_version_id), UNIQUE(id,enrollment_id),
  CHECK(num_nonnulls(enrollment_id,noncredit_registration_id)=1),
  CHECK(noncredit_registration_id IS NULL OR section_id IS NULL),
  CHECK(completed_at IS NULL OR completed_at>=started_at)
);
CREATE TABLE learner_unit_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid NOT NULL,
  course_version_id uuid NOT NULL, course_unit_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('not_started','in_progress','completed','waived')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(course_attempt_id,course_version_id)
    REFERENCES learner_course_attempts(id,course_version_id),
  FOREIGN KEY(course_unit_id,course_version_id) REFERENCES course_units(id,course_version_id),
  UNIQUE(course_attempt_id,course_unit_id)
);
CREATE TABLE learner_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid NOT NULL,
  course_version_id uuid NOT NULL, lesson_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('not_started','in_progress','completed','waived')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(course_attempt_id,course_version_id)
    REFERENCES learner_course_attempts(id,course_version_id),
  FOREIGN KEY(lesson_id,course_version_id) REFERENCES course_lessons(id,course_version_id),
  UNIQUE(course_attempt_id,lesson_id)
);
CREATE TABLE learner_track_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid NOT NULL,
  course_version_id uuid NOT NULL, track_version_id uuid NOT NULL,
  policy_version_id uuid NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  selected_at timestamptz NOT NULL, superseded_at timestamptz,
  FOREIGN KEY(course_attempt_id,course_version_id)
    REFERENCES learner_course_attempts(id,course_version_id),
  FOREIGN KEY(track_version_id,course_version_id)
    REFERENCES instructional_track_versions(id,course_version_id),
  FOREIGN KEY(policy_version_id,course_version_id)
    REFERENCES instructional_track_policy_versions(id,course_version_id),
  selected_by_person_id uuid REFERENCES persons(id),
  selection_source text NOT NULL DEFAULT 'learner'
    CHECK(selection_source IN ('learner','guardian','institutional_default','authorized_assistance')),
  switch_reason text,
  CHECK(superseded_at IS NULL OR superseded_at>selected_at),
  UNIQUE(course_attempt_id,selected_at),
  UNIQUE(course_attempt_id,revision)
);
CREATE UNIQUE INDEX learner_one_active_primary_track
  ON learner_track_selections(course_attempt_id) WHERE superseded_at IS NULL;
CREATE TABLE formative_practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid NOT NULL,
  course_version_id uuid NOT NULL, track_version_id uuid,
  policy_version_id uuid,
  course_unit_id uuid NOT NULL,
  score_numeric numeric(8,3), recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(course_attempt_id,course_version_id)
    REFERENCES learner_course_attempts(id,course_version_id),
  FOREIGN KEY(track_version_id,course_version_id)
    REFERENCES instructional_track_versions(id,course_version_id),
  FOREIGN KEY(policy_version_id,course_version_id)
    REFERENCES instructional_track_policy_versions(id,course_version_id),
  FOREIGN KEY(course_unit_id,course_version_id)
    REFERENCES course_units(id,course_version_id),
  CHECK((track_version_id IS NULL)=(policy_version_id IS NULL))
);
CREATE OR REPLACE FUNCTION validate_formative_practice_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 NEW.recorded_at:=clock_timestamp();
 IF NEW.track_version_id IS NULL THEN RETURN NEW; END IF;
 IF NOT EXISTS (
   SELECT 1
   FROM learner_course_attempts ca
   JOIN instructional_track_policy_versions p
     ON p.id=NEW.policy_version_id
    AND p.adoption_id=ca.adoption_id
    AND p.deployment_id=ca.deployment_id
    AND p.offering_version_id=ca.offering_version_id
    AND p.course_version_id=ca.course_version_id
   JOIN instructional_track_versions tv
     ON tv.id=NEW.track_version_id AND tv.course_version_id=ca.course_version_id
   WHERE ca.id=NEW.course_attempt_id
     AND p.lifecycle='published' AND p.practice_enabled AND p.delivery_enabled
     AND p.effective_from<=NEW.recorded_at
     AND (p.effective_through IS NULL OR p.effective_through>NEW.recorded_at)
     AND NOT EXISTS(SELECT 1 FROM instructional_track_policy_withdrawals pw
       WHERE pw.policy_version_id=p.id AND pw.effective_at<=NEW.recorded_at)
     AND tv.lifecycle='published'
     AND NOT EXISTS(SELECT 1 FROM content_withdrawals w
       WHERE w.track_version_id=tv.id
         AND w.effective_at<=NEW.recorded_at
         AND (w.withdrawal_kind<>'routine_retirement'
           OR w.legacy_access_until IS NULL
           OR w.legacy_access_until<=NEW.recorded_at))
     AND v301_track_distribution_allowed(tv.id,ca.deployment_id,NEW.recorded_at)
 ) THEN
   RAISE EXCEPTION 'Formative practice requires current published policy, eligible track and distribution authorization';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER formative_practice_eligibility
 BEFORE INSERT ON formative_practice_attempts
 FOR EACH ROW EXECUTE FUNCTION validate_formative_practice_attempt();
-- Assessments can be course-owned official work or standalone placement/readiness examinations.
CREATE TABLE assessment_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_organization_id uuid NOT NULL REFERENCES organizations(id),
  assessment_key text NOT NULL, title text NOT NULL,
  purpose text NOT NULL CHECK(purpose IN ('official','diagnostic','placement','readiness',
    'foundation','formative','mastery','credential','practice')),
  course_id uuid REFERENCES courses(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  UNIQUE(owner_organization_id,assessment_key), UNIQUE(id,course_id),
  CHECK(purpose<>'official' OR course_id IS NOT NULL)
);
CREATE TABLE assessment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessment_definitions(id),
  course_version_id uuid REFERENCES course_versions(id),
  assessment_key text NOT NULL, version_no integer NOT NULL CHECK(version_no>0),
  blueprint jsonb NOT NULL DEFAULT '{}'::jsonb,
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  published_at timestamptz,
  UNIQUE(assessment_id,version_no), UNIQUE(id,assessment_id), UNIQUE(id,course_version_id),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
-- Course-level academic requirements are independent of creator tracks and supplements.
CREATE TABLE official_course_requirement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_version_id uuid NOT NULL REFERENCES course_versions(id),
  requirement_key text NOT NULL, requirement_kind text NOT NULL
    CHECK(requirement_kind IN ('lesson','homework','assessment','project','credit','competency','completion')),
  mandatory boolean NOT NULL DEFAULT true, requirement_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(id,course_version_id), UNIQUE(course_version_id,requirement_key)
);
CREATE TABLE official_course_assignment_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_version_id uuid NOT NULL REFERENCES course_versions(id),
  assignment_key text NOT NULL, official_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb,
  required boolean NOT NULL DEFAULT true, weight numeric(8,4) CHECK(weight IS NULL OR weight>=0),
  UNIQUE(id,course_version_id), UNIQUE(course_version_id,assignment_key)
);
CREATE TABLE course_grading_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_version_id uuid NOT NULL REFERENCES course_versions(id),
  policy_key text NOT NULL, policy_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_from timestamptz, approved_by_person_id uuid REFERENCES persons(id),
  UNIQUE(id,course_version_id), UNIQUE(course_version_id,policy_key)
);

CREATE TABLE graded_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), section_id uuid,
  course_version_id uuid NOT NULL REFERENCES course_versions(id),
  FOREIGN KEY(section_id,course_version_id) REFERENCES course_sections(id,course_version_id),
  assessment_version_id uuid, official_assignment_version_id uuid NOT NULL,
  assignment_key text NOT NULL, due_at timestamptz,
  version_no integer NOT NULL CHECK(version_no>0), assignment_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(assessment_version_id,course_version_id)
    REFERENCES assessment_versions(id,course_version_id),
  FOREIGN KEY(official_assignment_version_id,course_version_id)
    REFERENCES official_course_assignment_versions(id,course_version_id),
  UNIQUE(id,course_version_id), UNIQUE(course_version_id,assignment_key,version_no)
);
CREATE TABLE graded_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid NOT NULL,
  course_version_id uuid NOT NULL, assignment_id uuid NOT NULL,
  submitted_at timestamptz, status text NOT NULL DEFAULT 'assigned'
    CHECK(status IN ('assigned','submitted','returned','graded')),
  response jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(course_attempt_id,course_version_id)
    REFERENCES learner_course_attempts(id,course_version_id),
  FOREIGN KEY(assignment_id,course_version_id)
    REFERENCES graded_assignments(id,course_version_id),
  UNIQUE(course_attempt_id,assignment_id), UNIQUE(id,course_version_id)
);
CREATE TABLE official_course_grades (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_attempt_id uuid NOT NULL REFERENCES learner_course_attempts(id),
 issuer_organization_id uuid NOT NULL REFERENCES organizations(id),
 grade_value text NOT NULL, grade_points numeric(6,3),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized','corrected')),
 finalized_at timestamptz, finalized_by_person_id uuid REFERENCES persons(id),
 authority_assignment_id uuid,
 corrected_from_id uuid REFERENCES official_course_grades(id),
 FOREIGN KEY(authority_assignment_id,finalized_by_person_id)
   REFERENCES professional_role_assignments(id,person_id),
 UNIQUE(id,course_attempt_id,issuer_organization_id),
 UNIQUE(corrected_from_id),
 CHECK(corrected_from_id IS DISTINCT FROM id),
 CHECK(status='draft' OR (finalized_at IS NOT NULL AND finalized_by_person_id IS NOT NULL AND authority_assignment_id IS NOT NULL)),
 CHECK(status<>'draft' OR (finalized_at IS NULL AND finalized_by_person_id IS NULL AND authority_assignment_id IS NULL))
);
CREATE UNIQUE INDEX official_course_grades_one_final_root
  ON official_course_grades(course_attempt_id,issuer_organization_id)
  WHERE status='finalized' AND corrected_from_id IS NULL;
-- Only an explicitly authorized, independent assessor can issue grading decisions.
CREATE TABLE grading_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grader_person_id uuid NOT NULL REFERENCES persons(id),
  appointing_organization_id uuid NOT NULL REFERENCES organizations(id),
  course_version_id uuid NOT NULL REFERENCES course_versions(id),
  operation_id uuid REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  section_id uuid, capability_authorization_id uuid,
  capability_id uuid,
  starts_at timestamptz NOT NULL, ends_at timestamptz,
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','suspended','ended')),
  FOREIGN KEY(section_id,deployment_id,course_version_id) REFERENCES course_sections(id,deployment_id,course_version_id),
  FOREIGN KEY(capability_authorization_id,grader_person_id,capability_id)
    REFERENCES professional_capability_authorizations(id,person_id,capability_id),
  CHECK(num_nonnulls(operation_id,deployment_id,section_id)>=1),
  CHECK(ends_at IS NULL OR ends_at>starts_at),
  CHECK(section_id IS NULL OR deployment_id IS NOT NULL),
  CHECK((capability_authorization_id IS NULL)=(capability_id IS NULL)),
  UNIQUE(id,course_version_id), UNIQUE(id,grader_person_id)
);
CREATE TABLE grading_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 graded_submission_id uuid NOT NULL, course_version_id uuid NOT NULL,
 FOREIGN KEY(graded_submission_id,course_version_id) REFERENCES graded_submissions(id,course_version_id),
 grading_assignment_id uuid NOT NULL, grader_person_id uuid NOT NULL,
 course_grading_policy_version_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('accepted','returned','graded','corrected','voided')),
 score numeric(12,5), grade_feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 supersedes_decision_id uuid REFERENCES grading_decisions(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 FOREIGN KEY(grading_assignment_id,course_version_id) REFERENCES grading_assignments(id,course_version_id),
 FOREIGN KEY(grading_assignment_id,grader_person_id) REFERENCES grading_assignments(id,grader_person_id),
 FOREIGN KEY(course_grading_policy_version_id,course_version_id)
   REFERENCES course_grading_policy_versions(id,course_version_id),
 CHECK(decision NOT IN ('graded','corrected') OR score IS NOT NULL),
 CHECK(supersedes_decision_id IS DISTINCT FROM id), UNIQUE(supersedes_decision_id)
);

-- 08A. Canonical assessment authoring, administration, attempts, scoring, and mastery.
-- Published course requirements and official grading stay independent of recorded teachers.
-- `assessment_versions` is the canonical definition release, not an attempt/session.
CREATE TABLE assessment_version_review_decisions (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','independent','psychometric')),
  decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE assessment_item_banks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_organization_id uuid NOT NULL REFERENCES organizations(id),
  bank_code text NOT NULL, title text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'general' CHECK(scope_kind IN ('general','course','institution','credential')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  UNIQUE(owner_organization_id, bank_code)
);
CREATE TABLE assessment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id uuid NOT NULL REFERENCES assessment_item_banks(id),
  item_key text NOT NULL, title text NOT NULL,
  created_by_person_id uuid REFERENCES persons(id),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
  UNIQUE(bank_id,item_key)
);
CREATE TABLE assessment_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES assessment_items(id),
  version_no integer NOT NULL CHECK(version_no>0),
  response_kind text NOT NULL CHECK(response_kind IN
   ('single_select','multi_select','true_false','short_text','essay','numeric','math_expression',
    'matching','ordering','audio_response','audio_listening','video_response','file_upload',
    'practical','oral','portfolio','other')),
  item_prompt jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  rubric_public jsonb NOT NULL DEFAULT '{}'::jsonb,
  maximum_points numeric(12,4) NOT NULL DEFAULT 1 CHECK(maximum_points>0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  published_at timestamptz,
  UNIQUE(item_id,version_no), UNIQUE(id,item_id),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
-- Normalized answers for objectively keyed choice-based questions; the answer key is separate.
CREATE TABLE assessment_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL REFERENCES assessment_item_versions(id),
  option_key text NOT NULL, ordinal integer NOT NULL CHECK(ordinal>0),
  display_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_version_id uuid REFERENCES content_asset_versions(id),
  UNIQUE(item_version_id,option_key), UNIQUE(item_version_id,ordinal),
  UNIQUE(id,item_version_id)
);
CREATE TABLE assessment_item_secure_keys (
  item_version_id uuid PRIMARY KEY REFERENCES assessment_item_versions(id),
  encrypted_key bytea NOT NULL, encryption_key_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assessment_item_assets (
  item_version_id uuid NOT NULL REFERENCES assessment_item_versions(id),
  asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
  asset_role text NOT NULL CHECK(asset_role IN ('stimulus','passage','listening','diagram','accessible_alternative')),
  PRIMARY KEY(item_version_id,asset_version_id,asset_role)
);
CREATE TABLE competencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 competency_code text NOT NULL, name text NOT NULL, definition text,
 UNIQUE(owner_organization_id,competency_code), UNIQUE(id,owner_organization_id)
);

-- Canonical framework identity and immutable revisions; no parallel framework_code on competencies.
CREATE TABLE academic_frameworks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 steward_organization_id uuid NOT NULL REFERENCES organizations(id),
 framework_code text NOT NULL, name text NOT NULL,
 framework_kind text NOT NULL DEFAULT 'academic' CHECK (framework_kind IN ('academic','workforce','certification','cross_disciplinary')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
 UNIQUE (steward_organization_id,framework_code)
);
CREATE TABLE academic_framework_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 framework_id uuid NOT NULL REFERENCES academic_frameworks(id),
 version_no integer NOT NULL CHECK (version_no>0),
 description text, provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','published')),
 published_at timestamptz, supersedes_id uuid REFERENCES academic_framework_versions(id),
 UNIQUE (framework_id,version_no), UNIQUE (id,framework_id),
 CHECK ((lifecycle='published')=(published_at IS NOT NULL)),
 CHECK (supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE competency_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competency_id uuid NOT NULL REFERENCES competencies(id),
 version_no integer NOT NULL CHECK(version_no>0),
 title text NOT NULL, measurable_outcome text NOT NULL,
 performance_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
 domain_tags text[] NOT NULL DEFAULT '{}'::text[],
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz,
 supersedes_id uuid REFERENCES competency_versions(id),
 UNIQUE (competency_id,version_no), UNIQUE (id,competency_id),
 CHECK ((lifecycle='published')=(published_at IS NOT NULL)),
 CHECK (supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE competency_version_withdrawals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 withdrawn_by_person_id uuid NOT NULL REFERENCES persons(id),
 reason text NOT NULL, effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(competency_version_id,effective_at)
);
CREATE TABLE academic_framework_version_competencies (
 framework_version_id uuid NOT NULL REFERENCES academic_framework_versions(id),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 sequence_no integer NOT NULL CHECK (sequence_no>0),
 required boolean NOT NULL DEFAULT true,
 curator_approval_document_version_id uuid REFERENCES evidence_document_versions(id),
 PRIMARY KEY (framework_version_id,competency_version_id),
 UNIQUE (framework_version_id,sequence_no)
);
CREATE TABLE framework_competency_reuse_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 framework_id uuid NOT NULL REFERENCES academic_frameworks(id),
 competency_id uuid NOT NULL REFERENCES competencies(id),
 authorizing_organization_id uuid NOT NULL REFERENCES organizations(id),
 evidence_document_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','revoked','expired')),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 UNIQUE(framework_id,competency_id,valid_from)
);
CREATE TABLE assessment_item_competencies (
 item_version_id uuid NOT NULL REFERENCES assessment_item_versions(id),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 coverage_weight numeric(7,4) NOT NULL DEFAULT 1 CHECK(coverage_weight>0),
 PRIMARY KEY(item_version_id,competency_version_id)
);
CREATE TABLE assessment_item_review_decisions (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_version_id uuid NOT NULL REFERENCES assessment_item_versions(id),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','psychometric','safety')),
  decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  notes jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- The published form is what defines the exam questions and selection policy;
-- individual attempts retain an exact snapshot of the questions actually served.
CREATE TABLE assessment_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES assessment_definitions(id),
  form_key text NOT NULL, title text NOT NULL,
  UNIQUE(assessment_id,form_key), UNIQUE(id,assessment_id)
);
CREATE TABLE assessment_form_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL, assessment_id uuid NOT NULL,
  assessment_version_id uuid NOT NULL,
  version_no integer NOT NULL CHECK(version_no>0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
  published_at timestamptz,
  time_limit_minutes integer CHECK(time_limit_minutes IS NULL OR time_limit_minutes>0),
  passing_fraction numeric(6,5) CHECK(passing_fraction IS NULL OR (passing_fraction BETWEEN 0 AND 1)),
  shuffle_questions boolean NOT NULL DEFAULT false,
  scoring_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(form_id,assessment_id) REFERENCES assessment_forms(id,assessment_id),
  FOREIGN KEY(assessment_version_id,assessment_id) REFERENCES assessment_versions(id,assessment_id),
  UNIQUE(form_id,version_no), UNIQUE(id,assessment_version_id),
  CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE assessment_form_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_version_id uuid NOT NULL REFERENCES assessment_form_versions(id),
  section_key text NOT NULL, title text NOT NULL, ordinal integer NOT NULL CHECK(ordinal>0),
  selection_mode text NOT NULL DEFAULT 'fixed' CHECK(selection_mode IN ('fixed','random_pool')),
  selection_count integer CHECK(selection_count IS NULL OR selection_count>0),
  shuffle_within_section boolean NOT NULL DEFAULT false,
  UNIQUE(form_version_id,section_key), UNIQUE(form_version_id,ordinal),
  UNIQUE(id,form_version_id),
  CHECK((selection_mode='fixed' AND selection_count IS NULL)
    OR (selection_mode='random_pool' AND selection_count IS NOT NULL))
);
CREATE TABLE assessment_form_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_version_id uuid NOT NULL, form_section_id uuid NOT NULL,
  item_version_id uuid NOT NULL REFERENCES assessment_item_versions(id),
  position integer NOT NULL CHECK(position>0),
  points_override numeric(12,4) CHECK(points_override IS NULL OR points_override>0),
  FOREIGN KEY(form_section_id,form_version_id) REFERENCES assessment_form_sections(id,form_version_id),
  UNIQUE(form_section_id,item_version_id), UNIQUE(form_section_id,position),
  UNIQUE(id,form_version_id,item_version_id)
);
CREATE TABLE assessment_form_review_decisions (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_version_id uuid NOT NULL REFERENCES assessment_form_versions(id),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','psychometric','independent')),
  decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- A diagnostic or placement administration needs no course / section / enrollment.
-- Official course assessments MUST be pinned to their published course version.
CREATE TABLE assessment_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administering_organization_id uuid NOT NULL REFERENCES organizations(id),
  assessment_version_id uuid NOT NULL REFERENCES assessment_versions(id),
  form_version_id uuid NOT NULL,
  FOREIGN KEY(form_version_id,assessment_version_id)
    REFERENCES assessment_form_versions(id,assessment_version_id),
  operation_id uuid REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  course_version_id uuid REFERENCES course_versions(id),
  administration_code text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','open','paused','closed','cancelled')),
  opens_at timestamptz, closes_at timestamptz,
  attempt_limit integer NOT NULL DEFAULT 1 CHECK(attempt_limit>0),
  time_limit_override_minutes integer CHECK(time_limit_override_minutes IS NULL OR time_limit_override_minutes>0),
  proctor_policy text NOT NULL DEFAULT 'none' CHECK(proctor_policy IN ('none','live','onsite','remote','external')),
  permitted_modes text[] NOT NULL DEFAULT ARRAY['online']::text[],
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(closes_at IS NULL OR opens_at IS NULL OR closes_at>opens_at),
  UNIQUE(id,form_version_id), UNIQUE(id,assessment_version_id),
  UNIQUE(administering_organization_id,administration_code)
);
CREATE TABLE assessment_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administration_id uuid NOT NULL REFERENCES assessment_administrations(id),
  learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  course_attempt_id uuid REFERENCES learner_course_attempts(id),
  granted_by_person_id uuid NOT NULL REFERENCES persons(id),
  valid_from timestamptz NOT NULL DEFAULT now(), valid_through timestamptz,
  access_status text NOT NULL DEFAULT 'approved' CHECK(access_status IN ('pending','approved','revoked')),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  UNIQUE(id,administration_id,learner_id), UNIQUE NULLS NOT DISTINCT (administration_id,learner_id,course_attempt_id)
);
CREATE TABLE assessment_accommodation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_grant_id uuid NOT NULL REFERENCES assessment_access_grants(id),
  revision_no integer NOT NULL CHECK(revision_no>0),
  extra_minutes integer NOT NULL DEFAULT 0 CHECK(extra_minutes>=0),
  extra_attempts integer NOT NULL DEFAULT 0 CHECK(extra_attempts>=0),
  adjustment_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_status text NOT NULL CHECK(approval_status IN ('approved','rejected','revoked')),
  approved_by_person_id uuid NOT NULL REFERENCES persons(id),
  decision_at timestamptz NOT NULL DEFAULT now(),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  UNIQUE(access_grant_id,revision_no)
);
CREATE TABLE assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_grant_id uuid NOT NULL,
  administration_id uuid NOT NULL, learner_id uuid NOT NULL,
  form_version_id uuid NOT NULL,
  attempt_no integer NOT NULL CHECK(attempt_no>0),
  state text NOT NULL DEFAULT 'prepared'
    CHECK(state IN ('prepared','in_progress','submitted','scored','finalized','voided')),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz, submitted_at timestamptz,
  expires_at timestamptz, selection_seed bigint NOT NULL,
  selection_algorithm_version text NOT NULL DEFAULT 'v1',
  accommodation_decision_id uuid REFERENCES assessment_accommodation_decisions(id),
  request_key text NOT NULL,
  FOREIGN KEY(access_grant_id,administration_id,learner_id)
    REFERENCES assessment_access_grants(id,administration_id,learner_id),
  FOREIGN KEY(administration_id,form_version_id)
    REFERENCES assessment_administrations(id,form_version_id),
  UNIQUE(access_grant_id,attempt_no), UNIQUE(access_grant_id,request_key),
  UNIQUE(id,form_version_id), UNIQUE(id,access_grant_id),
  CHECK((state='prepared' AND started_at IS NULL) OR (state<>'prepared' AND started_at IS NOT NULL)),
  CHECK(submitted_at IS NULL OR (started_at IS NOT NULL AND submitted_at>=started_at)),
  CHECK(expires_at IS NULL OR (started_at IS NOT NULL AND expires_at>started_at))
);
CREATE TABLE assessment_attempt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL, form_version_id uuid NOT NULL,
  form_item_id uuid NOT NULL, item_version_id uuid NOT NULL,
  question_number integer NOT NULL CHECK(question_number>0),
  points_available numeric(12,4) NOT NULL CHECK(points_available>0),
  FOREIGN KEY(attempt_id,form_version_id) REFERENCES assessment_attempts(id,form_version_id),
  FOREIGN KEY(form_item_id,form_version_id,item_version_id)
    REFERENCES assessment_form_items(id,form_version_id,item_version_id),
  UNIQUE(attempt_id,question_number), UNIQUE(attempt_id,form_item_id),
  UNIQUE(id,attempt_id), UNIQUE(id,item_version_id)
);
CREATE TABLE assessment_response_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_item_id uuid NOT NULL REFERENCES assessment_attempt_items(id),
  revision_no integer NOT NULL CHECK(revision_no>0),
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_state text NOT NULL CHECK(response_state IN ('saved','submitted')),
  client_request_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_item_id,revision_no), UNIQUE(attempt_item_id,client_request_id),
  UNIQUE(id,attempt_item_id)
);
CREATE TABLE assessment_response_choices (
  response_version_id uuid NOT NULL, attempt_item_id uuid NOT NULL,
  item_version_id uuid NOT NULL, option_id uuid NOT NULL,
  answer_position integer NOT NULL CHECK(answer_position>0),
  FOREIGN KEY(response_version_id,attempt_item_id)
    REFERENCES assessment_response_versions(id,attempt_item_id),
  FOREIGN KEY(attempt_item_id,item_version_id)
    REFERENCES assessment_attempt_items(id,item_version_id),
  FOREIGN KEY(option_id,item_version_id)
    REFERENCES assessment_item_options(id,item_version_id),
  PRIMARY KEY(response_version_id,option_id),
  UNIQUE(response_version_id,answer_position)
);
CREATE TABLE assessment_response_assets (
  response_version_id uuid NOT NULL REFERENCES assessment_response_versions(id),
  asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
  PRIMARY KEY(response_version_id,asset_version_id)
);
CREATE TABLE assessment_scoring_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  administration_id uuid NOT NULL REFERENCES assessment_administrations(id),
  grader_person_id uuid NOT NULL REFERENCES persons(id),
  appointing_organization_id uuid NOT NULL REFERENCES organizations(id),
  capability_authorization_id uuid NOT NULL,
  capability_id uuid NOT NULL,
  begins_at timestamptz NOT NULL, ends_at timestamptz,
  status text NOT NULL DEFAULT 'approved' CHECK(status IN ('proposed','approved','suspended','ended')),
  FOREIGN KEY(capability_authorization_id,grader_person_id,capability_id)
    REFERENCES professional_capability_authorizations(id,person_id,capability_id),
  CHECK(ends_at IS NULL OR ends_at>begins_at),
  UNIQUE(id,administration_id), UNIQUE(id,grader_person_id)
);
CREATE TABLE assessment_item_scoring_decisions (
  decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_item_id uuid NOT NULL REFERENCES assessment_attempt_items(id),
  response_version_id uuid NOT NULL,
  scoring_kind text NOT NULL CHECK(scoring_kind IN ('automated','human')),
  scoring_assignment_id uuid REFERENCES assessment_scoring_assignments(id),
  grader_person_id uuid REFERENCES persons(id),
  scoring_engine_version text,
  score numeric(12,4) NOT NULL CHECK(score>=0),
  rubric_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  scored_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id uuid REFERENCES assessment_item_scoring_decisions(id),
  FOREIGN KEY(response_version_id,attempt_item_id)
    REFERENCES assessment_response_versions(id,attempt_item_id),
  FOREIGN KEY(scoring_assignment_id,grader_person_id)
    REFERENCES assessment_scoring_assignments(id,grader_person_id),
  CHECK((scoring_kind='human' AND scoring_assignment_id IS NOT NULL
     AND grader_person_id IS NOT NULL AND scoring_engine_version IS NULL)
     OR (scoring_kind='automated' AND scoring_assignment_id IS NULL
     AND grader_person_id IS NULL AND scoring_engine_version IS NOT NULL)),
  UNIQUE(id,attempt_item_id)
);
CREATE TABLE assessment_attempt_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES assessment_attempts(id),
  result_revision integer NOT NULL CHECK(result_revision>0),
  result_status text NOT NULL CHECK(result_status IN ('provisional','reviewed','finalized','voided')),
  points_earned numeric(12,4) NOT NULL CHECK(points_earned>=0),
  points_possible numeric(12,4) NOT NULL CHECK(points_possible>0),
  outcome text CHECK(outcome IN ('pass','fail','inconclusive')),
  reviewed_by_person_id uuid REFERENCES persons(id),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  supersedes_id uuid REFERENCES assessment_attempt_results(id),
  result_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(attempt_id,result_revision), UNIQUE(id,attempt_id),
  CHECK(points_earned<=points_possible)
);
-- The existing official submission/independent-grader path remains authoritative.
-- This link selects an assessment result for official adoption only after grading.
CREATE TABLE official_assessment_result_adoptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_result_id uuid NOT NULL REFERENCES assessment_attempt_results(id),
  graded_submission_id uuid NOT NULL REFERENCES graded_submissions(id),
  grading_decision_id uuid NOT NULL REFERENCES grading_decisions(id),
  adopted_by_person_id uuid NOT NULL REFERENCES persons(id),
  adopted_at timestamptz NOT NULL DEFAULT now(),
  supersedes_adoption_id uuid REFERENCES official_assessment_result_adoptions(id),
  UNIQUE(assessment_result_id), UNIQUE(grading_decision_id),
  UNIQUE(supersedes_adoption_id), CHECK(supersedes_adoption_id IS NULL OR supersedes_adoption_id<>id)
);
CREATE TABLE assessment_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES assessment_attempts(id),
  event_kind text NOT NULL CHECK(event_kind IN ('proctor_flag','integrity_flag','appeal','regrade_request',
    'regrade_decision','retake_approval','void','correction')),
  recorded_by_person_id uuid NOT NULL REFERENCES persons(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_version_id uuid REFERENCES evidence_document_versions(id)
);
CREATE TABLE learner_competency_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id uuid NOT NULL REFERENCES learner_profiles(id),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 assessment_result_id uuid NOT NULL REFERENCES assessment_attempt_results(id),
 assessment_item_scoring_decision_id uuid REFERENCES assessment_item_scoring_decisions(id),
 evidence_level text NOT NULL CHECK(evidence_level IN ('observed','developing','demonstrated','mastered')),
 validated_by_person_id uuid REFERENCES persons(id),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_context_code text,
 evaluator_policy_reference text,
 evidence_details jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE NULLS NOT DISTINCT (learner_id,competency_version_id,assessment_result_id,assessment_item_scoring_decision_id),
 UNIQUE(id,learner_id,competency_version_id)
);
CREATE INDEX assessment_item_bank_idx ON assessment_items(bank_id);
CREATE INDEX assessment_form_item_version_idx ON assessment_form_items(item_version_id);
CREATE INDEX assessment_options_idx ON assessment_item_options(item_version_id,ordinal);
CREATE INDEX assessment_access_by_learner_idx ON assessment_access_grants(learner_id,administration_id);
CREATE INDEX assessment_attempt_learner_idx ON assessment_attempts(learner_id,started_at DESC);
CREATE INDEX assessment_attempt_questions_idx ON assessment_attempt_items(attempt_id,question_number);
CREATE INDEX assessment_response_version_idx ON assessment_response_versions(attempt_item_id,revision_no DESC);
CREATE INDEX assessment_scoring_attempt_idx ON assessment_item_scoring_decisions(attempt_item_id,decision_order DESC);
CREATE INDEX assessment_outcomes_attempt_idx ON assessment_attempt_results(attempt_id,result_revision DESC);
CREATE INDEX competency_evidence_learner_idx ON learner_competency_evidence(learner_id,competency_version_id,observed_at DESC);

CREATE TABLE academic_credit_awards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_attempt_id uuid NOT NULL REFERENCES learner_course_attempts(id),
 credit_issuer_organization_id uuid NOT NULL REFERENCES organizations(id),
 credit_units numeric(7,3) NOT NULL CHECK(credit_units>0),
 credit_type text NOT NULL, awarded_at timestamptz NOT NULL,
 awarded_by_person_id uuid NOT NULL REFERENCES persons(id),
 authority_assignment_id uuid NOT NULL,
 grade_id uuid REFERENCES official_course_grades(id),
 supersedes_award_id uuid,
 FOREIGN KEY(authority_assignment_id,awarded_by_person_id)
   REFERENCES professional_role_assignments(id,person_id),
 FOREIGN KEY(supersedes_award_id,course_attempt_id,credit_issuer_organization_id,credit_type)
   REFERENCES academic_credit_awards(id,course_attempt_id,credit_issuer_organization_id,credit_type),
 UNIQUE(id,course_attempt_id,credit_issuer_organization_id,credit_type),
 UNIQUE(supersedes_award_id),
 CHECK(supersedes_award_id IS DISTINCT FROM id)
);
-- A correction creates a new credit event in the same linear chain, never a rewrite.
CREATE UNIQUE INDEX academic_credit_one_root
 ON academic_credit_awards(course_attempt_id,credit_issuer_organization_id,credit_type)
 WHERE supersedes_award_id IS NULL;
CREATE TABLE transcript_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  issuing_organization_id uuid NOT NULL REFERENCES organizations(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL, snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  purpose text, supersedes_id uuid REFERENCES transcript_issuances(id)
);
CREATE TABLE graduation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  operation_id uuid NOT NULL REFERENCES education_operations(id),
  issuing_organization_id uuid NOT NULL REFERENCES organizations(id),
  decision text NOT NULL CHECK(decision IN ('approved','denied','rescinded')),
  requirements_snapshot jsonb NOT NULL, decided_at timestamptz NOT NULL DEFAULT now(),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id)
);
CREATE TABLE credential_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), credential_kind_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'credential_kind' CHECK(vocabulary_code='credential_kind'),
  FOREIGN KEY(vocabulary_code,credential_kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  name text NOT NULL, issuing_organization_id uuid REFERENCES organizations(id),
  external_issuer_name text, CHECK(num_nonnulls(issuing_organization_id,external_issuer_name)=1)
);
CREATE TABLE credential_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), credential_id uuid NOT NULL REFERENCES credential_definitions(id),
  learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  issuing_organization_id uuid REFERENCES organizations(id),
  external_verification_ref text, issued_at timestamptz NOT NULL,
  graduation_decision_id uuid REFERENCES graduation_decisions(id),
  status text NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','revoked'))
);
CREATE TABLE session_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL,
  deployment_id uuid NOT NULL, session_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN ('present','absent','tardy','excused')),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(enrollment_id,deployment_id) REFERENCES enrollments(id,deployment_id),
  FOREIGN KEY(session_id,deployment_id) REFERENCES delivery_sessions(id,deployment_id),
  UNIQUE(enrollment_id,session_id)
);
CREATE TABLE learner_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid NOT NULL REFERENCES learner_course_attempts(id),
  event_kind text NOT NULL, occurred_at timestamptz NOT NULL,
  telemetry jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_for_reporting boolean NOT NULL DEFAULT false
);
CREATE TABLE verified_contact_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL REFERENCES enrollments(id),
  hours numeric(9,3) NOT NULL CHECK(hours>0), occurred_on date NOT NULL,
  methodology text NOT NULL, verified_by_person_id uuid NOT NULL REFERENCES persons(id),
  evidence_version_id uuid REFERENCES evidence_document_versions(id)
);
CREATE TABLE learner_participation_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL REFERENCES enrollments(id),
  reporting_period text NOT NULL, entry_date date NOT NULL, exit_date date,
  entry_educational_level text, exit_educational_level text,
  CHECK(exit_date IS NULL OR exit_date>=entry_date), UNIQUE(id,enrollment_id)
);
CREATE TABLE learner_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid NOT NULL REFERENCES enrollments(id),
  participation_period_id uuid,
  FOREIGN KEY(participation_period_id,enrollment_id) REFERENCES learner_participation_periods(id,enrollment_id),
  outcome_code text NOT NULL, occurred_on date NOT NULL,
  authority_organization_id uuid REFERENCES organizations(id),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  measured_value jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 06a. Optional instructor supplements remain separate from official work.
CREATE TABLE learner_supplement_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid NOT NULL,
  course_version_id uuid NOT NULL, supplement_version_id uuid NOT NULL,
  supplement_task_id uuid NOT NULL, attempt_no integer NOT NULL DEFAULT 1 CHECK(attempt_no>0),
  response jsonb NOT NULL DEFAULT '{}'::jsonb, feedback jsonb NOT NULL DEFAULT '{}'::jsonb,
  formative_score numeric(10,4), submitted_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(course_attempt_id,course_version_id) REFERENCES learner_course_attempts(id,course_version_id),
  FOREIGN KEY(supplement_version_id,course_version_id) REFERENCES instructor_supplement_versions(id,course_version_id),
  FOREIGN KEY(supplement_task_id,supplement_version_id) REFERENCES instructor_supplement_tasks(id,supplement_version_id),
  UNIQUE(course_attempt_id,supplement_task_id,attempt_no)
);
CREATE TABLE approved_supplement_assessment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplement_task_id uuid NOT NULL,
  course_version_id uuid NOT NULL, assessment_version_id uuid NOT NULL,
  approved_by_person_id uuid NOT NULL REFERENCES persons(id),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(supplement_task_id,course_version_id) REFERENCES instructor_supplement_tasks(id,course_version_id),
  FOREIGN KEY(assessment_version_id,course_version_id) REFERENCES assessment_versions(id,course_version_id),
  UNIQUE(assessment_version_id,supplement_task_id)
);
-- Raw playback telemetry never substitutes for verified attendance, mastery or grading.
CREATE TABLE content_usage_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), course_attempt_id uuid,
  course_version_id uuid NOT NULL REFERENCES course_versions(id),
  instructional_track_id uuid, track_version_id uuid,
  asset_version_id uuid REFERENCES content_asset_versions(id),
  track_presentation_id uuid,
  supplement_task_id uuid, supplement_version_id uuid,
  is_preview boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  client_session_key text,
  FOREIGN KEY(course_attempt_id,course_version_id) REFERENCES learner_course_attempts(id,course_version_id),
  FOREIGN KEY(track_version_id,course_version_id) REFERENCES instructional_track_versions(id,course_version_id),
  FOREIGN KEY(track_version_id,instructional_track_id) REFERENCES instructional_track_versions(id,instructional_track_id),
  FOREIGN KEY(track_presentation_id,track_version_id,asset_version_id)
    REFERENCES track_lesson_presentations(id,track_version_id,asset_version_id),
  FOREIGN KEY(supplement_version_id,course_version_id) REFERENCES instructor_supplement_versions(id,course_version_id),
  FOREIGN KEY(supplement_task_id,supplement_version_id) REFERENCES instructor_supplement_tasks(id,supplement_version_id),
  CHECK(num_nonnulls(asset_version_id,supplement_task_id)=1),
  CHECK((supplement_task_id IS NULL)=(supplement_version_id IS NULL)),
  CHECK(is_preview OR course_attempt_id IS NOT NULL),
  CHECK(track_version_id IS NULL OR instructional_track_id IS NOT NULL),
  CHECK(track_version_id IS NULL OR asset_version_id IS NULL OR track_presentation_id IS NOT NULL),
  CHECK(ended_at IS NULL OR ended_at>=started_at),
  UNIQUE(id,instructional_track_id)
);
CREATE TABLE content_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES content_usage_sessions(id),
  client_event_id uuid NOT NULL, event_kind text NOT NULL
    CHECK(event_kind IN ('started','progress','paused','resumed','completed','replayed','opened','submitted','ended')),
  reported_active_milliseconds bigint CHECK(reported_active_milliseconds IS NULL OR reported_active_milliseconds>=0),
  reported_position_milliseconds bigint CHECK(reported_position_milliseconds IS NULL OR reported_position_milliseconds>=0),
  occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
  source_kind text NOT NULL CHECK(source_kind IN ('client','server','verified_provider')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(session_id,client_event_id)
);
-- P0 semantics for human capability; P1 implementation of scheduling, dispatch and payouts.
CREATE TABLE professional_service_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), professional_person_id uuid NOT NULL REFERENCES persons(id),
  capability_id uuid NOT NULL REFERENCES service_capabilities(id),
  delivery_mode text NOT NULL REFERENCES workforce_delivery_modes(code),
  provider_organization_id uuid REFERENCES organizations(id),
  title text NOT NULL, state text NOT NULL DEFAULT 'draft'
    CHECK(state IN ('draft','in_review','published','suspended','retired')),
  service_terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  FOREIGN KEY(capability_id,delivery_mode) REFERENCES capability_delivery_modes(capability_id,delivery_mode),
  UNIQUE(id,professional_person_id,capability_id)
);
CREATE TABLE professional_availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid NOT NULL REFERENCES persons(id),
  service_offering_id uuid REFERENCES professional_service_offerings(id),
  timezone text NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  capacity integer NOT NULL DEFAULT 1 CHECK(capacity>0),
  CHECK(ends_at>starts_at)
);
CREATE TABLE professional_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requester_person_id uuid NOT NULL REFERENCES persons(id),
  learner_id uuid REFERENCES learner_profiles(id),
  operation_id uuid REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  course_attempt_id uuid REFERENCES learner_course_attempts(id),
  capability_id uuid NOT NULL REFERENCES service_capabilities(id),
  request_kind text NOT NULL CHECK(request_kind IN ('scheduled','on_demand','asynchronous','onsite')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','matched','accepted','cancelled','completed')),
  access_policy_reference text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE professional_service_engagements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_request_id uuid REFERENCES professional_service_requests(id),
  service_offering_id uuid REFERENCES professional_service_offerings(id),
  provider_person_id uuid NOT NULL REFERENCES persons(id),
  capability_id uuid NOT NULL REFERENCES service_capabilities(id),
  delivery_mode text NOT NULL REFERENCES workforce_delivery_modes(code),
  contracting_organization_id uuid REFERENCES organizations(id),
  operation_id uuid REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  learner_id uuid REFERENCES learner_profiles(id),
  status text NOT NULL DEFAULT 'proposed'
    CHECK(status IN ('proposed','accepted','scheduled','in_progress','completed','cancelled','disputed')),
  accepted_at timestamptz, scheduled_start timestamptz, scheduled_end timestamptz,
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  FOREIGN KEY(capability_id,delivery_mode) REFERENCES capability_delivery_modes(capability_id,delivery_mode),
  CHECK(scheduled_end IS NULL OR (scheduled_start IS NOT NULL AND scheduled_end>scheduled_start)),
  CHECK(num_nonnulls(operation_id,deployment_id,learner_id,contracting_organization_id,service_request_id)>=1),
  UNIQUE(id,provider_person_id,capability_id)
);
CREATE TABLE professional_service_delivery_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL REFERENCES professional_service_engagements(id),
  delivery_kind text NOT NULL CHECK(delivery_kind IN ('session','grading','mentoring','support','review','other')),
  starts_at timestamptz, ends_at timestamptz,
  verified_by_person_id uuid REFERENCES persons(id), verified_at timestamptz,
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  course_attempt_id uuid REFERENCES learner_course_attempts(id),
  actual_delivery jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at>=starts_at)),
  CHECK((verified_by_person_id IS NULL)=(verified_at IS NULL))
);
CREATE TABLE education_requirement_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requirement_id uuid NOT NULL REFERENCES education_capability_requirements(id),
  operation_id uuid NOT NULL REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  professional_role_assignment_id uuid REFERENCES professional_role_assignments(id),
  professional_service_engagement_id uuid REFERENCES professional_service_engagements(id),
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  CHECK(num_nonnulls(professional_role_assignment_id,professional_service_engagement_id)=1),
  CHECK(valid_through IS NULL OR valid_through>valid_from)
);
CREATE INDEX content_usage_by_attempt_idx ON content_usage_sessions(course_attempt_id,started_at DESC);
CREATE INDEX supplement_usage_by_attempt_idx ON learner_supplement_attempts(course_attempt_id,submitted_at DESC);
CREATE INDEX service_engagements_provider_idx ON professional_service_engagements(provider_person_id,status,scheduled_start);

-- 06b. School-year/term and safety/admissions context are optional
-- for adult/self-paced deployments, but first-class for regulated schools.
CREATE TABLE operation_academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES education_operations(id),
  academic_year_key text NOT NULL, starts_on date NOT NULL, ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','active','closed')),
  CHECK(ends_on>=starts_on), UNIQUE(operation_id,academic_year_key), UNIQUE(id,operation_id)
);
CREATE TABLE academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), academic_year_id uuid NOT NULL REFERENCES operation_academic_years(id),
  term_key text NOT NULL, starts_on date NOT NULL, ends_on date NOT NULL,
  CHECK(ends_on>=starts_on), UNIQUE(academic_year_id,term_key)
);
CREATE TABLE operation_calendar_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), academic_year_id uuid NOT NULL REFERENCES operation_academic_years(id),
  site_id uuid REFERENCES sites(id), local_date date NOT NULL, day_kind text NOT NULL,
  schedule_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE NULLS NOT DISTINCT(academic_year_id,site_id,local_date)
);
CREATE TABLE school_graduation_requirement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES education_operations(id),
  version_no integer NOT NULL CHECK(version_no>0), requirements jsonb NOT NULL,
  effective_on date NOT NULL, adopted_by_organization_id uuid NOT NULL REFERENCES organizations(id),
  UNIQUE(operation_id,version_no)
);
-- People may express interest BEFORE being registered as learners. No fictitious learner record.
CREATE TABLE enrollment_prospects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owning_organization_id uuid NOT NULL REFERENCES organizations(id),
 contact_person_id uuid REFERENCES persons(id),
 prospect_kind text NOT NULL CHECK(prospect_kind IN ('self','guardian','family','employer','organization')),
 first_contact_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','contacted','applied','converted','closed')),
 consent_record_id uuid REFERENCES evidence_document_versions(id),
 notes_classification text NOT NULL DEFAULT 'restricted' CHECK(notes_classification IN ('restricted','confidential'))
);
CREATE TABLE enrollment_prospect_interests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prospect_id uuid NOT NULL REFERENCES enrollment_prospects(id),
 deployment_id uuid REFERENCES program_deployments(id), offering_id uuid REFERENCES offerings(id),
 operation_id uuid REFERENCES education_operations(id), interest_kind text NOT NULL
 CHECK(interest_kind IN ('information','school_visit','application','event','waitlist')),
 indicated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(deployment_id,offering_id,operation_id)=1)
);
CREATE TABLE prospect_learner_conversions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), prospect_id uuid NOT NULL REFERENCES enrollment_prospects(id),
 learner_id uuid NOT NULL REFERENCES learner_profiles(id),
 converted_by_person_id uuid NOT NULL REFERENCES persons(id), converted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(prospect_id,learner_id)
);

CREATE TABLE program_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid REFERENCES learner_profiles(id),
  prospect_id uuid REFERENCES enrollment_prospects(id),
  deployment_id uuid NOT NULL REFERENCES program_deployments(id),
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'inquiry' CHECK(status IN ('inquiry','submitted','review','accepted','declined','withdrawn')),
  submitted_by_person_id uuid REFERENCES persons(id),
  CHECK(num_nonnulls(learner_id,prospect_id)=1)
);
CREATE TABLE admission_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES program_applications(id),
  offered_by_organization_id uuid NOT NULL REFERENCES organizations(id),
  decision text NOT NULL CHECK(decision IN ('accepted','declined','waitlisted')),
  decided_at timestamptz NOT NULL, expires_at timestamptz
);
CREATE TABLE operation_safety_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES education_operations(id),
  site_id uuid REFERENCES sites(id), requirement_code text NOT NULL,
  effective_from date NOT NULL, effective_through date,
  policy_definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(effective_through IS NULL OR effective_through>=effective_from)
);
CREATE TABLE operation_safety_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), requirement_id uuid NOT NULL REFERENCES operation_safety_requirements(id),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  decision text NOT NULL CHECK(decision IN ('approved','conditional','failed','revoked')),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  evidence_version_id uuid REFERENCES evidence_document_versions(id)
);

-- 07. Internal reviews, independently issued legal authorization, and publication.
-- Internal approvals cannot substitute for a government/provider authorization.
CREATE TABLE institutional_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'approval_kind' CHECK(vocabulary_code='approval_kind'),
  FOREIGN KEY(vocabulary_code,kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  operation_id uuid REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  offering_version_id uuid REFERENCES offering_versions(id),
  configuration_version_id uuid REFERENCES blueprint_configuration_versions(id),
  site_id uuid REFERENCES sites(id),
  decision text NOT NULL CHECK(decision IN ('approved','conditional','denied','withdrawn')),
  reviewer_person_id uuid NOT NULL REFERENCES persons(id),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_at timestamptz NOT NULL DEFAULT now(), conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(num_nonnulls(operation_id,deployment_id,offering_version_id,configuration_version_id,site_id)=1)
);
CREATE TABLE official_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuing_authority_id uuid NOT NULL REFERENCES organizations(id),
  authorization_code text NOT NULL, authorization_kind text NOT NULL,
  issued_at timestamptz NOT NULL, effective_at timestamptz NOT NULL, expires_at timestamptz,
  official_decision text NOT NULL CHECK(official_decision IN ('approved','conditional','denied','revoked')),
  external_reference text, conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
  reviewed_by_person_id uuid REFERENCES persons(id), reviewed_at timestamptz,
  CHECK(expires_at IS NULL OR expires_at>effective_at),
  UNIQUE(issuing_authority_id,authorization_code)
);
CREATE TABLE official_authorization_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), authorization_id uuid NOT NULL REFERENCES official_authorizations(id),
  organization_id uuid REFERENCES organizations(id), operation_id uuid REFERENCES education_operations(id),
  site_id uuid REFERENCES sites(id), offering_id uuid REFERENCES offerings(id),
  deployment_id uuid REFERENCES program_deployments(id), geographic_area_id uuid REFERENCES geographic_areas(id),
  modality_code text, modality_vocab text NOT NULL DEFAULT 'delivery_modality' CHECK(modality_vocab='delivery_modality'),
  FOREIGN KEY(modality_vocab,modality_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  -- Exactly one scope value per row. Multiple rows express AND across dimensions;
  -- multiple permitted values within one dimension express OR, per evaluation policy.
  CHECK(num_nonnulls(organization_id,operation_id,site_id,offering_id,deployment_id,
                     geographic_area_id,modality_code)=1)
);
CREATE INDEX official_authorization_scopes_auth_idx ON official_authorization_scopes(authorization_id);
CREATE TABLE official_authorization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), authorization_id uuid NOT NULL REFERENCES official_authorizations(id),
  event_kind text NOT NULL CHECK(event_kind IN ('renewed','suspended','revoked','amended','verified')),
  effective_at timestamptz NOT NULL, evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
  actor_person_id uuid REFERENCES persons(id), recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE operation_publication_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), operation_id uuid NOT NULL REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  publication_kind text NOT NULL CHECK(publication_kind IN ('planned','approved','enrolling','operating')),
  claims_snapshot jsonb NOT NULL, sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  approved_by_person_id uuid NOT NULL REFERENCES persons(id), published_at timestamptz NOT NULL DEFAULT now(),
  source_configuration_version_id uuid REFERENCES blueprint_configuration_versions(id)
);
-- The snapshot envelope is immutable, and its supplied digest must represent the
-- exact JSONB planning/publication payload captured at approval time.
CREATE OR REPLACE FUNCTION v301_guard_publication_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.sha256 IS DISTINCT FROM encode(public.digest(NEW.claims_snapshot::text,'sha256'),'hex') THEN
  RAISE EXCEPTION 'Publication snapshot checksum does not match approved content'; END IF;
 IF NEW.deployment_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM program_deployments d WHERE d.id=NEW.deployment_id
    AND d.operation_id=NEW.operation_id) THEN
  RAISE EXCEPTION 'Publication snapshot deployment does not belong to operation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER publication_snapshot_integrity BEFORE INSERT ON operation_publication_snapshots
 FOR EACH ROW EXECUTE FUNCTION v301_guard_publication_snapshot();
CREATE TABLE publication_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_snapshot_id uuid NOT NULL REFERENCES operation_publication_snapshots(id),
  effective_at timestamptz NOT NULL, reason text NOT NULL,
  authorized_by_person_id uuid NOT NULL REFERENCES persons(id)
);

-- 08. Optional financial and regulatory foundations. A deployed offering needs
-- neither a funding program nor a grant, scholarship, network or payer record.
CREATE TABLE legal_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL,
  geographic_area_id uuid REFERENCES geographic_areas(id),
  issuer_organization_id uuid REFERENCES organizations(id),
  source_document_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
  effective_on date, expires_on date,
  CHECK(expires_on IS NULL OR effective_on IS NULL OR expires_on>=effective_on)
);
CREATE TABLE funding_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sponsoring_organization_id uuid REFERENCES organizations(id),
  code text NOT NULL UNIQUE, name text NOT NULL, funding_kind_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'funding_kind' CHECK(vocabulary_code='funding_kind'),
  FOREIGN KEY(vocabulary_code,funding_kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  geographic_area_id uuid REFERENCES geographic_areas(id),
  research_status text NOT NULL DEFAULT 'discovered'
    CHECK(research_status IN ('discovered','researched','reviewed','archived'))
);
CREATE TABLE funding_program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_program_id uuid NOT NULL REFERENCES funding_programs(id),
  version_no integer NOT NULL CHECK(version_no>0), rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by_person_id uuid REFERENCES persons(id), reviewed_at timestamptz,
  valid_from date, valid_through date,
  UNIQUE(funding_program_id,version_no),
  CHECK(valid_through IS NULL OR valid_from IS NULL OR valid_through>=valid_from)
);
CREATE TABLE funding_version_sources (
  funding_version_id uuid NOT NULL REFERENCES funding_program_versions(id),
  source_id uuid NOT NULL REFERENCES legal_sources(id),
  PRIMARY KEY(funding_version_id,source_id)
);
CREATE TABLE provider_eligibility_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_program_id uuid NOT NULL REFERENCES funding_programs(id),
  provider_organization_id uuid NOT NULL REFERENCES organizations(id),
  review_decision text NOT NULL CHECK(review_decision IN ('unknown','potentially_eligible','ineligible','review_required')),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  reviewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE provider_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_program_id uuid NOT NULL REFERENCES funding_programs(id),
  provider_organization_id uuid NOT NULL REFERENCES organizations(id),
  official_authorization_id uuid NOT NULL REFERENCES official_authorizations(id),
  active_from timestamptz NOT NULL, active_through timestamptz,
  CHECK(active_through IS NULL OR active_through>active_from),
  UNIQUE(funding_program_id,provider_organization_id,official_authorization_id)
);
CREATE TABLE funding_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_program_id uuid NOT NULL REFERENCES funding_programs(id),
  recipient_organization_id uuid NOT NULL REFERENCES organizations(id),
  award_reference text NOT NULL, currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
  awarded_cents bigint NOT NULL CHECK(awarded_cents>=0),
  available_from date NOT NULL, available_through date,
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','awarded','suspended','closed')),
  award_evidence_version_id uuid REFERENCES evidence_document_versions(id),
  CHECK(available_through IS NULL OR available_through>=available_from),
  UNIQUE(funding_program_id,award_reference), UNIQUE(id,currency)
);
CREATE TABLE learner_benefit_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_program_id uuid NOT NULL REFERENCES funding_programs(id),
  learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  approving_authority_id uuid NOT NULL REFERENCES organizations(id),
  entitlement_reference text NOT NULL, currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
  authorized_cents bigint NOT NULL CHECK(authorized_cents>=0),
  valid_from date NOT NULL, valid_through date,
  decision_evidence_version_id uuid REFERENCES evidence_document_versions(id),
  status text NOT NULL CHECK(status IN ('pending','approved','suspended','expired')),
  CHECK(valid_through IS NULL OR valid_through>=valid_from),
  UNIQUE(funding_program_id,entitlement_reference), UNIQUE(id,currency)
);
CREATE TABLE education_service_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), enrollment_id uuid REFERENCES enrollments(id),
  deployment_id uuid NOT NULL REFERENCES program_deployments(id),
  provider_organization_id uuid NOT NULL REFERENCES organizations(id),
  service_kind_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'service_kind' CHECK(vocabulary_code='service_kind'),
  FOREIGN KEY(vocabulary_code,service_kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  delivered_on date NOT NULL, evidence_version_id uuid REFERENCES evidence_document_versions(id),
  FOREIGN KEY(enrollment_id,deployment_id) REFERENCES enrollments(id,deployment_id),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
  billable_ceiling_cents bigint NOT NULL CHECK(billable_ceiling_cents>=0),
  UNIQUE(id,currency)
);
CREATE TABLE eligible_operating_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid REFERENCES program_deployments(id),
  paying_organization_id uuid NOT NULL REFERENCES organizations(id),
  expense_reference text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>=0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'), incurred_on date NOT NULL,
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  UNIQUE(paying_organization_id,expense_reference), UNIQUE(id,currency)
);
CREATE TABLE contractual_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid REFERENCES program_deployments(id),
  responsible_organization_id uuid NOT NULL REFERENCES organizations(id),
  milestone_code text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>=0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
  completed_on date, evidence_version_id uuid REFERENCES evidence_document_versions(id),
  UNIQUE(responsible_organization_id,milestone_code,deployment_id), UNIQUE(id,currency)
);
CREATE TABLE fundable_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), service_evidence_id uuid UNIQUE,
  cost_id uuid UNIQUE, milestone_id uuid UNIQUE,
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
  maximum_eligible_cents bigint NOT NULL CHECK(maximum_eligible_cents>=0),
  FOREIGN KEY(service_evidence_id,currency) REFERENCES education_service_evidence(id,currency),
  FOREIGN KEY(cost_id,currency) REFERENCES eligible_operating_costs(id,currency),
  FOREIGN KEY(milestone_id,currency) REFERENCES contractual_milestones(id,currency),
  CHECK(num_nonnulls(service_evidence_id,cost_id,milestone_id)=1),
  UNIQUE(id,currency)
);
CREATE TABLE funding_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL,
  award_id uuid, benefit_entitlement_id uuid,
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'), amount_cents bigint NOT NULL CHECK(amount_cents>0),
  status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','revoked')),
  approved_at timestamptz, approval_evidence_version_id uuid REFERENCES evidence_document_versions(id),
  FOREIGN KEY(source_id,currency) REFERENCES fundable_sources(id,currency),
  FOREIGN KEY(award_id,currency) REFERENCES funding_awards(id,currency),
  FOREIGN KEY(benefit_entitlement_id,currency) REFERENCES learner_benefit_entitlements(id,currency),
  CHECK(num_nonnulls(award_id,benefit_entitlement_id)=1),
  CHECK(status<>'approved' OR approved_at IS NOT NULL),
  UNIQUE(id,award_id), UNIQUE(id,benefit_entitlement_id)
);
CREATE TABLE funding_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_award_id uuid REFERENCES funding_awards(id),
  benefit_entitlement_id uuid REFERENCES learner_benefit_entitlements(id),
  claim_reference text NOT NULL, filed_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','accepted','paid','rejected','voided')),
  CHECK(num_nonnulls(funding_award_id,benefit_entitlement_id)=1),
  UNIQUE(claim_reference)
);
CREATE TABLE funding_claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_claim_id uuid NOT NULL REFERENCES funding_claims(id),
  allocation_id uuid NOT NULL UNIQUE REFERENCES funding_allocations(id),
  amount_cents bigint NOT NULL CHECK(amount_cents>0)
);
CREATE TABLE commercial_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_code text NOT NULL UNIQUE,
  valid_from date NOT NULL, valid_through date, status text NOT NULL
    CHECK(status IN ('draft','signed','suspended','expired')),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  CHECK(valid_through IS NULL OR valid_through>=valid_from)
);
CREATE TABLE commercial_contract_parties (
  contract_id uuid NOT NULL REFERENCES commercial_contracts(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role_code text NOT NULL, PRIMARY KEY(contract_id,organization_id,role_code)
);
CREATE TABLE partner_compensation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES commercial_contracts(id),
  payee_organization_id uuid NOT NULL REFERENCES organizations(id),
  deployment_id uuid REFERENCES program_deployments(id),
  service_kind_code text NOT NULL,
  vocabulary_code text NOT NULL DEFAULT 'service_kind' CHECK(vocabulary_code='service_kind'),
  FOREIGN KEY(vocabulary_code,service_kind_code) REFERENCES vocabulary_terms(vocabulary_code,code),
  compensation_method text NOT NULL CHECK(compensation_method IN ('fixed','unit','percentage','cost_reimbursement','milestone')),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'), rate numeric(13,4) NOT NULL CHECK(rate>=0),
  starts_on date NOT NULL, ends_on date,
  CHECK(ends_on IS NULL OR ends_on>=starts_on),
  UNIQUE(id,payee_organization_id,currency)
);
CREATE TABLE partner_payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), compensation_term_id uuid NOT NULL,
  payee_organization_id uuid NOT NULL REFERENCES organizations(id),
  amount_cents bigint NOT NULL CHECK(amount_cents>=0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','reversed')),
  evidence_version_id uuid REFERENCES evidence_document_versions(id),
  FOREIGN KEY(compensation_term_id,payee_organization_id,currency)
    REFERENCES partner_compensation_terms(id,payee_organization_id,currency)
);

-- 08b. Separate workforce compensation obligations from actual payments/finance ledger.
CREATE TABLE workforce_compensation_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_organization_id uuid NOT NULL REFERENCES organizations(id),
  payee_person_id uuid REFERENCES persons(id),
  payee_organization_id uuid REFERENCES organizations(id),
  contract_evidence_version_id uuid REFERENCES evidence_document_versions(id),
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','accepted','active','suspended','ended')),
  signed_at timestamptz,
  CHECK(num_nonnulls(payee_person_id,payee_organization_id)=1),
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  CHECK(state NOT IN ('accepted','active') OR (signed_at IS NOT NULL AND contract_evidence_version_id IS NOT NULL))
);
CREATE TABLE workforce_compensation_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agreement_id uuid NOT NULL REFERENCES workforce_compensation_agreements(id),
  basis text NOT NULL CHECK(basis IN ('accepted_deliverable','qualified_usage','completed_service','milestone','flat_fee','volunteer')),
  instructional_track_id uuid REFERENCES instructional_tracks(id),
  service_capability_id uuid REFERENCES service_capabilities(id),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'), rate_cents numeric(15,4) NOT NULL DEFAULT 0 CHECK(rate_cents>=0),
  unit_code text NOT NULL, qualifying_policy_version text,
  valid_from timestamptz NOT NULL, valid_through timestamptz,
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  CHECK(basis<>'volunteer' OR rate_cents=0),
  UNIQUE(id,instructional_track_id), UNIQUE(id,currency)
);
CREATE TABLE qualified_creator_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usage_session_id uuid NOT NULL,
  instructional_track_id uuid NOT NULL, compensation_term_id uuid NOT NULL,
  qualified_units numeric(15,4) NOT NULL CHECK(qualified_units>0),
  qualification_policy_version text NOT NULL,
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualified_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(usage_session_id,instructional_track_id) REFERENCES content_usage_sessions(id,instructional_track_id),
  FOREIGN KEY(compensation_term_id,instructional_track_id) REFERENCES workforce_compensation_terms(id,instructional_track_id),
  UNIQUE(usage_session_id,compensation_term_id), UNIQUE(id,compensation_term_id)
);
CREATE TABLE workforce_earning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), compensation_term_id uuid NOT NULL REFERENCES workforce_compensation_terms(id),
  qualified_usage_id uuid, production_deliverable_id uuid REFERENCES production_deliverables(id),
  service_delivery_record_id uuid REFERENCES professional_service_delivery_records(id),
  contractual_milestone_id uuid REFERENCES contractual_milestones(id),
  manual_adjustment_reference text,
  currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'), earned_cents bigint NOT NULL CHECK(earned_cents>=0),
  status text NOT NULL DEFAULT 'accrued' CHECK(status IN ('accrued','approved','reversed')),
  accrued_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(compensation_term_id,currency) REFERENCES workforce_compensation_terms(id,currency),
  FOREIGN KEY(qualified_usage_id,compensation_term_id) REFERENCES qualified_creator_usage(id,compensation_term_id),
  CHECK(num_nonnulls(qualified_usage_id,production_deliverable_id,service_delivery_record_id,contractual_milestone_id,manual_adjustment_reference)=1)
);
CREATE UNIQUE INDEX workforce_earning_usage_once_idx ON workforce_earning_events(qualified_usage_id) WHERE qualified_usage_id IS NOT NULL;
CREATE UNIQUE INDEX workforce_earning_deliverable_once_idx ON workforce_earning_events(compensation_term_id,production_deliverable_id) WHERE production_deliverable_id IS NOT NULL;
CREATE UNIQUE INDEX workforce_earning_service_once_idx ON workforce_earning_events(compensation_term_id,service_delivery_record_id) WHERE service_delivery_record_id IS NOT NULL;
CREATE UNIQUE INDEX workforce_earning_milestone_once_idx ON workforce_earning_events(compensation_term_id,contractual_milestone_id) WHERE contractual_milestone_id IS NOT NULL;
CREATE UNIQUE INDEX workforce_earning_adjustment_once_idx ON workforce_earning_events(compensation_term_id,manual_adjustment_reference) WHERE manual_adjustment_reference IS NOT NULL;

-- 09. Privacy access is scoped to an authorized purpose, not derived from networks.
CREATE TABLE person_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), grantee_person_id uuid NOT NULL REFERENCES persons(id),
  organization_id uuid REFERENCES organizations(id), operation_id uuid REFERENCES education_operations(id),
  deployment_id uuid REFERENCES program_deployments(id), learner_id uuid REFERENCES learner_profiles(id),
  purpose_code text NOT NULL, valid_from timestamptz NOT NULL, valid_through timestamptz,
  CHECK(valid_through IS NULL OR valid_through>valid_from),
  CHECK(num_nonnulls(organization_id,operation_id,deployment_id,learner_id)>=1)
);
CREATE TABLE learner_data_disclosures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), learner_id uuid NOT NULL REFERENCES learner_profiles(id),
  recipient_organization_id uuid NOT NULL REFERENCES organizations(id),
  purpose_code text NOT NULL, legal_basis text NOT NULL,
  disclosed_at timestamptz NOT NULL DEFAULT now(),
  actor_person_id uuid NOT NULL REFERENCES persons(id),
  evidence_version_id uuid REFERENCES evidence_document_versions(id)
);
CREATE TABLE network_aggregate_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), network_id uuid NOT NULL REFERENCES education_networks(id),
  reporting_period text NOT NULL, report_kind text NOT NULL, aggregate_metrics jsonb NOT NULL,
  authorized_by_person_id uuid NOT NULL REFERENCES persons(id), generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(network_id,reporting_period,report_kind)
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_person_id uuid REFERENCES persons(id),
  owning_organization_id uuid REFERENCES organizations(id),
  occurred_at timestamptz NOT NULL DEFAULT now(), event_code text NOT NULL,
  entity_kind text NOT NULL, entity_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL,
  aggregate_type text NOT NULL, aggregate_id uuid NOT NULL,
  actor_person_id uuid REFERENCES persons(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','processed','failed')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  last_error text, next_attempt_at timestamptz, processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_events_status_time_idx ON domain_events(status,occurred_at);
CREATE INDEX domain_events_aggregate_idx ON domain_events(aggregate_type,aggregate_id);
CREATE TABLE instructional_track_command_receipts (
  actor_person_id uuid NOT NULL REFERENCES persons(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK(fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL CHECK(jsonb_typeof(result)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_person_id,request_id)
);

-- 10. Invariants enforced by triggers. All other scope and authority checks
-- must be proved in the service transaction / RLS before production cutover.
CREATE OR REPLACE FUNCTION reject_published_version_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
  IF OLD.lifecycle IN ('published','frozen') THEN
    RAISE EXCEPTION 'Immutable published or frozen version: %', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER blueprint_version_immutability BEFORE UPDATE OR DELETE ON blueprint_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER configuration_version_immutability BEFORE UPDATE OR DELETE ON blueprint_configuration_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER blueprint_reference_version_immutability BEFORE UPDATE OR DELETE
  ON blueprint_reference_item_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER offering_version_immutability BEFORE UPDATE OR DELETE ON offering_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER course_version_immutability BEFORE UPDATE OR DELETE ON course_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER track_version_immutability BEFORE UPDATE OR DELETE ON instructional_track_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE OR REPLACE FUNCTION protect_submitted_track_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   IF OLD.submission_manifest_hash IS NOT NULL THEN
     RAISE EXCEPTION 'Submitted instructional track versions cannot be deleted';
   END IF;
   RETURN OLD;
 END IF;
 IF OLD.submission_manifest_hash IS NOT NULL AND
   ROW(NEW.id,NEW.instructional_track_id,NEW.course_version_id,NEW.course_id,
     NEW.created_by_person_id,NEW.version_no,NEW.track_kind,NEW.submission_manifest_hash,
     NEW.submitted_by_person_id,NEW.submitted_at)
   IS DISTINCT FROM
   ROW(OLD.id,OLD.instructional_track_id,OLD.course_version_id,OLD.course_id,
     OLD.created_by_person_id,OLD.version_no,OLD.track_kind,OLD.submission_manifest_hash,
     OLD.submitted_by_person_id,OLD.submitted_at) THEN
   RAISE EXCEPTION 'Submitted instructional track versions are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER submitted_track_version_immutability
 BEFORE UPDATE OR DELETE ON instructional_track_versions
 FOR EACH ROW EXECUTE FUNCTION protect_submitted_track_version();
CREATE OR REPLACE FUNCTION protect_released_track_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM instructional_track_versions v
   WHERE v.instructional_track_id=OLD.id
     AND (v.lifecycle='published' OR v.submission_manifest_hash IS NOT NULL)) THEN
   RAISE EXCEPTION 'A submitted or released instructional track identity is immutable';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER released_track_identity_immutability
 BEFORE UPDATE OR DELETE ON instructional_tracks
 FOR EACH ROW EXECUTE FUNCTION protect_released_track_identity();
CREATE TRIGGER instructional_track_policy_version_immutability
  BEFORE UPDATE OR DELETE ON instructional_track_policy_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER assessment_version_immutability BEFORE UPDATE OR DELETE ON assessment_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER asset_version_immutability BEFORE UPDATE OR DELETE ON content_asset_versions
  FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE OR REPLACE FUNCTION reject_immutable_insert_only() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Append-only record: %', TG_TABLE_NAME; END $$;
CREATE OR REPLACE FUNCTION v301_track_distribution_allowed(
 p_track_version_id uuid,p_deployment_id uuid,p_at timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SET search_path=education_v30,pg_catalog AS $$
 SELECT EXISTS (
   SELECT 1
   FROM track_distribution_authorizations td
   JOIN program_deployments d ON d.id=p_deployment_id
   JOIN evidence_document_versions ev ON ev.id=td.rights_evidence_version_id
   WHERE td.track_version_id=p_track_version_id
     AND td.status='approved'
     AND td.valid_from<=p_at
     AND (td.valid_through IS NULL OR td.valid_through>p_at)
     AND (td.approved_offering_id IS NULL OR td.approved_offering_id=d.offering_id)
     AND (td.approved_operation_id IS NULL OR td.approved_operation_id=d.operation_id)
     AND td.geographic_area_id IS NULL
     AND (td.approved_organization_id IS NULL OR EXISTS (
       SELECT 1 FROM education_operation_organization_roles r
       WHERE r.operation_id=d.operation_id
         AND r.organization_id=td.approved_organization_id
         AND r.role_code IN ('academic_provider','instructor_provider','publisher')
         AND r.status='approved'
         AND r.valid_from<=p_at
         AND (r.valid_through IS NULL OR r.valid_through>p_at)
     ))
     AND ev.verified_at IS NOT NULL
     AND ev.verified_by_person_id IS NOT NULL
     AND ev.verified_at<=p_at
     AND (ev.valid_from IS NULL OR ev.valid_from<=(p_at AT TIME ZONE 'UTC')::date)
     AND (ev.valid_through IS NULL OR ev.valid_through>=(p_at AT TIME ZONE 'UTC')::date)
 )
$$;
CREATE TRIGGER transcript_append_only BEFORE UPDATE OR DELETE ON transcript_issuances
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER publication_append_only BEFORE UPDATE OR DELETE ON operation_publication_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER official_auth_event_append_only BEFORE UPDATE OR DELETE ON official_authorization_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER audit_event_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER instructional_track_policy_withdrawals_append_only
  BEFORE UPDATE OR DELETE ON instructional_track_policy_withdrawals
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER instructional_track_command_receipts_append_only
  BEFORE UPDATE OR DELETE ON instructional_track_command_receipts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER content_withdrawals_append_only
  BEFORE UPDATE OR DELETE ON content_withdrawals
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER formative_practice_attempts_append_only
  BEFORE UPDATE OR DELETE ON formative_practice_attempts
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE OR REPLACE FUNCTION validate_track_distribution_rights_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.status='approved' AND NOT EXISTS (
   SELECT 1 FROM evidence_document_versions ev
   WHERE ev.id=NEW.rights_evidence_version_id
     AND ev.verified_at IS NOT NULL
     AND ev.verified_by_person_id IS NOT NULL
     AND ev.verified_at<=clock_timestamp()
     AND (ev.valid_from IS NULL OR ev.valid_from<=CURRENT_DATE)
     AND (ev.valid_through IS NULL OR ev.valid_through>=CURRENT_DATE)
 ) THEN
   RAISE EXCEPTION 'Approved instructional distribution requires current verified rights evidence';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_distribution_rights_evidence_guard
 BEFORE INSERT OR UPDATE OF status,rights_evidence_version_id ON track_distribution_authorizations
 FOR EACH ROW EXECUTE FUNCTION validate_track_distribution_rights_evidence();

-- Serialize concurrent allocation changes against the common fundable source.
CREATE OR REPLACE FUNCTION assert_source_allocation_ceiling() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE ceiling bigint; spent bigint;
BEGIN
  SELECT maximum_eligible_cents INTO ceiling FROM fundable_sources
    WHERE id=NEW.source_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown fundable source'; END IF;
  SELECT coalesce(sum(amount_cents),0) INTO spent FROM funding_allocations
    WHERE source_id=NEW.source_id AND status='approved';
  IF spent>ceiling THEN RAISE EXCEPTION 'Approved allocations % exceed source ceiling %', spent,ceiling; END IF;
  RETURN NULL;
END $$;
-- An AFTER trigger checks the committed row set, not a stale pre-update total.
CREATE CONSTRAINT TRIGGER source_allocation_ceiling
  AFTER INSERT OR UPDATE ON funding_allocations
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION assert_source_allocation_ceiling();

-- Ensure cross-course track materials cannot point into an unrelated course.
CREATE OR REPLACE FUNCTION assert_track_material_course() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE track_course uuid; unit_course uuid;
BEGIN
  SELECT course_version_id INTO track_course FROM instructional_track_versions WHERE id=NEW.track_version_id;
  SELECT course_version_id INTO unit_course FROM course_units WHERE id=NEW.course_unit_id;
  IF track_course IS DISTINCT FROM unit_course THEN
    RAISE EXCEPTION 'Track and content unit belong to different course versions';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER track_material_scope BEFORE INSERT OR UPDATE ON instructional_track_materials
  FOR EACH ROW EXECUTE FUNCTION assert_track_material_course();

CREATE OR REPLACE FUNCTION validate_instructional_track_policy_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.lifecycle<>'published' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.lifecycle='published' THEN RETURN NEW; END IF;
 IF NOT EXISTS (
   SELECT 1
   FROM deployment_offering_adoptions a
   JOIN program_deployments d ON d.id=a.deployment_id
   JOIN offering_versions ov ON ov.id=a.offering_version_id
   JOIN offerings o ON o.id=ov.offering_id
   JOIN course_versions cv ON cv.id=NEW.course_version_id
   WHERE a.id=NEW.adoption_id
     AND a.deployment_id=NEW.deployment_id
     AND a.offering_version_id=NEW.offering_version_id
     AND a.approval_status='approved'
     AND a.valid_from<=NEW.effective_from
     AND (a.valid_through IS NULL OR
       (NEW.effective_through IS NOT NULL AND a.valid_through>=NEW.effective_through))
     AND ov.lifecycle='published' AND o.status='active'
     AND cv.lifecycle='published'
 ) THEN
   RAISE EXCEPTION 'Instructional policy requires an approved adoption and published Offering/Course versions covering its effective period';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER instructional_track_policy_publication_gate
 BEFORE INSERT OR UPDATE ON instructional_track_policy_versions
 FOR EACH ROW EXECUTE FUNCTION validate_instructional_track_policy_publication();

-- Child components cannot be appended/modified after a version is published.
-- A published version contains both its header and all of its governed members.
CREATE OR REPLACE FUNCTION reject_published_child_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE old_parent uuid; new_parent uuid; old_state text; new_state text;
  old_submitted boolean:=false; new_submitted boolean:=false; parent_table text;
BEGIN
 IF TG_TABLE_NAME='offering_courses' THEN parent_table:='offering_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.offering_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.offering_version_id; END IF;
 ELSIF TG_TABLE_NAME IN ('blueprint_components','blueprint_component_dependencies') THEN
   parent_table:='blueprint_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.blueprint_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.blueprint_version_id; END IF;
 ELSIF TG_TABLE_NAME='blueprint_configuration_components' THEN
   parent_table:='blueprint_configuration_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.configuration_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.configuration_version_id; END IF;
 ELSIF TG_TABLE_NAME='blueprint_configuration_local_experiences' THEN
   parent_table:='blueprint_configuration_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.configuration_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.configuration_version_id; END IF;
 ELSIF TG_TABLE_NAME='blueprint_configuration_component_references' THEN
   parent_table:='blueprint_configuration_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.configuration_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.configuration_version_id; END IF;
 ELSIF TG_TABLE_NAME='blueprint_configuration_offering_intents' THEN
   parent_table:='blueprint_configuration_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.configuration_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.configuration_version_id; END IF;
 ELSIF TG_TABLE_NAME IN ('course_units','course_lessons') THEN
   parent_table:='course_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.course_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.course_version_id; END IF;
 ELSIF TG_TABLE_NAME='instructional_track_materials' THEN
   parent_table:='instructional_track_versions';
   IF TG_OP<>'INSERT' THEN old_parent:=OLD.track_version_id; END IF;
   IF TG_OP<>'DELETE' THEN new_parent:=NEW.track_version_id; END IF;
 ELSE RAISE EXCEPTION 'Unsupported immutable child table: %',TG_TABLE_NAME;
 END IF;
 IF old_parent IS NOT NULL THEN
   IF TG_TABLE_NAME='instructional_track_materials' THEN
     EXECUTE format('SELECT lifecycle,submission_manifest_hash IS NOT NULL FROM %I WHERE id=$1',parent_table)
       INTO old_state,old_submitted USING old_parent;
   ELSE
     EXECUTE format('SELECT lifecycle FROM %I WHERE id=$1',parent_table) INTO old_state USING old_parent;
   END IF;
   IF old_state IS NULL THEN RAISE EXCEPTION 'Missing old immutable parent for %',TG_TABLE_NAME; END IF;
 END IF;
 IF new_parent IS NOT NULL THEN
   IF TG_TABLE_NAME='instructional_track_materials' THEN
     EXECUTE format('SELECT lifecycle,submission_manifest_hash IS NOT NULL FROM %I WHERE id=$1',parent_table)
       INTO new_state,new_submitted USING new_parent;
   ELSE
     EXECUTE format('SELECT lifecycle FROM %I WHERE id=$1',parent_table) INTO new_state USING new_parent;
   END IF;
   IF new_state IS NULL THEN RAISE EXCEPTION 'Missing new immutable parent for %',TG_TABLE_NAME; END IF;
 END IF;
 IF old_state IN ('published','frozen') OR new_state IN ('published','frozen')
   OR old_submitted OR new_submitted THEN
    RAISE EXCEPTION 'Immutable published/frozen parent child collection: %',TG_TABLE_NAME;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offering_course_immutability BEFORE INSERT OR UPDATE OR DELETE ON offering_courses
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER blueprint_component_immutability BEFORE INSERT OR UPDATE OR DELETE ON blueprint_components
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER blueprint_dependency_immutability BEFORE INSERT OR UPDATE OR DELETE ON blueprint_component_dependencies
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER blueprint_selection_immutability BEFORE INSERT OR UPDATE OR DELETE ON blueprint_configuration_components
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER blueprint_local_experience_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON blueprint_configuration_local_experiences
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER blueprint_reference_selection_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON blueprint_configuration_component_references
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER blueprint_offering_intent_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON blueprint_configuration_offering_intents
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER course_unit_immutability BEFORE INSERT OR UPDATE OR DELETE ON course_units
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER course_lesson_immutability BEFORE INSERT OR UPDATE OR DELETE ON course_lessons
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();
CREATE TRIGGER track_material_immutability BEFORE INSERT OR UPDATE OR DELETE ON instructional_track_materials
  FOR EACH ROW EXECUTE FUNCTION reject_published_child_mutation();

CREATE OR REPLACE FUNCTION assert_fundable_source_ceiling() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE maximum bigint; allocated bigint;
BEGIN
  IF NEW.service_evidence_id IS NOT NULL THEN
    SELECT billable_ceiling_cents INTO maximum FROM education_service_evidence WHERE id=NEW.service_evidence_id;
  ELSIF NEW.cost_id IS NOT NULL THEN
    SELECT amount_cents INTO maximum FROM eligible_operating_costs WHERE id=NEW.cost_id;
  ELSE
    SELECT amount_cents INTO maximum FROM contractual_milestones WHERE id=NEW.milestone_id;
  END IF;
  IF NEW.maximum_eligible_cents>maximum THEN
    RAISE EXCEPTION 'Fundable source ceiling exceeds underlying evidence';
  END IF;
  IF TG_OP='UPDATE' THEN
    SELECT coalesce(sum(amount_cents),0) INTO allocated FROM funding_allocations
      WHERE source_id=NEW.id AND status='approved';
    IF allocated>NEW.maximum_eligible_cents THEN
      RAISE EXCEPTION 'Fundable ceiling cannot undercut existing approved allocation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fundable_source_ceiling BEFORE INSERT OR UPDATE ON fundable_sources
  FOR EACH ROW EXECUTE FUNCTION assert_fundable_source_ceiling();

-- Separate award ceilings from source ceilings. Approved allocations may
-- never exceed award amounts even when different sources are individually valid.
CREATE OR REPLACE FUNCTION assert_entitlement_allocation_ceiling() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE maximum bigint; allocated bigint;
BEGIN
  IF NEW.award_id IS NOT NULL THEN
    SELECT awarded_cents INTO maximum FROM funding_awards WHERE id=NEW.award_id FOR UPDATE;
    SELECT coalesce(sum(amount_cents),0) INTO allocated FROM funding_allocations
      WHERE award_id=NEW.award_id AND status='approved';
  ELSE
    SELECT authorized_cents INTO maximum FROM learner_benefit_entitlements
      WHERE id=NEW.benefit_entitlement_id FOR UPDATE;
    SELECT coalesce(sum(amount_cents),0) INTO allocated FROM funding_allocations
      WHERE benefit_entitlement_id=NEW.benefit_entitlement_id AND status='approved';
  END IF;
  IF allocated>maximum THEN RAISE EXCEPTION 'Funding entitlement overallocated: % > %',allocated,maximum; END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER entitlement_allocation_ceiling
  AFTER INSERT OR UPDATE ON funding_allocations
  DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW
  EXECUTE FUNCTION assert_entitlement_allocation_ceiling();

-- Claim lines must use an approved allocation and match its funding entitlement.
CREATE OR REPLACE FUNCTION assert_claim_line_authority() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE allocated record; claim_record record;
BEGIN
  SELECT award_id,benefit_entitlement_id,amount_cents,status INTO allocated
  FROM funding_allocations WHERE id=NEW.allocation_id FOR UPDATE;
  SELECT funding_award_id,benefit_entitlement_id INTO claim_record
  FROM funding_claims WHERE id=NEW.funding_claim_id;
  IF allocated.status<>'approved' OR NEW.amount_cents>allocated.amount_cents
    OR claim_record.funding_award_id IS DISTINCT FROM allocated.award_id
    OR claim_record.benefit_entitlement_id IS DISTINCT FROM allocated.benefit_entitlement_id
  THEN RAISE EXCEPTION 'Claim line lacks matching approved allocation'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER claim_line_authority BEFORE INSERT OR UPDATE ON funding_claim_lines
  FOR EACH ROW EXECUTE FUNCTION assert_claim_line_authority();

-- Never silently use a rejected review to instantiate an approved product.
CREATE OR REPLACE FUNCTION assert_blueprint_output_approved() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM blueprint_execution_batches b
  JOIN configuration_reviews r ON r.id=b.review_id
  WHERE b.id=NEW.execution_batch_id AND b.configuration_version_id=NEW.configuration_version_id
   AND b.blueprint_version_id=NEW.blueprint_version_id AND b.review_id=NEW.review_id
   AND b.execution_status='executed' AND r.decision='approved') THEN
   RAISE EXCEPTION 'Blueprint output requires an executed approved batch'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER blueprint_output_review BEFORE INSERT OR UPDATE ON blueprint_outputs
  FOR EACH ROW EXECUTE FUNCTION assert_blueprint_output_approved();

-- Versioned source documents and disclosure events cannot be rewritten.
CREATE TRIGGER evidence_version_append_only BEFORE UPDATE OR DELETE ON evidence_document_versions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER disclosure_append_only BEFORE UPDATE OR DELETE ON learner_data_disclosures
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();

-- 10b. Publication, creator supply and independent grading invariants.
CREATE OR REPLACE FUNCTION protect_course_owned_children() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE state_before text; state_after text;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  SELECT lifecycle INTO state_before FROM course_versions WHERE id=OLD.course_version_id;
  IF state_before='published' THEN RAISE EXCEPTION 'Official course requirements are immutable after publication'; END IF;
 END IF;
 IF TG_OP <> 'DELETE' THEN
  SELECT lifecycle INTO state_after FROM course_versions WHERE id=NEW.course_version_id;
  IF state_after='published' THEN RAISE EXCEPTION 'Cannot add or change official requirements on published course'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER official_requirements_immutable BEFORE INSERT OR UPDATE OR DELETE ON official_course_requirement_versions
 FOR EACH ROW EXECUTE FUNCTION protect_course_owned_children();
CREATE TRIGGER official_assignment_versions_immutable BEFORE INSERT OR UPDATE OR DELETE ON official_course_assignment_versions
 FOR EACH ROW EXECUTE FUNCTION protect_course_owned_children();
CREATE TRIGGER official_grading_policies_immutable BEFORE INSERT OR UPDATE OR DELETE ON course_grading_policy_versions
 FOR EACH ROW EXECUTE FUNCTION protect_course_owned_children();

CREATE OR REPLACE FUNCTION protect_track_presentation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE s text; submitted_hash text;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT lifecycle,submission_manifest_hash INTO s,submitted_hash
    FROM instructional_track_versions WHERE id=OLD.track_version_id;
  IF s='published' OR submitted_hash IS NOT NULL THEN
   RAISE EXCEPTION 'Submitted instructional track content is immutable'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT lifecycle,submission_manifest_hash INTO s,submitted_hash
    FROM instructional_track_versions WHERE id=NEW.track_version_id;
  IF s='published' OR submitted_hash IS NOT NULL THEN
   RAISE EXCEPTION 'Cannot change submitted instructional track content'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_presentation_immutable BEFORE INSERT OR UPDATE OR DELETE ON track_lesson_presentations
 FOR EACH ROW EXECUTE FUNCTION protect_track_presentation();

CREATE OR REPLACE FUNCTION validate_track_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE author uuid; presenter uuid; rev_kind text; current_review record; required_count integer; covered_count integer;
BEGIN
 IF NEW.lifecycle<>'published' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.lifecycle='published' THEN RETURN NEW; END IF;
 SELECT v.created_by_person_id,t.presenter_person_id INTO author,presenter
   FROM instructional_track_versions v
   JOIN instructional_tracks t ON t.id=v.instructional_track_id
   WHERE v.id=NEW.id;
 IF NOT EXISTS (SELECT 1 FROM course_versions WHERE id=NEW.course_version_id AND lifecycle='published') THEN
  RAISE EXCEPTION 'Cannot publish track against unpublished course';
 END IF;
 IF NEW.submission_manifest_hash IS NULL OR NEW.submitted_by_person_id IS NULL
   OR NEW.submitted_at IS NULL THEN
  RAISE EXCEPTION 'Track publication requires a submitted immutable manifest';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM content_publication_manifests m
   WHERE m.track_version_id=NEW.id AND m.manifest_hash=NEW.submission_manifest_hash
     AND m.manifest_status='approved'
     AND NOT EXISTS (
       SELECT 1 FROM track_lesson_presentations lp
       WHERE lp.track_version_id=NEW.id
         AND NOT EXISTS (
           SELECT 1 FROM content_publication_manifest_items mi
           WHERE mi.manifest_id=m.id
             AND mi.content_asset_version_id=lp.asset_version_id
         )
     )) THEN
  RAISE EXCEPTION 'Track publication requires an approved content publication manifest';
 END IF;
 FOREACH rev_kind IN ARRAY CASE
   WHEN NEW.track_kind='primary'
     THEN ARRAY['academic','rights','accessibility','coverage','safeguarding']
   ELSE ARRAY['academic','rights','accessibility','safeguarding']
 END LOOP
  SELECT decision,reviewer_person_id INTO current_review FROM instructional_track_reviews
    WHERE track_version_id=NEW.id AND manifest_hash=NEW.submission_manifest_hash
      AND review_kind=rev_kind
    ORDER BY decision_order DESC LIMIT 1;
  IF current_review IS NULL OR current_review.decision<>'approved'
     OR current_review.reviewer_person_id=author OR current_review.reviewer_person_id=presenter THEN
   RAISE EXCEPTION 'Independent % approval required for track publication', rev_kind;
  END IF;
  current_review:=NULL;
 END LOOP;
 IF NEW.track_kind='primary' THEN
  SELECT count(*) INTO required_count FROM course_lessons WHERE course_version_id=NEW.course_version_id;
  SELECT count(DISTINCT course_lesson_id) INTO covered_count FROM track_lesson_presentations
    WHERE track_version_id=NEW.id AND presentation_kind='primary';
  IF required_count=0 OR covered_count<>required_count THEN
    RAISE EXCEPTION 'Primary track must cover every official course lesson';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_publication_gate BEFORE INSERT OR UPDATE ON instructional_track_versions
 FOR EACH ROW EXECUTE FUNCTION validate_track_publication();

CREATE OR REPLACE FUNCTION protect_supplement_tasks() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE s text;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT lifecycle INTO s FROM instructor_supplement_versions WHERE id=OLD.supplement_version_id;
  IF s='published' THEN RAISE EXCEPTION 'Published supplement tasks are immutable'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT lifecycle INTO s FROM instructor_supplement_versions WHERE id=NEW.supplement_version_id;
  IF s='published' THEN RAISE EXCEPTION 'Cannot add task to published supplement'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER supplement_tasks_immutable BEFORE INSERT OR UPDATE OR DELETE ON instructor_supplement_tasks
 FOR EACH ROW EXECUTE FUNCTION protect_supplement_tasks();
CREATE TRIGGER supplement_versions_immutable BEFORE UPDATE OR DELETE ON instructor_supplement_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE OR REPLACE FUNCTION validate_supplement_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE author uuid; kind text; review_row record;
BEGIN
 IF NEW.lifecycle<>'published' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.lifecycle='published' THEN RETURN NEW; END IF;
 SELECT author_person_id INTO author FROM instructor_supplements WHERE id=NEW.supplement_id;
 IF NOT EXISTS (SELECT 1 FROM instructor_supplement_tasks WHERE supplement_version_id=NEW.id)
  THEN RAISE EXCEPTION 'Published supplement requires real tasks'; END IF;
 FOREACH kind IN ARRAY ARRAY['academic','rights','accessibility'] LOOP
  SELECT decision,reviewer_person_id INTO review_row FROM instructor_supplement_reviews
    WHERE supplement_version_id=NEW.id AND review_kind=kind ORDER BY decision_order DESC LIMIT 1;
  IF review_row IS NULL OR review_row.decision<>'approved' OR review_row.reviewer_person_id=author THEN
   RAISE EXCEPTION 'Independent % review missing on supplement',kind;
  END IF;
  review_row:=NULL;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER supplement_publication_gate BEFORE INSERT OR UPDATE ON instructor_supplement_versions
 FOR EACH ROW EXECUTE FUNCTION validate_supplement_publication();

CREATE OR REPLACE FUNCTION protect_release_requirements() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE old_state text; new_state text;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT lifecycle INTO old_state FROM offering_versions WHERE id=OLD.offering_version_id;
  IF old_state='published' THEN RAISE EXCEPTION 'Cannot mutate published offering release policy'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT lifecycle INTO new_state FROM offering_versions WHERE id=NEW.offering_version_id;
  IF new_state='published' THEN RAISE EXCEPTION 'Cannot add requirements to published offering'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offering_release_req_immutable BEFORE INSERT OR UPDATE OR DELETE ON offering_release_requirements
 FOR EACH ROW EXECUTE FUNCTION protect_release_requirements();

CREATE OR REPLACE FUNCTION validate_offering_release() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE c record; n integer; covered boolean;
BEGIN
 IF NEW.lifecycle<>'published' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.lifecycle='published' THEN RETURN NEW; END IF;
 FOR c IN SELECT oc.course_version_id,r.minimum_approved_primary_tracks,r.complete_lesson_coverage_required
  FROM offering_courses oc LEFT JOIN offering_release_requirements r
   ON r.offering_version_id=oc.offering_version_id AND r.course_version_id=oc.course_version_id
  WHERE oc.offering_version_id=NEW.id AND oc.is_required LOOP
  IF c.minimum_approved_primary_tracks IS NULL THEN
   RAISE EXCEPTION 'Each required course needs a declared offering release requirement';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM course_versions WHERE id=c.course_version_id AND lifecycle='published') THEN
   RAISE EXCEPTION 'Required course is not published';
  END IF;
  SELECT count(DISTINCT tv.id) INTO n FROM instructional_track_versions tv
  JOIN track_distribution_authorizations td ON td.track_version_id=tv.id
    AND td.approved_offering_id=NEW.offering_id AND td.status='approved'
    AND td.valid_from<=now() AND (td.valid_through IS NULL OR td.valid_through>now())
  WHERE tv.course_version_id=c.course_version_id AND tv.lifecycle='published' AND tv.track_kind='primary'
   AND NOT EXISTS(SELECT 1 FROM content_withdrawals w WHERE w.track_version_id=tv.id AND w.effective_at<=now());
  IF n<c.minimum_approved_primary_tracks THEN
   RAISE EXCEPTION 'Offering lacks approved primary recorded instruction';
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER offering_release_gate BEFORE INSERT OR UPDATE ON offering_versions
 FOR EACH ROW EXECUTE FUNCTION validate_offering_release();

-- A teacher cannot approve their own commissioned production or grade work
-- for any learner that selected their recorded instructor on the same course attempt.
CREATE OR REPLACE FUNCTION validate_production_acceptance() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE creator uuid; kind text; r record;
BEGIN
 IF NEW.status<>'accepted' OR OLD.status='accepted' THEN RETURN NEW; END IF;
 SELECT cc.creator_person_id INTO creator FROM creator_commissions cc WHERE cc.id=NEW.commission_id;
 FOREACH kind IN ARRAY ARRAY['academic','rights','accessibility','technical'] LOOP
  SELECT decision,reviewer_person_id INTO r FROM production_review_decisions
   WHERE deliverable_id=NEW.id AND review_kind=kind ORDER BY decision_order DESC LIMIT 1;
  IF r IS NULL OR r.decision<>'approved' OR r.reviewer_person_id=creator THEN
    RAISE EXCEPTION 'Accepted deliverable needs independent % approval',kind;
  END IF;
  r:=NULL;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER deliverable_acceptance_gate BEFORE UPDATE OF status ON production_deliverables
 FOR EACH ROW EXECUTE FUNCTION validate_production_acceptance();

CREATE OR REPLACE FUNCTION validate_grading_appointment() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE c text;
BEGIN
 IF NEW.status<>'approved' THEN RETURN NEW; END IF;
 IF NEW.capability_authorization_id IS NULL OR NEW.capability_id IS NULL THEN
  RAISE EXCEPTION 'Grader assignment must reference verified service authorization';
 END IF;
 SELECT code INTO c FROM service_capabilities WHERE id=NEW.capability_id;
 IF c<>'independent_grader' THEN RAISE EXCEPTION 'Cannot authorize grading through another service capability'; END IF;
 IF NOT EXISTS (SELECT 1 FROM professional_capability_authorizations
  WHERE id=NEW.capability_authorization_id AND decision='approved'
    AND valid_from<=NEW.starts_at AND (valid_through IS NULL OR valid_through>NEW.starts_at)) THEN
  RAISE EXCEPTION 'Grader capability is not currently approved'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approved_grading_appointment BEFORE INSERT OR UPDATE ON grading_assignments
 FOR EACH ROW EXECUTE FUNCTION validate_grading_appointment();

CREATE OR REPLACE FUNCTION validate_independent_grade() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; attempt_id uuid; assigned_learner_id uuid;
BEGIN
 SELECT ga.grader_person_id,ga.status,ga.starts_at,ga.ends_at,ga.deployment_id,ga.section_id,ga.capability_authorization_id
  INTO a FROM grading_assignments ga WHERE ga.id=NEW.grading_assignment_id;
 SELECT gs.course_attempt_id INTO attempt_id FROM graded_submissions gs WHERE gs.id=NEW.graded_submission_id;
 IF a.status<>'approved' OR a.grader_person_id<>NEW.grader_person_id
  OR a.starts_at>NEW.decided_at OR (a.ends_at IS NOT NULL AND a.ends_at<=NEW.decided_at)
  THEN RAISE EXCEPTION 'Grade lacks current authorized independent grader assignment'; END IF;
 IF NOT EXISTS (SELECT 1 FROM professional_capability_authorizations ac
  WHERE ac.id=a.capability_authorization_id AND ac.decision='approved'
    AND ac.valid_from<=NEW.decided_at
    AND (ac.valid_through IS NULL OR ac.valid_through>NEW.decided_at)) THEN
    RAISE EXCEPTION 'Official grader has no currently approved professional authority';
 END IF;
 IF a.deployment_id IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM learner_course_attempts lca WHERE lca.id=attempt_id AND lca.deployment_id=a.deployment_id) THEN
   RAISE EXCEPTION 'Grading assignment belongs to another deployment'; END IF;
 IF a.section_id IS NOT NULL AND NOT EXISTS
   (SELECT 1 FROM learner_course_attempts lca WHERE lca.id=attempt_id AND lca.section_id=a.section_id) THEN
   RAISE EXCEPTION 'Grading assignment belongs to another section'; END IF;
 IF EXISTS (
   SELECT 1 FROM learner_track_selections s
   JOIN instructional_track_versions tv ON tv.id=s.track_version_id
   JOIN instructional_tracks t ON t.id=tv.instructional_track_id
   WHERE s.course_attempt_id=attempt_id AND t.presenter_person_id=NEW.grader_person_id
 ) THEN RAISE EXCEPTION 'Recorded presenter cannot independently grade their learner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER independent_grading_gate BEFORE INSERT OR UPDATE ON grading_decisions
 FOR EACH ROW EXECUTE FUNCTION validate_independent_grade();

CREATE OR REPLACE FUNCTION validate_primary_track_selection() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE kind_val text; policy_row instructional_track_policy_versions%ROWTYPE;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF ROW(NEW.id,NEW.course_attempt_id,NEW.course_version_id,NEW.track_version_id,
       NEW.policy_version_id,NEW.revision,NEW.selected_at,NEW.selected_by_person_id,
       NEW.selection_source,NEW.switch_reason)
       IS DISTINCT FROM
      ROW(OLD.id,OLD.course_attempt_id,OLD.course_version_id,OLD.track_version_id,
       OLD.policy_version_id,OLD.revision,OLD.selected_at,OLD.selected_by_person_id,
       OLD.selection_source,OLD.switch_reason)
      OR OLD.superseded_at IS NOT NULL OR NEW.superseded_at IS NULL
      OR NEW.superseded_at<=OLD.selected_at THEN
     RAISE EXCEPTION 'Track selection is immutable except for one valid supersession';
   END IF;
   RETURN NEW;
 END IF;
 NEW.selected_at:=clock_timestamp();
 SELECT track_kind INTO kind_val FROM instructional_track_versions
   WHERE id=NEW.track_version_id AND lifecycle='published';
 IF kind_val IS DISTINCT FROM 'primary' THEN RAISE EXCEPTION 'Primary choice needs published track'; END IF;
 SELECT p.* INTO policy_row
   FROM instructional_track_policy_versions p
   JOIN learner_course_attempts ca ON ca.adoption_id=p.adoption_id
     AND ca.deployment_id=p.deployment_id
     AND ca.offering_version_id=p.offering_version_id
     AND ca.course_version_id=p.course_version_id
   WHERE ca.id=NEW.course_attempt_id AND p.id=NEW.policy_version_id
     AND p.lifecycle='published' AND p.delivery_enabled
     AND p.effective_from<=NEW.selected_at
     AND (p.effective_through IS NULL OR p.effective_through>NEW.selected_at)
     AND NOT EXISTS(SELECT 1 FROM instructional_track_policy_withdrawals w
       WHERE w.policy_version_id=p.id AND w.effective_at<=NEW.selected_at);
 IF NOT FOUND THEN RAISE EXCEPTION 'Selection requires a current published policy allowing learner choice'; END IF;
 IF NEW.selection_source IN ('learner','authorized_assistance')
    AND NOT policy_row.student_choice_enabled THEN
   RAISE EXCEPTION 'Current instructional policy does not allow learner choice';
 END IF;
 IF NEW.selection_source='guardian' AND policy_row.selection_policy<>'guardian' THEN
   RAISE EXCEPTION 'Current instructional policy does not allow guardian selection';
 END IF;
 IF NEW.selection_source IN ('learner','authorized_assistance')
    AND policy_row.selection_policy<>'student' THEN
   RAISE EXCEPTION 'Current instructional policy does not allow learner selection';
 END IF;
 -- A renewed policy receipt for the same presenter is not a teacher switch.
 IF NOT policy_row.allow_switching AND EXISTS (
   SELECT 1 FROM (
     SELECT prior_selection.track_version_id FROM learner_track_selections AS prior_selection
     WHERE prior_selection.course_attempt_id=NEW.course_attempt_id
     ORDER BY prior_selection.revision DESC LIMIT 1
   ) latest WHERE latest.track_version_id<>NEW.track_version_id
 ) THEN
   RAISE EXCEPTION 'Current instructional policy does not allow switching';
 END IF;
 IF NEW.revision IS DISTINCT FROM (
    SELECT COALESCE(max(prior_selection.revision),0)+1 FROM learner_track_selections AS prior_selection
    WHERE prior_selection.course_attempt_id=NEW.course_attempt_id
 ) THEN
   RAISE EXCEPTION 'Track selection revision must advance monotonically';
 END IF;
 IF EXISTS(SELECT 1 FROM content_withdrawals w WHERE w.track_version_id=NEW.track_version_id
    AND w.effective_at<=NEW.selected_at) THEN
  RAISE EXCEPTION 'Cannot select withdrawn track'; END IF;
 IF NOT EXISTS(SELECT 1 FROM learner_course_attempts ca
    WHERE ca.id=NEW.course_attempt_id
      AND v301_track_distribution_allowed(NEW.track_version_id,ca.deployment_id,NEW.selected_at)) THEN
   RAISE EXCEPTION 'Recorded teacher has no approved offering/operation distribution rights'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_selection_published BEFORE INSERT OR UPDATE ON learner_track_selections
 FOR EACH ROW EXECUTE FUNCTION validate_primary_track_selection();

-- Evaluation and usage evidence are append-only; a correction is another decision.
CREATE TRIGGER grading_decision_append_only BEFORE UPDATE OR DELETE ON grading_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER production_reviews_append_only BEFORE UPDATE OR DELETE ON production_review_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER track_reviews_append_only BEFORE UPDATE OR DELETE ON instructional_track_reviews
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER supplement_reviews_append_only BEFORE UPDATE OR DELETE ON instructor_supplement_reviews
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER supplement_withdrawals_append_only BEFORE UPDATE OR DELETE ON instructor_supplement_withdrawals
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER usage_events_append_only BEFORE UPDATE OR DELETE ON content_usage_events
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER qualified_usage_append_only BEFORE UPDATE OR DELETE ON qualified_creator_usage
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER approved_supplement_academic_sources_append_only BEFORE UPDATE OR DELETE ON approved_supplement_assessment_sources
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();

CREATE INDEX professional_deliverables_by_commission_idx ON production_deliverables(commission_id,status);
CREATE INDEX learner_active_selection_idx ON learner_track_selections(course_attempt_id,superseded_at);
CREATE INDEX official_assignments_by_course_idx ON official_course_assignment_versions(course_version_id);
CREATE INDEX grader_assignments_by_grader_idx ON grading_assignments(grader_person_id,course_version_id,status);
CREATE INDEX service_request_queue_idx ON professional_service_requests(capability_id,status,requested_at);
CREATE INDEX content_usage_events_session_idx ON content_usage_events(session_id,occurred_at);
CREATE OR REPLACE FUNCTION validate_workforce_earning() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE rec record;
BEGIN
 SELECT t.basis,a.state,a.valid_from,a.valid_through INTO rec
 FROM workforce_compensation_terms t JOIN workforce_compensation_agreements a ON a.id=t.agreement_id
 WHERE t.id=NEW.compensation_term_id;
 IF rec.state NOT IN ('accepted','active') OR rec.valid_from>NEW.accrued_at
    OR (rec.valid_through IS NOT NULL AND rec.valid_through<=NEW.accrued_at) THEN
  RAISE EXCEPTION 'Accrual without active signed compensation agreement';
 END IF;
 IF (NEW.qualified_usage_id IS NOT NULL AND rec.basis<>'qualified_usage') OR
    (NEW.production_deliverable_id IS NOT NULL AND rec.basis<>'accepted_deliverable') OR
    (NEW.service_delivery_record_id IS NOT NULL AND rec.basis<>'completed_service') OR
    (NEW.contractual_milestone_id IS NOT NULL AND rec.basis<>'milestone') THEN
  RAISE EXCEPTION 'Earning source does not match compensation basis'; END IF;
 IF NEW.production_deliverable_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM production_deliverables WHERE id=NEW.production_deliverable_id AND status='accepted') THEN
  RAISE EXCEPTION 'Unaccepted work cannot earn production fee'; END IF;
 IF NEW.service_delivery_record_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM professional_service_delivery_records WHERE id=NEW.service_delivery_record_id AND verified_at IS NOT NULL) THEN
  RAISE EXCEPTION 'Unverified service cannot earn pay'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER earnings_policy_gate BEFORE INSERT OR UPDATE ON workforce_earning_events
 FOR EACH ROW EXECUTE FUNCTION validate_workforce_earning();
CREATE INDEX workforce_earnings_status_idx ON workforce_earning_events(status,accrued_at);

-- High-volume operational indexes.
CREATE INDEX operation_org_roles_idx ON education_operation_organization_roles(operation_id,role_code,valid_from);
CREATE INDEX operation_sites_site_idx ON education_operation_sites(site_id,valid_from);
CREATE INDEX network_memberships_org_idx ON network_memberships(organization_id,network_id);
CREATE INDEX operation_network_idx ON network_operation_participations(operation_id,network_id);
CREATE INDEX blueprint_config_versions_idx ON blueprint_configuration_versions(configuration_id,revision DESC);
CREATE INDEX blueprint_local_experiences_version_idx
  ON blueprint_configuration_local_experiences(configuration_version_id,component_id);
CREATE INDEX offerings_publisher_idx ON offerings(publisher_organization_id);
CREATE INDEX deployments_offering_idx ON program_deployments(offering_id,status);
CREATE INDEX deployments_operation_idx ON program_deployments(operation_id,status);
CREATE INDEX adoption_time_idx ON deployment_offering_adoptions(deployment_id,valid_from DESC);
CREATE INDEX deployment_sites_site_idx ON deployment_sites(site_id,deployment_id);
CREATE INDEX enrollment_learner_idx ON enrollments(learner_id,enrolled_at DESC);
CREATE INDEX enrollment_deployment_idx ON enrollments(deployment_id,status);
CREATE INDEX course_attempt_enrollment_idx ON learner_course_attempts(enrollment_id);
CREATE INDEX unit_progress_attempt_idx ON learner_unit_progress(course_attempt_id);
CREATE INDEX practice_attempt_idx ON formative_practice_attempts(course_attempt_id,recorded_at DESC);
CREATE INDEX official_auth_scopes_site_idx ON official_authorization_scopes(site_id);
CREATE INDEX official_auth_scopes_dep_idx ON official_authorization_scopes(deployment_id);
CREATE INDEX funding_allocations_source_idx ON funding_allocations(source_id,status);
CREATE INDEX learner_disclosures_learner_idx ON learner_data_disclosures(learner_id,disclosed_at DESC);
CREATE INDEX audit_events_time_idx ON audit_events(occurred_at DESC);

-- Deny access by default for sensitive learner tables until purpose-bound policies
-- are installed, audited and enabled in the actual application service boundary.
-- Table ownership roles must not be used for runtime application reads.
ALTER TABLE learner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_course_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_distribution_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_unit_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE formative_practice_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_policy_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_lesson_presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE published_asset_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE graded_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_course_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_credit_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_issuances ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_data_disclosures ENABLE ROW LEVEL SECURITY;

ALTER TABLE professional_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_screening_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_capability_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_service_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_service_delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_track_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_supplement_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_usage_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE qualified_creator_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_earning_events ENABLE ROW LEVEL SECURITY;

-- Bind SECURITY INVOKER trigger functions to the canonical schema. PostgreSQL
-- functions otherwise inherit caller search_path; calls from public.* can fail or
-- resolve attacker-controlled objects. pg_catalog remains implicit for built-ins.
ALTER FUNCTION reject_published_version_mutation() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION reject_immutable_insert_only() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION assert_source_allocation_ceiling() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION assert_track_material_course() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION reject_published_child_mutation() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION assert_fundable_source_ceiling() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION assert_entitlement_allocation_ceiling() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION assert_claim_line_authority() SET search_path = education_v30, pg_catalog;
ALTER FUNCTION assert_blueprint_output_approved() SET search_path = education_v30, pg_catalog;

-- 08B. Assessment lifecycle invariants. Functions resolve within canonical schema.
CREATE OR REPLACE FUNCTION validate_assessment_definition_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE d record; actual_course uuid;
BEGIN
 SELECT purpose,course_id INTO d FROM assessment_definitions WHERE id=NEW.assessment_id;
 IF d.purpose='official' AND (NEW.course_version_id IS NULL OR d.course_id IS NULL) THEN
   RAISE EXCEPTION 'Official assessment must belong to a published course family/version'; END IF;
 IF d.course_id IS NOT NULL THEN
  SELECT course_id INTO actual_course FROM course_versions WHERE id=NEW.course_version_id;
  IF actual_course IS DISTINCT FROM d.course_id THEN
   RAISE EXCEPTION 'Assessment course version does not match assessment definition'; END IF;
 ELSIF NEW.course_version_id IS NOT NULL THEN
  RAISE EXCEPTION 'General-purpose assessment definition cannot quietly acquire a course version';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_definition_course_scope BEFORE INSERT OR UPDATE OF assessment_id,course_version_id
ON assessment_versions FOR EACH ROW EXECUTE FUNCTION validate_assessment_definition_version();

CREATE OR REPLACE FUNCTION validate_official_assignment_assessment() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.assessment_version_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM assessment_versions av JOIN assessment_definitions ad ON ad.id=av.assessment_id
   WHERE av.id=NEW.assessment_version_id AND ad.purpose='official'
    AND av.course_version_id=NEW.course_version_id) THEN
   RAISE EXCEPTION 'Official graded assignment must reference an official assessment of this course'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER official_assignment_assessment_guard BEFORE INSERT OR UPDATE OF assessment_version_id,course_version_id
 ON graded_assignments FOR EACH ROW EXECUTE FUNCTION validate_official_assignment_assessment();

CREATE OR REPLACE FUNCTION validate_assessment_version_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE k text;
BEGIN
 IF NEW.lifecycle='published' AND (TG_OP='INSERT' OR OLD.lifecycle<>'published') THEN
   FOREACH k IN ARRAY CASE WHEN EXISTS(
     SELECT 1 FROM assessment_definitions d WHERE d.id=NEW.assessment_id AND d.purpose='credential')
       THEN ARRAY['academic','rights','accessibility','independent','psychometric']
       ELSE ARRAY['academic','rights','accessibility','independent'] END LOOP
     IF NOT EXISTS(SELECT 1 FROM assessment_version_review_decisions r
        WHERE r.assessment_version_id=NEW.id AND r.review_kind=k AND r.decision='approved'
          AND NOT EXISTS (SELECT 1 FROM assessment_version_review_decisions newer
           WHERE newer.assessment_version_id=r.assessment_version_id AND newer.review_kind=k
             AND newer.decision_order>r.decision_order)) THEN
       RAISE EXCEPTION 'Assessment definition release lacks approved % review',k; END IF;
   END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_release_publication BEFORE INSERT OR UPDATE OF lifecycle ON assessment_versions
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_version_publication();

CREATE OR REPLACE FUNCTION validate_assessment_item_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE k text; author uuid;
BEGIN
 IF NEW.lifecycle='published' AND (TG_OP='INSERT' OR OLD.lifecycle<>'published') THEN
  SELECT created_by_person_id INTO author FROM assessment_items WHERE id=NEW.item_id;
  FOREACH k IN ARRAY ARRAY['academic','accessibility','rights'] LOOP
   IF NOT EXISTS(SELECT 1 FROM assessment_item_review_decisions r
     WHERE r.item_version_id=NEW.id AND r.review_kind=k AND r.decision='approved'
       AND (author IS NULL OR r.reviewer_person_id<>author)
       AND NOT EXISTS(SELECT 1 FROM assessment_item_review_decisions newer
         WHERE newer.item_version_id=r.item_version_id AND newer.review_kind=k
           AND newer.decision_order>r.decision_order)) THEN
     RAISE EXCEPTION 'Assessment item missing most recent approved % review',k;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_item_version_publication BEFORE INSERT OR UPDATE OF lifecycle ON assessment_item_versions
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_item_publication();

CREATE OR REPLACE FUNCTION protect_published_assessment_part() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE state text;
BEGIN
 IF TG_TABLE_NAME IN ('assessment_item_secure_keys','assessment_item_assets','assessment_item_competencies','assessment_item_options') THEN
   SELECT lifecycle INTO state FROM assessment_item_versions
     WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.item_version_id ELSE NEW.item_version_id END;
 ELSIF TG_TABLE_NAME='assessment_form_items' THEN
   SELECT lifecycle INTO state FROM assessment_form_versions
     WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.form_version_id ELSE NEW.form_version_id END;
 ELSIF TG_TABLE_NAME='assessment_form_sections' THEN
   SELECT lifecycle INTO state FROM assessment_form_versions
     WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.form_version_id ELSE NEW.form_version_id END;
 END IF;
 IF state='published' THEN RAISE EXCEPTION 'Cannot change published assessment content: %',TG_TABLE_NAME; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER assessment_item_options_freeze BEFORE INSERT OR UPDATE OR DELETE ON assessment_item_options
 FOR EACH ROW EXECUTE FUNCTION protect_published_assessment_part();
CREATE TRIGGER assessment_item_secret_freeze BEFORE INSERT OR UPDATE OR DELETE ON assessment_item_secure_keys
 FOR EACH ROW EXECUTE FUNCTION protect_published_assessment_part();
CREATE TRIGGER assessment_item_assets_freeze BEFORE INSERT OR UPDATE OR DELETE ON assessment_item_assets
 FOR EACH ROW EXECUTE FUNCTION protect_published_assessment_part();
CREATE TRIGGER assessment_item_competencies_freeze BEFORE INSERT OR UPDATE OR DELETE ON assessment_item_competencies
 FOR EACH ROW EXECUTE FUNCTION protect_published_assessment_part();
CREATE TRIGGER assessment_form_sections_freeze BEFORE INSERT OR UPDATE OR DELETE ON assessment_form_sections
 FOR EACH ROW EXECUTE FUNCTION protect_published_assessment_part();
CREATE TRIGGER assessment_form_items_freeze BEFORE INSERT OR UPDATE OR DELETE ON assessment_form_items
 FOR EACH ROW EXECUTE FUNCTION protect_published_assessment_part();

CREATE OR REPLACE FUNCTION validate_assessment_form_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE sec record; n integer; k text;
BEGIN
 IF NEW.lifecycle='published' AND (TG_OP='INSERT' OR OLD.lifecycle<>'published') THEN
  IF NOT EXISTS (SELECT 1 FROM assessment_versions av WHERE av.id=NEW.assessment_version_id AND av.lifecycle='published') THEN
   RAISE EXCEPTION 'Assessment version must be published before form publication'; END IF;
  IF NOT EXISTS (SELECT 1 FROM assessment_form_sections WHERE form_version_id=NEW.id) THEN
   RAISE EXCEPTION 'Assessment form must contain sections'; END IF;
  FOR sec IN SELECT * FROM assessment_form_sections WHERE form_version_id=NEW.id LOOP
    SELECT count(*) INTO n FROM assessment_form_items WHERE form_section_id=sec.id;
    IF n=0 OR (sec.selection_mode='random_pool' AND n<sec.selection_count) THEN
     RAISE EXCEPTION 'Assessment form section has insufficient items'; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM assessment_form_items fi
      JOIN assessment_item_versions iv ON iv.id=fi.item_version_id
      WHERE fi.form_version_id=NEW.id AND iv.lifecycle<>'published') THEN
    RAISE EXCEPTION 'Form contains an unpublished question version'; END IF;
  FOREACH k IN ARRAY CASE WHEN EXISTS (
     SELECT 1 FROM assessment_versions av JOIN assessment_definitions d ON d.id=av.assessment_id
       WHERE av.id=NEW.assessment_version_id AND d.purpose='credential')
       THEN ARRAY['academic','rights','accessibility','psychometric']
       ELSE ARRAY['academic','rights','accessibility'] END LOOP
   IF NOT EXISTS (SELECT 1 FROM assessment_form_review_decisions r
      WHERE r.form_version_id=NEW.id AND r.review_kind=k AND r.decision='approved'
       AND NOT EXISTS(SELECT 1 FROM assessment_form_review_decisions newer
         WHERE newer.form_version_id=r.form_version_id AND newer.review_kind=k
           AND newer.decision_order>r.decision_order)) THEN
      RAISE EXCEPTION 'Assessment form missing most recent approved % review',k;
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_form_publication BEFORE INSERT OR UPDATE OF lifecycle ON assessment_form_versions
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_form_publication();
CREATE TRIGGER assessment_item_version_immutable BEFORE UPDATE OR DELETE ON assessment_item_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER assessment_form_version_immutable BEFORE UPDATE OR DELETE ON assessment_form_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();

CREATE OR REPLACE FUNCTION validate_assessment_administration() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; d record;
BEGIN
 IF NEW.status='open' THEN
  SELECT av.lifecycle, av.course_version_id, av.assessment_id INTO a FROM assessment_versions av WHERE av.id=NEW.assessment_version_id;
  SELECT purpose INTO d FROM assessment_definitions WHERE id=a.assessment_id;
  IF a.lifecycle<>'published' OR NOT EXISTS
    (SELECT 1 FROM assessment_form_versions WHERE id=NEW.form_version_id AND lifecycle='published') THEN
    RAISE EXCEPTION 'Assessment administration cannot open before approved form and assessment publication'; END IF;
  IF d.purpose='official' AND (NEW.course_version_id IS NULL OR NEW.course_version_id<>a.course_version_id) THEN
    RAISE EXCEPTION 'Official administration requires matching course version'; END IF;
  IF d.purpose<>'official' AND NEW.course_version_id IS DISTINCT FROM a.course_version_id THEN
    RAISE EXCEPTION 'Administration course scope differs from definition'; END IF;
  IF NEW.deployment_id IS NOT NULL AND NEW.operation_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM program_deployments WHERE id=NEW.deployment_id AND operation_id=NEW.operation_id) THEN
    RAISE EXCEPTION 'Administration operation and deployment conflict'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_administration_publish BEFORE INSERT OR UPDATE OF status,course_version_id,form_version_id
 ON assessment_administrations FOR EACH ROW EXECUTE FUNCTION validate_assessment_administration();

CREATE OR REPLACE FUNCTION validate_assessment_access_grant() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; purpose text;
BEGIN
 SELECT aa.course_version_id, aa.deployment_id, av.assessment_id INTO a
  FROM assessment_administrations aa JOIN assessment_versions av ON av.id=aa.assessment_version_id
  WHERE aa.id=NEW.administration_id;
 SELECT ad.purpose INTO purpose FROM assessment_definitions ad WHERE ad.id=a.assessment_id;
 IF purpose='official' AND NEW.course_attempt_id IS NULL THEN
   RAISE EXCEPTION 'Official course assessment must have an academic course attempt'; END IF;
 IF NEW.course_attempt_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM learner_course_attempts ca
      LEFT JOIN enrollments e ON e.id=ca.enrollment_id
      LEFT JOIN noncredit_registrations nr ON nr.id=ca.noncredit_registration_id
      WHERE ca.id=NEW.course_attempt_id AND COALESCE(e.learner_id,nr.learner_id)=NEW.learner_id
        AND (a.course_version_id IS NULL OR ca.course_version_id=a.course_version_id)
        AND (a.deployment_id IS NULL OR ca.deployment_id=a.deployment_id)) THEN
    RAISE EXCEPTION 'Assessment access may not cross learner, course or deployment boundaries'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_eligibility_scope BEFORE INSERT OR UPDATE ON assessment_access_grants
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_access_grant();

CREATE OR REPLACE FUNCTION validate_assessment_accommodation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.approval_status='approved' AND EXISTS
    (SELECT 1 FROM assessment_accommodation_decisions a
       WHERE a.access_grant_id=NEW.access_grant_id AND a.approval_status='approved'
         AND a.revision_no>NEW.revision_no) THEN
  RAISE EXCEPTION 'Older accommodation revision cannot supersede approved newer revision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_accommodation_revision BEFORE INSERT ON assessment_accommodation_decisions
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_accommodation();

-- Serialize attempts against the same eligibility record to enforce retake limits
-- even under concurrent requests. Do not count on application-only checking.
CREATE OR REPLACE FUNCTION validate_assessment_attempt_creation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; ac record; extra integer:=0; used integer;
BEGIN
 SELECT g.access_status,g.valid_from,g.valid_through,ad.status AS admin_state,
   ad.opens_at,ad.closes_at,ad.attempt_limit,ad.form_version_id
 INTO a FROM assessment_access_grants g
 JOIN assessment_administrations ad ON ad.id=g.administration_id
 WHERE g.id=NEW.access_grant_id FOR UPDATE OF g;
 IF a.access_status<>'approved' OR a.admin_state<>'open' THEN
   RAISE EXCEPTION 'Assessment access or administration not active'; END IF;
 IF a.valid_from>NEW.created_at OR (a.valid_through IS NOT NULL AND a.valid_through<=NEW.created_at)
  OR (a.opens_at IS NOT NULL AND a.opens_at>NEW.created_at)
  OR (a.closes_at IS NOT NULL AND a.closes_at<=NEW.created_at) THEN
   RAISE EXCEPTION 'Assessment access is outside authorized time window'; END IF;
 IF a.form_version_id<>NEW.form_version_id THEN RAISE EXCEPTION 'Assessment attempt form pin mismatch'; END IF;
 SELECT * INTO ac FROM assessment_accommodation_decisions
   WHERE access_grant_id=NEW.access_grant_id AND approval_status='approved'
   ORDER BY revision_no DESC LIMIT 1;
 IF NEW.accommodation_decision_id IS DISTINCT FROM ac.id THEN
   RAISE EXCEPTION 'Assessment attempt must pin current approved accommodation revision (or NULL)'; END IF;
 extra:=coalesce(ac.extra_attempts,0);
 SELECT count(*) INTO used FROM assessment_attempts WHERE access_grant_id=NEW.access_grant_id;
 IF used>=a.attempt_limit+extra OR NEW.attempt_no<>used+1 THEN
  RAISE EXCEPTION 'Assessment attempt limit or attempt sequencing violated'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_attempt_limit BEFORE INSERT ON assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_attempt_creation();

CREATE OR REPLACE FUNCTION validate_assessment_attempt_start() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE total integer; required integer; section_row record; mins integer; extra integer:=0;
        instant timestamptz:=clock_timestamp(); grant_ok boolean;
BEGIN
 IF TG_OP='INSERT' THEN
   NEW.created_at:=instant;
   IF NEW.state<>'prepared' OR NEW.started_at IS NOT NULL OR NEW.expires_at IS NOT NULL
        OR NEW.submitted_at IS NOT NULL THEN
     RAISE EXCEPTION 'New assessment must be prepared; server controls timing'; END IF;
   RETURN NEW;
 END IF;
 IF ROW(NEW.form_version_id,NEW.access_grant_id,NEW.learner_id,NEW.attempt_no,
     NEW.administration_id,NEW.created_at,NEW.selection_seed,NEW.selection_algorithm_version,
     NEW.accommodation_decision_id,NEW.request_key)
   IS DISTINCT FROM ROW(OLD.form_version_id,OLD.access_grant_id,OLD.learner_id,OLD.attempt_no,
     OLD.administration_id,OLD.created_at,OLD.selection_seed,OLD.selection_algorithm_version,
     OLD.accommodation_decision_id,OLD.request_key) THEN
   RAISE EXCEPTION 'Assessment identity, form, accommodation and snapshot are immutable'; END IF;
 IF OLD.state='prepared' AND NEW.state='in_progress' THEN
   SELECT EXISTS(SELECT 1 FROM assessment_access_grants g
    JOIN assessment_administrations ad ON ad.id=g.administration_id
    WHERE g.id=NEW.access_grant_id AND ad.status='open' AND g.access_status='approved'
     AND g.valid_from<=instant AND (g.valid_through IS NULL OR g.valid_through>instant)
     AND (ad.opens_at IS NULL OR ad.opens_at<=instant)
     AND (ad.closes_at IS NULL OR ad.closes_at>instant)) INTO grant_ok;
   IF NOT grant_ok THEN RAISE EXCEPTION 'Assessment is closed, withdrawn, or outside access window'; END IF;
   FOR section_row IN SELECT fs.id,fs.selection_mode,fs.selection_count
      FROM assessment_form_sections fs WHERE fs.form_version_id=NEW.form_version_id LOOP
     SELECT count(*) INTO total FROM assessment_attempt_items ai
       WHERE ai.attempt_id=NEW.id AND ai.form_item_id IN
          (SELECT id FROM assessment_form_items WHERE form_section_id=section_row.id);
     SELECT count(*) INTO required FROM assessment_form_items WHERE form_section_id=section_row.id;
     IF (section_row.selection_mode='fixed' AND total<>required) OR
        (section_row.selection_mode='random_pool' AND total<>section_row.selection_count) THEN
       RAISE EXCEPTION 'Assessment question snapshot incomplete'; END IF;
   END LOOP;
   NEW.started_at:=instant;
   SELECT COALESCE(ad.time_limit_override_minutes,fv.time_limit_minutes) INTO mins
    FROM assessment_administrations ad JOIN assessment_form_versions fv ON fv.id=ad.form_version_id
    WHERE ad.id=NEW.administration_id;
   IF NEW.accommodation_decision_id IS NOT NULL THEN
     SELECT extra_minutes INTO extra FROM assessment_accommodation_decisions
       WHERE id=NEW.accommodation_decision_id;
   END IF;
   NEW.expires_at:= CASE WHEN mins IS NULL THEN NULL ELSE instant+make_interval(mins=>mins+extra) END;
   NEW.submitted_at:=NULL;
 ELSIF NEW.state=OLD.state THEN
   IF ROW(NEW.started_at,NEW.expires_at,NEW.submitted_at)
        IS DISTINCT FROM ROW(OLD.started_at,OLD.expires_at,OLD.submitted_at) THEN
     RAISE EXCEPTION 'Assessment timestamps cannot be edited'; END IF;
 ELSIF OLD.state='in_progress' AND NEW.state='submitted' THEN
   IF EXISTS(SELECT 1 FROM assessment_administrations ad
       WHERE ad.id=NEW.administration_id AND ad.status IN ('cancelled','closed')) THEN
      RAISE EXCEPTION 'Closed or withdrawn examination cannot be submitted'; END IF;
   IF OLD.expires_at IS NOT NULL AND instant>OLD.expires_at THEN
     RAISE EXCEPTION 'Timed assessment submitted after expiry'; END IF;
   NEW.started_at:=OLD.started_at; NEW.expires_at:=OLD.expires_at; NEW.submitted_at:=instant;
 ELSIF (OLD.state='in_progress' AND NEW.state='voided') OR
       (OLD.state='submitted' AND NEW.state IN ('scored','voided')) OR
       (OLD.state='scored' AND NEW.state IN ('finalized','voided')) THEN
   IF ROW(NEW.started_at,NEW.expires_at,NEW.submitted_at)
      IS DISTINCT FROM ROW(OLD.started_at,OLD.expires_at,OLD.submitted_at) THEN
      RAISE EXCEPTION 'Assessment timestamps are immutable'; END IF;
 ELSE RAISE EXCEPTION 'Invalid assessment state transition'; END IF;
 IF NEW.state='finalized' AND OLD.state<>'finalized' AND NOT EXISTS
   (SELECT 1 FROM assessment_attempt_results WHERE attempt_id=NEW.id AND result_status='finalized') THEN
   RAISE EXCEPTION 'Finalized attempt needs finalized independent assessment result'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_attempt_state BEFORE INSERT OR UPDATE ON assessment_attempts
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_attempt_start();

CREATE OR REPLACE FUNCTION validate_assessment_attempt_item() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; source_mode text; expected_points numeric(12,4);
BEGIN
 SELECT state INTO a FROM assessment_attempts WHERE id=NEW.attempt_id FOR UPDATE;
 IF a.state<>'prepared' THEN RAISE EXCEPTION 'Cannot modify question snapshot after attempt has started'; END IF;
 IF NOT EXISTS (SELECT 1 FROM assessment_item_versions WHERE id=NEW.item_version_id AND lifecycle='published') THEN
   RAISE EXCEPTION 'Only published question versions may be served'; END IF;
 SELECT s.selection_mode INTO source_mode FROM assessment_form_items fi
  JOIN assessment_form_sections s ON s.id=fi.form_section_id WHERE fi.id=NEW.form_item_id;
 IF source_mode IS NULL THEN RAISE EXCEPTION 'Missing form item'; END IF;
 SELECT coalesce(fi.points_override,iv.maximum_points) INTO expected_points
 FROM assessment_form_items fi JOIN assessment_item_versions iv ON iv.id=fi.item_version_id
 WHERE fi.id=NEW.form_item_id;
 IF NEW.points_available IS DISTINCT FROM expected_points THEN
   RAISE EXCEPTION 'Attempt item points must match published assessment form'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_attempt_items_pinned BEFORE INSERT OR UPDATE ON assessment_attempt_items
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_attempt_item();
CREATE OR REPLACE FUNCTION prevent_attempt_snapshot_edit() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF (SELECT state FROM assessment_attempts WHERE id=OLD.attempt_id)<>'prepared' THEN
  RAISE EXCEPTION 'Assessment snapshot cannot be changed after start'; END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER assessment_attempt_item_remove BEFORE DELETE ON assessment_attempt_items
 FOR EACH ROW EXECUTE FUNCTION prevent_attempt_snapshot_edit();

CREATE OR REPLACE FUNCTION validate_assessment_response() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE st text; expiry timestamptz;
BEGIN
 SELECT a.state,a.expires_at INTO st,expiry FROM assessment_attempts a JOIN assessment_attempt_items ai ON ai.attempt_id=a.id
  WHERE ai.id=NEW.attempt_item_id;
 IF st<>'in_progress' THEN RAISE EXCEPTION 'Cannot change answers outside active attempt'; END IF;
 IF expiry IS NOT NULL AND clock_timestamp()>expiry THEN RAISE EXCEPTION 'Timed assessment has expired'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_response_live BEFORE INSERT ON assessment_response_versions
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_response();

CREATE OR REPLACE FUNCTION validate_assessment_response_child() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE st text; kind text; count_current integer; expiry timestamptz;
BEGIN
 SELECT a.state,a.expires_at,iv.response_kind INTO st,expiry,kind
 FROM assessment_response_versions rv JOIN assessment_attempt_items ai ON ai.id=rv.attempt_item_id
 JOIN assessment_attempts a ON a.id=ai.attempt_id
 JOIN assessment_item_versions iv ON iv.id=ai.item_version_id
 WHERE rv.id=NEW.response_version_id;
 IF st<>'in_progress' OR (expiry IS NOT NULL AND clock_timestamp()>expiry) THEN
  RAISE EXCEPTION 'Cannot alter response choices or attachments after submission/expiry'; END IF;
 IF TG_TABLE_NAME='assessment_response_choices' THEN
  IF kind NOT IN ('single_select','multi_select','true_false') THEN
   RAISE EXCEPTION 'Response options permitted only for choice-based questions'; END IF;
  IF kind IN ('single_select','true_false') THEN
   -- Serializable per response so concurrent insertions cannot create multiple answers.
   PERFORM 1 FROM assessment_response_versions WHERE id=NEW.response_version_id FOR UPDATE;
   SELECT count(*) INTO count_current FROM assessment_response_choices
     WHERE response_version_id=NEW.response_version_id;
   IF count_current>0 THEN RAISE EXCEPTION 'Only one selection is valid for this item type'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER response_choices_guard BEFORE INSERT ON assessment_response_choices
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_response_child();
CREATE TRIGGER response_assets_guard BEFORE INSERT ON assessment_response_assets
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_response_child();
CREATE TRIGGER response_choices_append_only BEFORE UPDATE OR DELETE ON assessment_response_choices
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER response_assets_append_only BEFORE UPDATE OR DELETE ON assessment_response_assets
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();

CREATE OR REPLACE FUNCTION validate_assessment_scoring() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE m record; ga record; is_submitted boolean; prior_rev integer;
BEGIN
 SELECT ai.points_available,a.administration_id,a.started_at,a.state,g.course_attempt_id
 INTO m FROM assessment_attempt_items ai JOIN assessment_attempts a ON a.id=ai.attempt_id
 JOIN assessment_access_grants g ON g.id=a.access_grant_id WHERE ai.id=NEW.attempt_item_id;
 IF NEW.score>m.points_available THEN RAISE EXCEPTION 'Item score exceeds item point maximum'; END IF;
 SELECT (response_state='submitted') INTO is_submitted FROM assessment_response_versions WHERE id=NEW.response_version_id;
 IF is_submitted IS DISTINCT FROM true THEN RAISE EXCEPTION 'Only submitted responses may be scored'; END IF;
 SELECT revision_no INTO prior_rev FROM assessment_response_versions WHERE id=NEW.response_version_id;
 IF EXISTS (SELECT 1 FROM assessment_response_versions later WHERE later.attempt_item_id=NEW.attempt_item_id
     AND later.revision_no>prior_rev AND later.response_state='submitted') THEN
     RAISE EXCEPTION 'Scoring must use the most recent submitted learner response'; END IF;
 IF m.state NOT IN ('submitted','scored','finalized') THEN RAISE EXCEPTION 'Cannot score an unsubmitted assessment'; END IF;
 IF m.state='finalized' AND NOT EXISTS(SELECT 1 FROM assessment_review_events re
   JOIN assessment_attempt_items ai ON ai.attempt_id=re.attempt_id
   WHERE ai.id=NEW.attempt_item_id AND re.event_kind='regrade_decision'
      AND re.occurred_at<=NEW.scored_at) THEN
   RAISE EXCEPTION 'Finalized assessment requires authorized regrade event before rescoring'; END IF;
 IF NEW.scoring_kind='human' THEN
  SELECT * INTO ga FROM assessment_scoring_assignments WHERE id=NEW.scoring_assignment_id;
  IF ga.status<>'approved' OR ga.administration_id<>m.administration_id
    OR ga.grader_person_id<>NEW.grader_person_id OR ga.begins_at>NEW.scored_at
    OR (ga.ends_at IS NOT NULL AND ga.ends_at<=NEW.scored_at) THEN
    RAISE EXCEPTION 'Assessment scoring lacks active independent grader assignment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM professional_capability_authorizations ca
      JOIN service_capabilities sc ON sc.id=ca.capability_id
      WHERE ca.id=ga.capability_authorization_id AND sc.code='independent_grader'
        AND ca.decision='approved' AND ca.valid_from<=NEW.scored_at
        AND (ca.valid_through IS NULL OR ca.valid_through>NEW.scored_at)) THEN
    RAISE EXCEPTION 'Assessment scorer lacks current independent grading authorization'; END IF;
  IF m.course_attempt_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM learner_track_selections ls JOIN instructional_track_versions tv ON tv.id=ls.track_version_id
    JOIN instructional_tracks it ON it.id=tv.instructional_track_id
    WHERE ls.course_attempt_id=m.course_attempt_id AND it.presenter_person_id=NEW.grader_person_id) THEN
    RAISE EXCEPTION 'Recorded presenter cannot independently grade their learner'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_scoring_authority BEFORE INSERT ON assessment_item_scoring_decisions
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_scoring();

CREATE OR REPLACE FUNCTION validate_assessment_scoring_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF (SELECT code FROM service_capabilities WHERE id=NEW.capability_id)<>'independent_grader' THEN
   RAISE EXCEPTION 'Assessment scoring requires independent_grader capability'; END IF;
 IF NEW.status='approved' AND NOT EXISTS(SELECT 1 FROM professional_capability_authorizations
  WHERE id=NEW.capability_authorization_id AND decision='approved'
    AND valid_from<=NEW.begins_at AND (valid_through IS NULL OR valid_through>NEW.begins_at)) THEN
   RAISE EXCEPTION 'Assessment grader cannot be appointed without verified capability'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_scoring_appointment BEFORE INSERT OR UPDATE ON assessment_scoring_assignments
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_scoring_assignment();

CREATE OR REPLACE FUNCTION validate_assessment_result() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; expected numeric(12,4); earned numeric(12,4); n_items integer; n_scored integer; prior record;
BEGIN
 SELECT state INTO a FROM assessment_attempts WHERE id=NEW.attempt_id;
 IF a.state NOT IN ('submitted','scored','finalized') THEN
    RAISE EXCEPTION 'Result cannot be recorded before assessment submission'; END IF;
 IF NEW.result_revision=1 AND NEW.supersedes_id IS NOT NULL THEN
   RAISE EXCEPTION 'First assessment result cannot supersede a prior result'; END IF;
 IF NEW.result_revision>1 THEN
   SELECT attempt_id,result_revision INTO prior FROM assessment_attempt_results WHERE id=NEW.supersedes_id;
   IF prior.attempt_id IS DISTINCT FROM NEW.attempt_id OR prior.result_revision<>NEW.result_revision-1 THEN
     RAISE EXCEPTION 'Assessment result correction must supersede previous revision on same attempt'; END IF;
 END IF;
 IF NEW.result_status IN ('reviewed','finalized') THEN
   IF NEW.reviewed_by_person_id IS NULL THEN
     RAISE EXCEPTION 'Reviewed/final result requires an accountable reviewer'; END IF;
   SELECT count(*),sum(points_available) INTO n_items,expected
     FROM assessment_attempt_items WHERE attempt_id=NEW.attempt_id;
   IF n_items=0 THEN RAISE EXCEPTION 'Result cannot finalize an empty assessment'; END IF;
   SELECT count(*),coalesce(sum(score),0) INTO n_scored,earned FROM (
     SELECT DISTINCT ON (ai.id) ai.id, sd.score
     FROM assessment_attempt_items ai
     JOIN assessment_item_scoring_decisions sd ON sd.attempt_item_id=ai.id
     WHERE ai.attempt_id=NEW.attempt_id
     ORDER BY ai.id,sd.decision_order DESC
   ) scored;
   IF n_items<>n_scored OR NEW.points_possible<>expected OR NEW.points_earned<>earned THEN
     RAISE EXCEPTION 'Official assessment result must equal complete item-level scoring'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_result_consistency BEFORE INSERT ON assessment_attempt_results
 FOR EACH ROW EXECUTE FUNCTION validate_assessment_result();

CREATE OR REPLACE FUNCTION validate_official_assessment_adoption() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE x record;
BEGIN
 SELECT res.result_status, adm.assessment_version_id AS performed_assessment,
   grants.course_attempt_id, grants.learner_id, admin_course.course_version_id,
   gs.course_attempt_id AS official_attempt, ga.assessment_version_id AS official_assessment,
   gd.graded_submission_id AS grade_submission, gd.decision AS grade_status
 INTO x FROM assessment_attempt_results res
 JOIN assessment_attempts at ON at.id=res.attempt_id
 JOIN assessment_access_grants grants ON grants.id=at.access_grant_id
 JOIN assessment_administrations adm ON adm.id=at.administration_id
 JOIN assessment_versions admin_course ON admin_course.id=adm.assessment_version_id
 JOIN graded_submissions gs ON gs.id=NEW.graded_submission_id
 JOIN graded_assignments ga ON ga.id=gs.assignment_id
 JOIN grading_decisions gd ON gd.id=NEW.grading_decision_id
 WHERE res.id=NEW.assessment_result_id;
 IF x.result_status<>'finalized' OR x.course_attempt_id IS NULL
    OR x.course_attempt_id<>x.official_attempt OR x.performed_assessment<>x.official_assessment
    OR x.grade_submission<>NEW.graded_submission_id OR x.grade_status NOT IN ('graded','corrected') THEN
    RAISE EXCEPTION 'Official assessment result cannot bypass matching course submission and independent grading';
 END IF;
 IF EXISTS(SELECT 1 FROM official_assessment_result_adoptions WHERE graded_submission_id=NEW.graded_submission_id)
   AND NOT EXISTS(SELECT 1 FROM official_assessment_result_adoptions previous
      WHERE previous.id=NEW.supersedes_adoption_id AND previous.graded_submission_id=NEW.graded_submission_id
       AND NOT EXISTS(SELECT 1 FROM official_assessment_result_adoptions child
          WHERE child.supersedes_adoption_id=previous.id)) THEN
     RAISE EXCEPTION 'Corrected official assessment must supersede the latest adoption for that submission';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM official_assessment_result_adoptions WHERE graded_submission_id=NEW.graded_submission_id)
   AND NEW.supersedes_adoption_id IS NOT NULL THEN
     RAISE EXCEPTION 'First official result cannot supersede an unrelated adoption'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER official_assessment_grade_scope BEFORE INSERT ON official_assessment_result_adoptions
 FOR EACH ROW EXECUTE FUNCTION validate_official_assessment_adoption();

CREATE OR REPLACE FUNCTION validate_competency_result_learner() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM assessment_attempt_results r
  JOIN assessment_attempts a ON a.id=r.attempt_id
  WHERE r.id=NEW.assessment_result_id AND a.learner_id=NEW.learner_id
    AND r.result_status IN ('reviewed','finalized')) THEN
   RAISE EXCEPTION 'Competency evidence must belong to reviewed result for this learner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER assessment_competency_learner_guard BEFORE INSERT ON learner_competency_evidence
 FOR EACH ROW EXECUTE FUNCTION validate_competency_result_learner();

-- Audit append-only decisions and separate secure item keys from ordinary reads.
CREATE TRIGGER assessment_version_reviews_append_only BEFORE UPDATE OR DELETE ON assessment_version_review_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_item_reviews_append_only BEFORE UPDATE OR DELETE ON assessment_item_review_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_form_reviews_append_only BEFORE UPDATE OR DELETE ON assessment_form_review_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_accommodation_append_only BEFORE UPDATE OR DELETE ON assessment_accommodation_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_response_append_only BEFORE UPDATE OR DELETE ON assessment_response_versions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_scoring_append_only BEFORE UPDATE OR DELETE ON assessment_item_scoring_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_result_append_only BEFORE UPDATE OR DELETE ON assessment_attempt_results
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_review_events_append_only BEFORE UPDATE OR DELETE ON assessment_review_events
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER assessment_official_adoption_append_only BEFORE UPDATE OR DELETE ON official_assessment_result_adoptions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER learner_competency_evidence_append_only BEFORE UPDATE OR DELETE ON learner_competency_evidence
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();

-- Sensitive learner responses and answer keys default-deny until tenant/purpose policies are installed.
ALTER TABLE assessment_item_secure_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_accommodation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_response_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_response_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_scoring_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_item_scoring_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempt_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE official_assessment_result_adoptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_competency_evidence ENABLE ROW LEVEL SECURITY;

-- No runtime grants. Key/response access requires least-privilege security-definer services,
-- separately approved roles and RLS policies; database owners bypass RLS by default.


-- ============================================================================
-- 11. v2.5 FOUNDATIONS & READINESS, a course-independent academic domain.
-- Framework -> Competency -> Foundation -> Evidence -> Mastery -> Readiness.
-- The existing assessment engine owns all questions, administrations, answers,
-- scoring, retakes and accommodations; no second assessment engine is created.
-- ============================================================================

-- Existing v2.4 assessment_competencies has been renamed to competencies in
-- this complete replacement target. Stable competency IDs are retained; exact
-- competency versions, not unversioned labels, are the normative references.
CREATE TABLE competency_prerequisites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 prerequisite_competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 relation text NOT NULL DEFAULT 'required' CHECK(relation IN ('required','recommended')),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE (competency_version_id,prerequisite_competency_version_id),
 CHECK (competency_version_id<>prerequisite_competency_version_id)
);
CREATE TABLE academic_framework_review_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 target_kind text NOT NULL CHECK(target_kind IN ('framework_version','competency_version')),
 framework_version_id uuid REFERENCES academic_framework_versions(id),
 competency_version_id uuid REFERENCES competency_versions(id),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility')),
 decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 CHECK ((target_kind='framework_version' AND framework_version_id IS NOT NULL AND competency_version_id IS NULL)
    OR (target_kind='competency_version' AND competency_version_id IS NOT NULL AND framework_version_id IS NULL))
);

-- 11b. Independent Foundations instruction and reusable modular content.
CREATE TABLE foundation_families (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 family_code text NOT NULL, name text NOT NULL,
 UNIQUE (owner_organization_id,family_code)
);
CREATE TABLE foundations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 family_id uuid REFERENCES foundation_families(id),
 foundation_code text NOT NULL, title text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
 UNIQUE (owner_organization_id,foundation_code)
);
CREATE TABLE foundation_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 foundation_id uuid NOT NULL REFERENCES foundations(id),
 version_no integer NOT NULL CHECK(version_no>0),
 learning_purpose jsonb NOT NULL DEFAULT '{}'::jsonb,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz,
 supersedes_id uuid REFERENCES foundation_versions(id),
 UNIQUE (foundation_id,version_no), UNIQUE (id,foundation_id),
 CHECK ((lifecycle='published')=(published_at IS NOT NULL)),
 CHECK (supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE foundation_modules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 module_code text NOT NULL, title text NOT NULL,
 UNIQUE (owner_organization_id,module_code)
);
CREATE TABLE foundation_module_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 module_id uuid NOT NULL REFERENCES foundation_modules(id),
 version_no integer NOT NULL CHECK(version_no>0),
 description text, instructional_objectives jsonb NOT NULL DEFAULT '{}'::jsonb,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz,
 supersedes_id uuid REFERENCES foundation_module_versions(id),
 UNIQUE (module_id,version_no), UNIQUE (id,module_id),
 CHECK ((lifecycle='published')=(published_at IS NOT NULL)),
 CHECK (supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE foundation_version_modules (
 foundation_version_id uuid NOT NULL REFERENCES foundation_versions(id),
 module_version_id uuid NOT NULL REFERENCES foundation_module_versions(id),
 sequence_no integer NOT NULL CHECK(sequence_no>0),
 required boolean NOT NULL DEFAULT true,
 PRIMARY KEY (foundation_version_id,module_version_id),
 UNIQUE (foundation_version_id,sequence_no)
);
CREATE TABLE foundation_module_competencies (
 module_version_id uuid NOT NULL REFERENCES foundation_module_versions(id),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 coverage_kind text NOT NULL CHECK(coverage_kind IN ('teach','reinforce','assess')),
 PRIMARY KEY (module_version_id,competency_version_id,coverage_kind)
);
CREATE TABLE foundation_activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 module_version_id uuid NOT NULL REFERENCES foundation_module_versions(id),
 activity_key text NOT NULL, sequence_no integer NOT NULL CHECK(sequence_no>0),
 activity_kind text NOT NULL CHECK(activity_kind IN
  ('instruction','guided_practice','optional_practice','foundation_homework','diagnostic','mastery_check','refresher','performance_task')),
 title text NOT NULL, spec jsonb NOT NULL DEFAULT '{}'::jsonb,
 assessment_version_id uuid REFERENCES assessment_versions(id),
 graded_in_foundations boolean NOT NULL DEFAULT false,
 UNIQUE (module_version_id,activity_key), UNIQUE(module_version_id,sequence_no),
 UNIQUE(id,module_version_id),
 CHECK (activity_kind IN ('diagnostic','mastery_check','performance_task') OR assessment_version_id IS NULL)
);
CREATE TABLE foundation_resource_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 module_version_id uuid NOT NULL REFERENCES foundation_module_versions(id),
 activity_id uuid, asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
 resource_kind text NOT NULL CHECK(resource_kind IN ('video','audio','text','worksheet','transcript','captions','accessible_alternative','reference')),
 presenter_person_id uuid REFERENCES persons(id),
 sequence_no integer NOT NULL CHECK(sequence_no>0),
 FOREIGN KEY (activity_id,module_version_id) REFERENCES foundation_activities(id,module_version_id),
 UNIQUE(module_version_id,resource_kind,sequence_no)
);
-- A Foundation teacher release is not an instructional_track_versions record:
-- that legacy record requires course_version_id and cannot be used here.
CREATE TABLE foundation_instructional_releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 module_version_id uuid NOT NULL REFERENCES foundation_module_versions(id),
 presenter_person_id uuid NOT NULL REFERENCES persons(id),
 producer_organization_id uuid NOT NULL REFERENCES organizations(id),
 release_no integer NOT NULL CHECK(release_no>0),
 title text NOT NULL,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz,
 UNIQUE(module_version_id,presenter_person_id,release_no),
 UNIQUE(id,module_version_id),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE foundation_instructional_release_assets (
 release_id uuid NOT NULL REFERENCES foundation_instructional_releases(id),
 asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
 asset_role text NOT NULL CHECK(asset_role IN ('primary','supporting','captions','transcript','accessibility')),
 PRIMARY KEY(release_id,asset_version_id)
);
CREATE TABLE foundation_release_review_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 release_kind text NOT NULL CHECK(release_kind IN ('foundation','module','instructional')),
 foundation_version_id uuid REFERENCES foundation_versions(id),
 module_version_id uuid REFERENCES foundation_module_versions(id),
 instructional_release_id uuid REFERENCES foundation_instructional_releases(id),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','independent','coverage')),
 decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 CHECK ((release_kind='foundation' AND num_nonnulls(foundation_version_id,module_version_id,instructional_release_id)=1 AND foundation_version_id IS NOT NULL)
     OR (release_kind='module' AND num_nonnulls(foundation_version_id,module_version_id,instructional_release_id)=1 AND module_version_id IS NOT NULL)
     OR (release_kind='instructional' AND num_nonnulls(foundation_version_id,module_version_id,instructional_release_id)=1 AND instructional_release_id IS NOT NULL))
);
CREATE TABLE foundation_withdrawals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 foundation_version_id uuid REFERENCES foundation_versions(id),
 module_version_id uuid REFERENCES foundation_module_versions(id),
 instructional_release_id uuid REFERENCES foundation_instructional_releases(id),
 asset_version_id uuid REFERENCES content_asset_versions(id),
 reason text NOT NULL, effective_at timestamptz NOT NULL,
 authorized_by_person_id uuid NOT NULL REFERENCES persons(id),
 UNIQUE(foundation_version_id,effective_at),
 CHECK (num_nonnulls(foundation_version_id,module_version_id,instructional_release_id,asset_version_id)=1)
);
CREATE TABLE foundation_distribution_rights (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 foundation_id uuid NOT NULL REFERENCES foundations(id),
 grantor_organization_id uuid NOT NULL REFERENCES organizations(id),
 grantee_organization_id uuid NOT NULL REFERENCES organizations(id),
 permitted_operation_id uuid REFERENCES education_operations(id),
 permitted_offering_id uuid REFERENCES offerings(id),
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','revoked','expired')),
 rights_to_reproduce boolean NOT NULL DEFAULT false,
 rights_to_distribute boolean NOT NULL DEFAULT false,
 rights_to_assess boolean NOT NULL DEFAULT false,
 rights_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 UNIQUE(id,foundation_id,grantee_organization_id)
);
-- Adoptions are institutionally scoped; an independent provider need not be
-- attached to a denomination or network to adopt Foundations.
CREATE TABLE foundation_program_adoptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 foundation_id uuid NOT NULL,
 foundation_version_id uuid NOT NULL,
 rights_grant_id uuid NOT NULL,
 adopting_organization_id uuid NOT NULL REFERENCES organizations(id),
 operation_id uuid REFERENCES education_operations(id),
 deployment_id uuid REFERENCES program_deployments(id),
 offering_version_id uuid REFERENCES offering_versions(id),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','suspended','ended')),
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 approved_by_person_id uuid REFERENCES persons(id), approved_at timestamptz,
 FOREIGN KEY(foundation_version_id,foundation_id) REFERENCES foundation_versions(id,foundation_id),
 FOREIGN KEY(rights_grant_id,foundation_id,adopting_organization_id)
  REFERENCES foundation_distribution_rights(id,foundation_id,grantee_organization_id),
 CHECK(num_nonnulls(operation_id,deployment_id,offering_version_id)<=1),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 CHECK(status<>'approved' OR (approved_at IS NOT NULL AND approved_by_person_id IS NOT NULL)),
 UNIQUE(id,foundation_version_id),
 EXCLUDE USING gist (
  foundation_version_id WITH =, adopting_organization_id WITH =,
  (coalesce(operation_id,'00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  (coalesce(deployment_id,'00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  (coalesce(offering_version_id,'00000000-0000-0000-0000-000000000000'::uuid)) WITH =,
  tstzrange(valid_from,valid_through,'[)') WITH &&
 ) WHERE (status='approved')
);

-- 11c. Shared academic course specifications and provider-specific readiness.
CREATE TABLE academic_course_specifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 specification_code text NOT NULL, title text NOT NULL, subject text,
 UNIQUE(owner_organization_id,specification_code)
);
CREATE TABLE academic_course_specification_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 specification_id uuid NOT NULL REFERENCES academic_course_specifications(id),
 version_no integer NOT NULL CHECK(version_no>0),
 outcomes jsonb NOT NULL DEFAULT '{}'::jsonb,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz, supersedes_id uuid REFERENCES academic_course_specification_versions(id),
 UNIQUE(specification_id,version_no), UNIQUE(id,specification_id),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE course_curriculum_alignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_version_id uuid NOT NULL REFERENCES course_versions(id),
 specification_version_id uuid NOT NULL REFERENCES academic_course_specification_versions(id),
 coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
 rights_scope_note text,
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 decision text NOT NULL CHECK(decision IN ('proposed','approved','rejected','revoked')),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 supersedes_id uuid REFERENCES course_curriculum_alignments(id),
 UNIQUE(supersedes_id),
 CHECK(supersedes_id IS DISTINCT FROM id),
 UNIQUE(id,course_version_id,specification_version_id),
 FOREIGN KEY(supersedes_id,course_version_id,specification_version_id)
   REFERENCES course_curriculum_alignments(id,course_version_id,specification_version_id)
);
CREATE TABLE course_readiness_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 specification_id uuid NOT NULL REFERENCES academic_course_specifications(id),
 profile_code text NOT NULL, title text NOT NULL,
 UNIQUE(specification_id,profile_code), UNIQUE(id,specification_id)
);
CREATE TABLE course_readiness_profile_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 readiness_profile_id uuid NOT NULL,
 specification_id uuid NOT NULL,
 specification_version_id uuid NOT NULL,
 version_no integer NOT NULL CHECK(version_no>0),
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz, supersedes_id uuid REFERENCES course_readiness_profile_versions(id),
 FOREIGN KEY(readiness_profile_id,specification_id) REFERENCES course_readiness_profiles(id,specification_id),
 FOREIGN KEY(specification_version_id,specification_id) REFERENCES academic_course_specification_versions(id,specification_id),
 UNIQUE(readiness_profile_id,version_no), UNIQUE(id,readiness_profile_id),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE course_readiness_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 readiness_profile_version_id uuid NOT NULL REFERENCES course_readiness_profile_versions(id),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 requirement_key text NOT NULL,
 minimum_mastery_fraction numeric(6,5) NOT NULL DEFAULT 0.8 CHECK(minimum_mastery_fraction BETWEEN 0 AND 1),
 evidence_freshness_days integer CHECK(evidence_freshness_days IS NULL OR evidence_freshness_days>0),
 accepted_prior_mastery boolean NOT NULL DEFAULT true,
 subject_application_required boolean NOT NULL DEFAULT false,
 mandatory boolean NOT NULL DEFAULT true,
 evaluation_contract jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(readiness_profile_version_id,requirement_key),
 UNIQUE(readiness_profile_version_id,competency_version_id),
 UNIQUE(id,readiness_profile_version_id),
 UNIQUE(id,competency_version_id)
);
CREATE TABLE foundation_delivery_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 policy_code text NOT NULL, title text NOT NULL,
 UNIQUE(owner_organization_id,policy_code)
);
CREATE TABLE foundation_delivery_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_id uuid NOT NULL REFERENCES foundation_delivery_policies(id),
 version_no integer NOT NULL CHECK(version_no>0),
 introduction_days integer CHECK(introduction_days IS NULL OR introduction_days>=0),
 prior_mastery_exemption boolean NOT NULL DEFAULT true,
 refresher_interval_days integer CHECK(refresher_interval_days IS NULL OR refresher_interval_days>0),
 remediation_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz,
 UNIQUE(policy_id,version_no),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE competency_mastery_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 policy_code text NOT NULL, title text NOT NULL,
 UNIQUE(owner_organization_id,policy_code)
);
CREATE TABLE competency_mastery_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 mastery_policy_id uuid NOT NULL REFERENCES competency_mastery_policies(id),
 version_no integer NOT NULL CHECK(version_no>0),
 minimum_score_fraction numeric(6,5) NOT NULL DEFAULT 0.8 CHECK(minimum_score_fraction BETWEEN 0 AND 1),
 required_independent_review boolean NOT NULL DEFAULT true,
 evidence_validity_days integer CHECK(evidence_validity_days IS NULL OR evidence_validity_days>0),
 assessment_outcome_required text NOT NULL DEFAULT 'pass' CHECK(assessment_outcome_required IN ('pass','any_finalized')),
 decision_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz,
 UNIQUE(mastery_policy_id,version_no),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE program_readiness_policy_adoptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 adopting_organization_id uuid NOT NULL REFERENCES organizations(id),
 operation_id uuid REFERENCES education_operations(id),
 deployment_id uuid REFERENCES program_deployments(id),
 offering_version_id uuid REFERENCES offering_versions(id),
 readiness_profile_version_id uuid NOT NULL REFERENCES course_readiness_profile_versions(id),
 delivery_policy_version_id uuid NOT NULL REFERENCES foundation_delivery_policy_versions(id),
 mastery_policy_version_id uuid NOT NULL REFERENCES competency_mastery_policy_versions(id),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','suspended','ended')),
 approved_by_person_id uuid REFERENCES persons(id), approved_at timestamptz,
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 enrollment_gate_enabled boolean NOT NULL DEFAULT false,
 placement_authorization_id uuid REFERENCES official_authorizations(id),
 CHECK(num_nonnulls(operation_id,deployment_id,offering_version_id)<=1),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 CHECK(status<>'approved' OR (approved_at IS NOT NULL AND approved_by_person_id IS NOT NULL)),
 CHECK(NOT enrollment_gate_enabled OR placement_authorization_id IS NOT NULL),
 UNIQUE(id,readiness_profile_version_id)
);

CREATE TABLE learner_competency_determinations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id uuid NOT NULL REFERENCES learner_profiles(id),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 mastery_policy_version_id uuid NOT NULL REFERENCES competency_mastery_policy_versions(id),
 determining_organization_id uuid NOT NULL REFERENCES organizations(id),
 determined_by_person_id uuid NOT NULL REFERENCES persons(id),
 determination text NOT NULL CHECK(determination IN ('demonstrated','developing','not_yet_demonstrated','reassessment_due','not_evaluated')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_cutoff_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
 supersedes_id uuid,
 UNIQUE(id,learner_id,competency_version_id),
 UNIQUE(supersedes_id), CHECK(supersedes_id IS DISTINCT FROM id),
 FOREIGN KEY(supersedes_id,learner_id,competency_version_id)
   REFERENCES learner_competency_determinations(id,learner_id,competency_version_id),
 CHECK(evidence_cutoff_at<=decided_at)
);
CREATE TABLE competency_determination_evidence (
 determination_id uuid NOT NULL,
 learner_id uuid NOT NULL, competency_version_id uuid NOT NULL,
 competency_evidence_id uuid NOT NULL,
 PRIMARY KEY(determination_id,competency_evidence_id),
 FOREIGN KEY(determination_id,learner_id,competency_version_id)
  REFERENCES learner_competency_determinations(id,learner_id,competency_version_id),
 FOREIGN KEY(competency_evidence_id,learner_id,competency_version_id)
  REFERENCES learner_competency_evidence(id,learner_id,competency_version_id)
);
CREATE TABLE readiness_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id uuid NOT NULL REFERENCES learner_profiles(id),
 policy_adoption_id uuid NOT NULL,
 readiness_profile_version_id uuid NOT NULL,
 deciding_organization_id uuid NOT NULL REFERENCES organizations(id),
 decided_by_person_id uuid NOT NULL REFERENCES persons(id),
 outcome text NOT NULL CHECK(outcome IN ('ready','ready_with_support','not_yet_demonstrated','not_evaluated')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 rationale jsonb NOT NULL DEFAULT '{}'::jsonb,
 supersedes_id uuid,
 FOREIGN KEY(policy_adoption_id,readiness_profile_version_id)
   REFERENCES program_readiness_policy_adoptions(id,readiness_profile_version_id),
 UNIQUE(id,learner_id,readiness_profile_version_id),
 UNIQUE(supersedes_id), CHECK(supersedes_id IS DISTINCT FROM id),
 FOREIGN KEY(supersedes_id,learner_id,readiness_profile_version_id)
   REFERENCES readiness_evaluations(id,learner_id,readiness_profile_version_id)
);
CREATE TABLE readiness_evaluation_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evaluation_id uuid NOT NULL,
 learner_id uuid NOT NULL,
 readiness_profile_version_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 status text NOT NULL CHECK(status IN ('satisfied','satisfied_with_support','unmet','not_evaluated')),
 evidence_note text,
 FOREIGN KEY(evaluation_id,learner_id,readiness_profile_version_id)
  REFERENCES readiness_evaluations(id,learner_id,readiness_profile_version_id),
 FOREIGN KEY(requirement_id,readiness_profile_version_id)
  REFERENCES course_readiness_requirements(id,readiness_profile_version_id),
 UNIQUE(evaluation_id,requirement_id), UNIQUE(id,learner_id,requirement_id)
);
CREATE TABLE readiness_requirement_evidence (
 requirement_evaluation_id uuid NOT NULL,
 learner_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 competency_version_id uuid NOT NULL,
 competency_evidence_id uuid NOT NULL,
 determination_id uuid,
 PRIMARY KEY(requirement_evaluation_id,competency_evidence_id),
 FOREIGN KEY(requirement_evaluation_id,learner_id,requirement_id)
  REFERENCES readiness_evaluation_requirements(id,learner_id,requirement_id),
 FOREIGN KEY(requirement_id,competency_version_id)
  REFERENCES course_readiness_requirements(id,competency_version_id),
 FOREIGN KEY(competency_evidence_id,learner_id,competency_version_id)
  REFERENCES learner_competency_evidence(id,learner_id,competency_version_id),
 FOREIGN KEY(determination_id,learner_id,competency_version_id)
  REFERENCES learner_competency_determinations(id,learner_id,competency_version_id)
);

-- 11e. Personal learning work and spaced reinforcement, no course FK required.
CREATE TABLE learner_foundation_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id uuid NOT NULL REFERENCES learner_profiles(id),
 foundation_adoption_id uuid NOT NULL REFERENCES foundation_program_adoptions(id),
 foundation_version_id uuid NOT NULL REFERENCES foundation_versions(id),
 module_version_id uuid REFERENCES foundation_module_versions(id),
 assigned_by_person_id uuid REFERENCES persons(id),
 assigned_by_policy_version_id uuid REFERENCES foundation_delivery_policy_versions(id),
 readiness_evaluation_id uuid REFERENCES readiness_evaluations(id),
 assignment_reason text NOT NULL CHECK(assignment_reason IN
  ('preparation','diagnostic_gap','mastery_gap','support','refresher','optional')),
 status text NOT NULL DEFAULT 'assigned' CHECK(status IN
  ('assigned','active','completed','waived','cancelled')),
 assigned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 due_at timestamptz,
 FOREIGN KEY(foundation_adoption_id,foundation_version_id)
  REFERENCES foundation_program_adoptions(id,foundation_version_id),
 UNIQUE(id,learner_id), UNIQUE(id,module_version_id),
 CHECK(due_at IS NULL OR due_at>=assigned_at)
);
CREATE TABLE learner_foundation_activity_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 foundation_assignment_id uuid NOT NULL,
 learner_id uuid NOT NULL,
 module_version_id uuid NOT NULL,
 activity_id uuid NOT NULL,
 attempt_no integer NOT NULL CHECK(attempt_no>0),
 assessment_attempt_id uuid REFERENCES assessment_attempts(id),
 practice_response jsonb NOT NULL DEFAULT '{}'::jsonb,
 status text NOT NULL DEFAULT 'started' CHECK(status IN ('started','submitted','reviewed','completed','voided')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(), completed_at timestamptz,
 FOREIGN KEY(foundation_assignment_id,learner_id)
  REFERENCES learner_foundation_assignments(id,learner_id),
 FOREIGN KEY(foundation_assignment_id,module_version_id)
  REFERENCES learner_foundation_assignments(id,module_version_id),
 FOREIGN KEY(activity_id,module_version_id)
  REFERENCES foundation_activities(id,module_version_id),
 UNIQUE(foundation_assignment_id,activity_id,attempt_no),
 CHECK(completed_at IS NULL OR completed_at>=started_at)
);
CREATE TABLE foundation_refresher_rule_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_policy_version_id uuid NOT NULL REFERENCES foundation_delivery_policy_versions(id),
 competency_version_id uuid NOT NULL REFERENCES competency_versions(id),
 rule_key text NOT NULL,
 interval_days integer NOT NULL CHECK(interval_days>0),
 minimum_prior_mastery_days integer NOT NULL DEFAULT 0 CHECK(minimum_prior_mastery_days>=0),
 max_retries integer CHECK(max_retries IS NULL OR max_retries>0),
 rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(delivery_policy_version_id,rule_key)
);
CREATE TABLE learner_refresher_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 learner_id uuid NOT NULL REFERENCES learner_profiles(id),
 refresher_rule_version_id uuid NOT NULL REFERENCES foundation_refresher_rule_versions(id),
 triggered_by_determination_id uuid NOT NULL REFERENCES learner_competency_determinations(id),
 foundation_assignment_id uuid REFERENCES learner_foundation_assignments(id),
 due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','assigned','completed','skipped','deferred','cancelled')),
 completed_at timestamptz, supersedes_id uuid,
 UNIQUE(learner_id,refresher_rule_version_id,triggered_by_determination_id,due_at),
 UNIQUE(supersedes_id),
 CHECK(supersedes_id IS DISTINCT FROM id),
 CHECK(completed_at IS NULL OR status='completed'),
 FOREIGN KEY(supersedes_id,learner_id) REFERENCES learner_refresher_tasks(id,learner_id),
 UNIQUE(id,learner_id)
);

-- 11f. Foundation-specific release security and academic decision invariants.
CREATE OR REPLACE FUNCTION v26_check_competency_cycle() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE is_cycle boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('education_v30_competency_prerequisite_graph'));
 WITH RECURSIVE ancestors(version_id) AS (
   SELECT NEW.prerequisite_competency_version_id
   UNION
   SELECT p.prerequisite_competency_version_id
   FROM competency_prerequisites p JOIN ancestors a ON a.version_id=p.competency_version_id
   WHERE p.id IS DISTINCT FROM NEW.id
 )
 SELECT EXISTS(SELECT 1 FROM ancestors WHERE version_id=NEW.competency_version_id) INTO is_cycle;
 IF is_cycle THEN RAISE EXCEPTION 'Competency prerequisite cycle'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER competency_prerequisite_no_cycle BEFORE INSERT OR UPDATE ON competency_prerequisites
 FOR EACH ROW EXECUTE FUNCTION v26_check_competency_cycle();

-- Every published exact version must have current (identity-ordered) independent
-- academic approval; Foundation/module releases also need rights and accessibility.
CREATE OR REPLACE FUNCTION v26_check_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE needed text[]; kind text; k text; target uuid; n int;
 current_decision text; current_reviewer uuid;
BEGIN
 IF NEW.lifecycle<>'published' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.lifecycle='published' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='academic_framework_versions' THEN
    kind:='framework_version'; target:=NEW.id; needed:=ARRAY['academic'];
 ELSIF TG_TABLE_NAME='competency_versions' THEN
    kind:='competency_version'; target:=NEW.id; needed:=ARRAY['academic'];
 ELSIF TG_TABLE_NAME='foundation_versions' THEN
    kind:='foundation'; target:=NEW.id; needed:=ARRAY['academic','rights','accessibility'];
    SELECT count(*) INTO n FROM foundation_version_modules WHERE foundation_version_id=NEW.id;
    IF n=0 THEN RAISE EXCEPTION 'Foundation must contain at least one module'; END IF;
 ELSIF TG_TABLE_NAME='foundation_module_versions' THEN
    kind:='module'; target:=NEW.id; needed:=ARRAY['academic','rights','accessibility'];
    SELECT count(*) INTO n FROM foundation_module_competencies WHERE module_version_id=NEW.id;
    IF n=0 THEN RAISE EXCEPTION 'Foundation module must cover at least one competency'; END IF;
 ELSIF TG_TABLE_NAME='foundation_instructional_releases' THEN
    kind:='instructional'; target:=NEW.id; needed:=ARRAY['academic','rights','accessibility','independent'];
    SELECT count(*) INTO n FROM foundation_instructional_release_assets WHERE release_id=NEW.id;
    IF n=0 THEN RAISE EXCEPTION 'Instructional release needs a published asset'; END IF;
    IF EXISTS(SELECT 1 FROM foundation_instructional_release_assets a
       JOIN content_asset_versions v ON v.id=a.asset_version_id
       WHERE a.release_id=NEW.id AND v.lifecycle<>'published') THEN
       RAISE EXCEPTION 'Instructional release references unpublished asset'; END IF;
 ELSE RAISE EXCEPTION 'Unexpected publication object %',TG_TABLE_NAME; END IF;
 FOREACH k IN ARRAY needed LOOP
   current_decision:=NULL; current_reviewer:=NULL;
   IF kind IN ('framework_version','competency_version') THEN
     SELECT r.decision,r.reviewer_person_id INTO current_decision,current_reviewer
       FROM academic_framework_review_decisions r WHERE r.review_kind=k
         AND ((kind='framework_version' AND r.framework_version_id=target)
          OR (kind='competency_version' AND r.competency_version_id=target))
       ORDER BY r.decision_order DESC LIMIT 1;
   ELSE
     SELECT r.decision,r.reviewer_person_id INTO current_decision,current_reviewer
       FROM foundation_release_review_decisions r WHERE r.review_kind=k
        AND ((kind='foundation' AND r.foundation_version_id=target)
           OR (kind='module' AND r.module_version_id=target)
           OR (kind='instructional' AND r.instructional_release_id=target))
       ORDER BY r.decision_order DESC LIMIT 1;
   END IF;
   IF current_decision IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'Publication needs current approved % review',k; END IF;
   IF kind='instructional' THEN
     IF current_reviewer=NEW.presenter_person_id THEN
       RAISE EXCEPTION 'Instructor cannot approve their own instructional release'; END IF;
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER academic_framework_publication_gate BEFORE INSERT OR UPDATE OF lifecycle ON academic_framework_versions
 FOR EACH ROW EXECUTE FUNCTION v26_check_publication();
CREATE TRIGGER competency_publication_gate BEFORE INSERT OR UPDATE OF lifecycle ON competency_versions
 FOR EACH ROW EXECUTE FUNCTION v26_check_publication();
CREATE TRIGGER foundation_publication_gate BEFORE INSERT OR UPDATE OF lifecycle ON foundation_versions
 FOR EACH ROW EXECUTE FUNCTION v26_check_publication();
CREATE TRIGGER foundation_module_publication_gate BEFORE INSERT OR UPDATE OF lifecycle ON foundation_module_versions
 FOR EACH ROW EXECUTE FUNCTION v26_check_publication();
CREATE TRIGGER foundation_instruction_publication_gate BEFORE INSERT OR UPDATE OF lifecycle ON foundation_instructional_releases
 FOR EACH ROW EXECUTE FUNCTION v26_check_publication();
CREATE TRIGGER v26_framework_immutability BEFORE UPDATE OR DELETE ON academic_framework_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_competency_immutability BEFORE UPDATE OR DELETE ON competency_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_foundation_immutability BEFORE UPDATE OR DELETE ON foundation_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_module_immutability BEFORE UPDATE OR DELETE ON foundation_module_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_instruction_immutability BEFORE UPDATE OR DELETE ON foundation_instructional_releases
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_specification_immutability BEFORE UPDATE OR DELETE ON academic_course_specification_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_profile_immutability BEFORE UPDATE OR DELETE ON course_readiness_profile_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_delivery_policy_immutability BEFORE UPDATE OR DELETE ON foundation_delivery_policy_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();
CREATE TRIGGER v26_mastery_policy_immutability BEFORE UPDATE OR DELETE ON competency_mastery_policy_versions
 FOR EACH ROW EXECUTE FUNCTION reject_published_version_mutation();

CREATE OR REPLACE FUNCTION v26_reject_published_parent_child_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE parent_state text; old_parent_state text; new_parent uuid; old_parent uuid;
BEGIN
 IF TG_TABLE_NAME='academic_framework_version_competencies' THEN
    IF TG_OP<>'INSERT' THEN old_parent:=OLD.framework_version_id; END IF;
    IF TG_OP<>'DELETE' THEN new_parent:=NEW.framework_version_id; END IF;
    IF old_parent IS NOT NULL THEN SELECT lifecycle INTO old_parent_state FROM academic_framework_versions WHERE id=old_parent; END IF;
    IF new_parent IS NOT NULL THEN SELECT lifecycle INTO parent_state FROM academic_framework_versions WHERE id=new_parent; END IF;
 ELSIF TG_TABLE_NAME='foundation_version_modules' THEN
    IF TG_OP<>'INSERT' THEN old_parent:=OLD.foundation_version_id; END IF;
    IF TG_OP<>'DELETE' THEN new_parent:=NEW.foundation_version_id; END IF;
    IF old_parent IS NOT NULL THEN SELECT lifecycle INTO old_parent_state FROM foundation_versions WHERE id=old_parent; END IF;
    IF new_parent IS NOT NULL THEN SELECT lifecycle INTO parent_state FROM foundation_versions WHERE id=new_parent; END IF;
 ELSIF TG_TABLE_NAME IN ('foundation_module_competencies','foundation_activities','foundation_resource_bindings') THEN
    IF TG_OP<>'INSERT' THEN old_parent:=OLD.module_version_id; END IF;
    IF TG_OP<>'DELETE' THEN new_parent:=NEW.module_version_id; END IF;
    IF old_parent IS NOT NULL THEN SELECT lifecycle INTO old_parent_state FROM foundation_module_versions WHERE id=old_parent; END IF;
    IF new_parent IS NOT NULL THEN SELECT lifecycle INTO parent_state FROM foundation_module_versions WHERE id=new_parent; END IF;
 ELSIF TG_TABLE_NAME='foundation_instructional_release_assets' THEN
    IF TG_OP<>'INSERT' THEN old_parent:=OLD.release_id; END IF;
    IF TG_OP<>'DELETE' THEN new_parent:=NEW.release_id; END IF;
    IF old_parent IS NOT NULL THEN SELECT lifecycle INTO old_parent_state FROM foundation_instructional_releases WHERE id=old_parent; END IF;
    IF new_parent IS NOT NULL THEN SELECT lifecycle INTO parent_state FROM foundation_instructional_releases WHERE id=new_parent; END IF;
 ELSIF TG_TABLE_NAME='course_readiness_requirements' THEN
    IF TG_OP<>'INSERT' THEN old_parent:=OLD.readiness_profile_version_id; END IF;
    IF TG_OP<>'DELETE' THEN new_parent:=NEW.readiness_profile_version_id; END IF;
    IF old_parent IS NOT NULL THEN SELECT lifecycle INTO old_parent_state FROM course_readiness_profile_versions WHERE id=old_parent; END IF;
    IF new_parent IS NOT NULL THEN SELECT lifecycle INTO parent_state FROM course_readiness_profile_versions WHERE id=new_parent; END IF;
 ELSE RAISE EXCEPTION 'Unsupported version-child table %',TG_TABLE_NAME; END IF;
 IF old_parent_state='published' OR parent_state='published' THEN
    RAISE EXCEPTION 'Cannot change child records of a published version: %',TG_TABLE_NAME;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER v26_framework_members_immutable BEFORE INSERT OR UPDATE OR DELETE ON academic_framework_version_competencies
 FOR EACH ROW EXECUTE FUNCTION v26_reject_published_parent_child_change();
CREATE TRIGGER v26_foundation_modules_immutable BEFORE INSERT OR UPDATE OR DELETE ON foundation_version_modules
 FOR EACH ROW EXECUTE FUNCTION v26_reject_published_parent_child_change();
CREATE TRIGGER v26_module_competencies_immutable BEFORE INSERT OR UPDATE OR DELETE ON foundation_module_competencies
 FOR EACH ROW EXECUTE FUNCTION v26_reject_published_parent_child_change();
CREATE TRIGGER v26_module_activities_immutable BEFORE INSERT OR UPDATE OR DELETE ON foundation_activities
 FOR EACH ROW EXECUTE FUNCTION v26_reject_published_parent_child_change();
CREATE TRIGGER v26_module_resources_immutable BEFORE INSERT OR UPDATE OR DELETE ON foundation_resource_bindings
 FOR EACH ROW EXECUTE FUNCTION v26_reject_published_parent_child_change();
CREATE TRIGGER v26_instruction_assets_immutable BEFORE INSERT OR UPDATE OR DELETE ON foundation_instructional_release_assets
 FOR EACH ROW EXECUTE FUNCTION v26_reject_published_parent_child_change();
CREATE TRIGGER v26_readiness_requirements_immutable BEFORE INSERT OR UPDATE OR DELETE ON course_readiness_requirements
 FOR EACH ROW EXECUTE FUNCTION v26_reject_published_parent_child_change();

-- Adopt only exact, reviewed, published releases with active scoped distribution
-- rights and the required license evidence; no network membership is involved.
CREATE OR REPLACE FUNCTION v26_validate_foundation_adoption() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE published boolean; grant_row record;
        actual_operation uuid; actual_offering uuid;
BEGIN
 IF NEW.status<>'approved' THEN RETURN NEW; END IF;
 SELECT lifecycle='published' INTO published FROM foundation_versions WHERE id=NEW.foundation_version_id;
 IF published IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cannot adopt unpublished Foundation'; END IF;
 IF EXISTS (SELECT 1 FROM foundation_version_modules b JOIN foundation_module_versions mv ON mv.id=b.module_version_id
    WHERE b.foundation_version_id=NEW.foundation_version_id AND mv.lifecycle<>'published') THEN
    RAISE EXCEPTION 'Foundation contains unpublished module'; END IF;
 SELECT * INTO grant_row FROM foundation_distribution_rights WHERE id=NEW.rights_grant_id FOR UPDATE;
 IF grant_row.status<>'approved' OR NOT grant_row.rights_to_distribute OR NOT grant_row.rights_to_assess
    OR grant_row.valid_from>NEW.valid_from
    OR (grant_row.valid_through IS NOT NULL AND
       (NEW.valid_through IS NULL OR grant_row.valid_through<NEW.valid_through)) THEN
    RAISE EXCEPTION 'Foundation adoption exceeds approved license scope or validity'; END IF;
 actual_operation:=NEW.operation_id;
 IF NEW.deployment_id IS NOT NULL THEN
   SELECT operation_id,offering_id INTO actual_operation,actual_offering
      FROM program_deployments WHERE id=NEW.deployment_id;
 ELSIF NEW.offering_version_id IS NOT NULL THEN
   SELECT offering_id INTO actual_offering FROM offering_versions WHERE id=NEW.offering_version_id;
 END IF;
 -- An organization-wide adoption cannot use operation- or Offering-limited rights.
 IF (grant_row.permitted_operation_id IS NOT NULL AND
     actual_operation IS DISTINCT FROM grant_row.permitted_operation_id) OR
    (grant_row.permitted_offering_id IS NOT NULL AND
     actual_offering IS DISTINCT FROM grant_row.permitted_offering_id) THEN
     RAISE EXCEPTION 'Foundation distribution license does not authorize this operation / Offering'; END IF;
 IF EXISTS(SELECT 1 FROM foundation_withdrawals w
    WHERE w.foundation_version_id=NEW.foundation_version_id AND w.effective_at<=NEW.valid_from) THEN
   RAISE EXCEPTION 'Cannot adopt withdrawn Foundation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v26_foundation_adoption_guard BEFORE INSERT OR UPDATE OF
 status,valid_from,valid_through,rights_grant_id,foundation_version_id,operation_id,deployment_id,offering_version_id
 ON foundation_program_adoptions
 FOR EACH ROW EXECUTE FUNCTION v26_validate_foundation_adoption();

-- A single assessment engine powers course tests AND Foundation diagnostics.
-- Item scoring must be tied to the correct assessment attempt/learner/competency.
CREATE OR REPLACE FUNCTION v26_validate_competency_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE result_attempt uuid; scored_attempt uuid; item_matches boolean;
BEGIN
 SELECT a.id INTO result_attempt FROM assessment_attempt_results r
  JOIN assessment_attempts a ON a.id=r.attempt_id
  WHERE r.id=NEW.assessment_result_id AND a.learner_id=NEW.learner_id;
 IF result_attempt IS NULL THEN RAISE EXCEPTION 'Assessment result does not belong to learner'; END IF;
 IF NEW.assessment_item_scoring_decision_id IS NOT NULL THEN
  SELECT ai.attempt_id INTO scored_attempt FROM assessment_item_scoring_decisions d
   JOIN assessment_attempt_items ai ON ai.id=d.attempt_item_id
   WHERE d.id=NEW.assessment_item_scoring_decision_id;
  IF scored_attempt IS DISTINCT FROM result_attempt THEN RAISE EXCEPTION 'Item scoring belongs to a different assessment attempt'; END IF;
  SELECT EXISTS (
   SELECT 1 FROM assessment_item_scoring_decisions d
   JOIN assessment_attempt_items ai ON ai.id=d.attempt_item_id
   JOIN assessment_item_competencies x ON x.item_version_id=ai.item_version_id
   WHERE d.id=NEW.assessment_item_scoring_decision_id
     AND x.competency_version_id=NEW.competency_version_id
  ) INTO item_matches;
  IF NOT item_matches THEN RAISE EXCEPTION 'Scored item not aligned to evidence competency version'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER v26_competency_evidence_guard BEFORE INSERT ON learner_competency_evidence
 FOR EACH ROW EXECUTE FUNCTION v26_validate_competency_evidence();

CREATE OR REPLACE FUNCTION v26_validate_mastery() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE policy record; n integer; passing_evidence integer;
BEGIN
 SELECT * INTO policy FROM competency_mastery_policy_versions WHERE id=NEW.mastery_policy_version_id;
 IF policy.lifecycle IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Mastery determination needs published policy'; END IF;
 IF EXISTS(SELECT 1 FROM competency_version_withdrawals w
    WHERE w.competency_version_id=NEW.competency_version_id AND w.effective_at<=NEW.decided_at) THEN
    RAISE EXCEPTION 'Cannot issue new mastery determination against withdrawn competency version'; END IF;
 IF NEW.determination<>'demonstrated' THEN RETURN NULL; END IF;
 SELECT count(*), count(*) FILTER (WHERE
    result.result_status IN ('reviewed','finalized')
    AND (policy.assessment_outcome_required='any_finalized' OR result.outcome='pass')
    AND result.points_possible>0
    AND (result.points_earned/result.points_possible)>=policy.minimum_score_fraction
    AND ev.observed_at<=NEW.evidence_cutoff_at
    AND ev.observed_at<=NEW.decided_at
    AND (policy.evidence_validity_days IS NULL OR
      ev.observed_at>=NEW.decided_at-make_interval(days=>policy.evidence_validity_days))
    AND (NOT policy.required_independent_review OR
      (ev.validated_by_person_id IS NOT NULL AND
       ev.validated_by_person_id<>NEW.determined_by_person_id)))
 INTO n,passing_evidence
 FROM competency_determination_evidence link
 JOIN learner_competency_evidence ev ON ev.id=link.competency_evidence_id
 JOIN assessment_attempt_results result ON result.id=ev.assessment_result_id
 WHERE link.determination_id=NEW.id;
 IF n=0 OR passing_evidence<>n THEN
    RAISE EXCEPTION 'Mastery evidence fails threshold, freshness, finality or independent-review policy'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER v26_mastery_evidence_gate AFTER INSERT ON learner_competency_determinations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v26_validate_mastery();

CREATE OR REPLACE FUNCTION v26_validate_readiness() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE profile_ok boolean; adopter record; mandatory_count integer; missing_count integer;
BEGIN
 SELECT lifecycle='published' INTO profile_ok FROM course_readiness_profile_versions
   WHERE id=NEW.readiness_profile_version_id;
 SELECT * INTO adopter FROM program_readiness_policy_adoptions
   WHERE id=NEW.policy_adoption_id;
 IF profile_ok IS DISTINCT FROM true OR adopter.status<>'approved' OR
     adopter.adopting_organization_id<>NEW.deciding_organization_id OR
     NEW.decided_at<adopter.valid_from OR
     (adopter.valid_through IS NOT NULL AND NEW.decided_at>=adopter.valid_through) OR
     NOT EXISTS(SELECT 1 FROM foundation_delivery_policy_versions v WHERE v.id=adopter.delivery_policy_version_id AND v.lifecycle='published') OR
     NOT EXISTS(SELECT 1 FROM competency_mastery_policy_versions v WHERE v.id=adopter.mastery_policy_version_id AND v.lifecycle='published') THEN
   RAISE EXCEPTION 'Readiness decision requires published profile and authorized active provider policies'; END IF;
 IF NEW.outcome NOT IN ('ready','ready_with_support') THEN RETURN NULL; END IF;
 SELECT count(*) INTO mandatory_count FROM course_readiness_requirements cr
  WHERE cr.readiness_profile_version_id=NEW.readiness_profile_version_id AND cr.mandatory;
 IF mandatory_count=0 THEN RAISE EXCEPTION 'Readiness needs mandatory competencies'; END IF;
 SELECT count(*) INTO missing_count FROM course_readiness_requirements cr
 WHERE cr.readiness_profile_version_id=NEW.readiness_profile_version_id AND cr.mandatory
 AND NOT EXISTS (
   SELECT 1 FROM readiness_evaluation_requirements er
   JOIN readiness_requirement_evidence link ON link.requirement_evaluation_id=er.id
   JOIN learner_competency_evidence ev ON ev.id=link.competency_evidence_id
   JOIN assessment_attempt_results res ON res.id=ev.assessment_result_id
   JOIN learner_competency_determinations d ON d.id=link.determination_id
   WHERE er.evaluation_id=NEW.id AND er.requirement_id=cr.id
     AND (er.status='satisfied' OR (NEW.outcome='ready_with_support' AND er.status='satisfied_with_support'))
     AND d.determination='demonstrated' AND d.decided_at<=NEW.decided_at
     AND ev.learner_id=NEW.learner_id AND ev.competency_version_id=cr.competency_version_id
     AND res.result_status IN ('reviewed','finalized')
     AND (res.points_earned/res.points_possible)>=cr.minimum_mastery_fraction
     AND (cr.evidence_freshness_days IS NULL OR ev.observed_at>=NEW.decided_at-make_interval(days=>cr.evidence_freshness_days))
     AND (cr.accepted_prior_mastery OR ev.evidence_context_code='course_specific')
     AND (NOT cr.subject_application_required OR ev.evidence_context_code='subject_application')
     AND EXISTS(SELECT 1 FROM competency_determination_evidence de
        WHERE de.determination_id=d.id AND de.competency_evidence_id=ev.id)
 );
 IF missing_count<>0 THEN RAISE EXCEPTION 'Readiness claim lacks policy-valid demonstrated evidence for all mandatory competencies'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER v26_readiness_decision_gate AFTER INSERT ON readiness_evaluations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v26_validate_readiness();

-- Readiness decisions and historical evidence never overwrite official grades.
-- Explicit provider-authorized adoption into course grades remains separate.
CREATE TRIGGER v26_framework_reviews_append_only BEFORE UPDATE OR DELETE ON academic_framework_review_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER v26_foundation_reviews_append_only BEFORE UPDATE OR DELETE ON foundation_release_review_decisions
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER v26_foundation_withdrawals_append_only BEFORE UPDATE OR DELETE ON foundation_withdrawals
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER v26_mastery_append_only BEFORE UPDATE OR DELETE ON learner_competency_determinations
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER v26_mastery_evidence_append_only BEFORE UPDATE OR DELETE ON competency_determination_evidence
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER v26_readiness_append_only BEFORE UPDATE OR DELETE ON readiness_evaluations
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER v26_readiness_requirements_append_only BEFORE UPDATE OR DELETE ON readiness_evaluation_requirements
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER v26_readiness_evidence_append_only BEFORE UPDATE OR DELETE ON readiness_requirement_evidence
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();

-- Default deny for non-owner runtime roles until explicit scoped RLS policies
-- and controlled service entry points are installed. Never use the schema owner
-- as the application runtime role. This target alone is NOT production-ready.
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_framework_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE foundation_release_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_competency_determinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_determination_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_evaluation_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE readiness_requirement_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_foundation_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_foundation_activity_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_refresher_tasks ENABLE ROW LEVEL SECURITY;

-- Documentation of canonical noun/verb boundaries.
COMMENT ON TABLE competencies IS 'Canonical stable competency identity, formerly assessment_competencies; competency_versions contain assessable criteria';
COMMENT ON TABLE learner_competency_evidence IS 'Observed performance from existing assessment engine; not a mastery determination, readiness decision, official grade or credit';
COMMENT ON TABLE learner_competency_determinations IS 'Attributable interpretation of version-pinned evidence under a specific mastery policy';
COMMENT ON TABLE readiness_evaluations IS 'Course-context readiness decision under receiving provider policy; does not by itself refuse enrollment';
COMMENT ON TABLE foundation_program_adoptions IS 'Program or operation approval to use a published Foundation under explicit distributor rights; no network membership required';
COMMENT ON TABLE foundation_instructional_releases IS 'Course-independent recorded teacher release; never creates a fictitious course enrollment or instructional track';
COMMENT ON TABLE academic_course_specifications IS 'Publisher-independent academic outcome specification; distinct from school/program operational Blueprints';
COMMENT ON TABLE assessment_item_competencies IS 'Version-pinned assessment item-to-competency mapping; the assessment engine is shared by courses and Foundations';
COMMENT ON TABLE foundation_activities IS 'Foundation instruction and practice are distinct from official course homework and its grading policy';

-- 12. v2.6 integrity hardening. All actions validated in the canonical schema.

CREATE OR REPLACE FUNCTION v26_validate_framework_membership() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE owner_id uuid; steward_id uuid; framework_id_val uuid; competency_id_val uuid;
BEGIN
 SELECT f.steward_organization_id,f.id INTO steward_id,framework_id_val
   FROM academic_framework_versions fv JOIN academic_frameworks f ON f.id=fv.framework_id
   WHERE fv.id=NEW.framework_version_id;
 SELECT c.owner_organization_id,c.id INTO owner_id,competency_id_val
   FROM competency_versions cv JOIN competencies c ON c.id=cv.competency_id
   WHERE cv.id=NEW.competency_version_id;
 IF owner_id IS DISTINCT FROM steward_id AND NOT EXISTS (
   SELECT 1 FROM framework_competency_reuse_authorizations x
   WHERE x.framework_id=framework_id_val AND x.competency_id=competency_id_val
     AND x.authorizing_organization_id=owner_id AND x.status='approved'
     AND x.valid_from<=clock_timestamp()
     AND (x.valid_through IS NULL OR x.valid_through>clock_timestamp())) THEN
    RAISE EXCEPTION 'Cross-steward competency requires approved reuse rights'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER framework_competency_membership_rights BEFORE INSERT OR UPDATE ON academic_framework_version_competencies
 FOR EACH ROW EXECUTE FUNCTION v26_validate_framework_membership();

CREATE OR REPLACE FUNCTION v26_check_foundation_activity_assessment() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE purpose_value text; lifecycle_value text;
BEGIN
 IF NEW.assessment_version_id IS NULL THEN RETURN NEW; END IF;
 SELECT d.purpose,v.lifecycle INTO purpose_value,lifecycle_value
 FROM assessment_versions v JOIN assessment_definitions d ON d.id=v.assessment_id
 WHERE v.id=NEW.assessment_version_id;
 IF purpose_value NOT IN ('diagnostic','readiness','foundation','formative','mastery','practice','placement')
   OR lifecycle_value<>'published' THEN
    RAISE EXCEPTION 'Foundation activity requires compatible published non-official assessment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER foundation_activity_assessment_scope BEFORE INSERT OR UPDATE OF assessment_version_id
 ON foundation_activities FOR EACH ROW EXECUTE FUNCTION v26_check_foundation_activity_assessment();

CREATE OR REPLACE FUNCTION v26_check_placement_authorization() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE actual_op uuid; actual_offering uuid; a record;
BEGIN
 IF NEW.status<>'approved' OR NOT NEW.enrollment_gate_enabled THEN RETURN NEW; END IF;
 SELECT * INTO a FROM official_authorizations WHERE id=NEW.placement_authorization_id;
 IF a.official_decision<>'approved' OR NEW.valid_from<a.effective_at OR
     (a.expires_at IS NOT NULL AND (NEW.valid_through IS NULL OR NEW.valid_through>a.expires_at)) THEN
    RAISE EXCEPTION 'Enrollment gate needs effective approved authorization'; END IF;
 actual_op:=NEW.operation_id;
 IF NEW.deployment_id IS NOT NULL THEN
    SELECT operation_id,offering_id INTO actual_op,actual_offering
       FROM program_deployments WHERE id=NEW.deployment_id;
 ELSIF NEW.offering_version_id IS NOT NULL THEN
    SELECT offering_id INTO actual_offering FROM offering_versions WHERE id=NEW.offering_version_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM official_authorization_scopes sc
    WHERE sc.authorization_id=NEW.placement_authorization_id AND
    ((actual_op IS NOT NULL AND sc.operation_id=actual_op) OR
      (actual_offering IS NOT NULL AND sc.offering_id=actual_offering))) THEN
     RAISE EXCEPTION 'Enrollment gate authorization does not cover operating scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER placement_authority_scope BEFORE INSERT OR UPDATE ON program_readiness_policy_adoptions
 FOR EACH ROW EXECUTE FUNCTION v26_check_placement_authorization();

-- If a license is revoked, all approving adoptions become suspended in the same transaction.
CREATE OR REPLACE FUNCTION v26_suspend_revoked_foundation_rights() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF OLD.status='approved' AND NEW.status IN ('revoked','expired') THEN
   UPDATE foundation_program_adoptions SET status='suspended'
     WHERE rights_grant_id=NEW.id AND status='approved';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER foundation_rights_revocation BEFORE UPDATE OF status ON foundation_distribution_rights
 FOR EACH ROW EXECUTE FUNCTION v26_suspend_revoked_foundation_rights();

-- Publishing an adoption does not grant everlasting content access: revalidate at assignment time.
CREATE OR REPLACE FUNCTION v26_check_foundation_assignment_rights() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE adoption record; rights record; instant timestamptz:=clock_timestamp();
BEGIN
 SELECT * INTO adoption FROM foundation_program_adoptions WHERE id=NEW.foundation_adoption_id;
 SELECT * INTO rights FROM foundation_distribution_rights WHERE id=adoption.rights_grant_id;
 IF adoption.status<>'approved' OR instant<adoption.valid_from OR
     (adoption.valid_through IS NOT NULL AND instant>=adoption.valid_through) OR
     rights.status<>'approved' OR instant<rights.valid_from OR
     (rights.valid_through IS NOT NULL AND instant>=rights.valid_through) THEN
   RAISE EXCEPTION 'Foundation assignment requires current approved adoption and license'; END IF;
 IF EXISTS(SELECT 1 FROM foundation_withdrawals w
    WHERE w.foundation_version_id=NEW.foundation_version_id AND w.effective_at<=instant) THEN
   RAISE EXCEPTION 'Foundation withdrawn for new learner assignments'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER foundation_assignment_access BEFORE INSERT ON learner_foundation_assignments
 FOR EACH ROW EXECUTE FUNCTION v26_check_foundation_assignment_rights();

CREATE OR REPLACE FUNCTION v26_require_academic_issuer(op uuid,issuer uuid,actor uuid,assignment uuid,
 role_expected text,organization_role_expected text,act_at timestamptz) RETURNS void
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM education_operation_organization_roles orole
   WHERE orole.operation_id=op AND orole.organization_id=issuer
     AND orole.role_code=organization_role_expected AND orole.status='approved'
     AND orole.valid_from<=act_at AND (orole.valid_through IS NULL OR orole.valid_through>act_at)) THEN
   RAISE EXCEPTION 'Academic issuer lacks approved organizational authority'; END IF;
 SELECT * INTO a FROM professional_role_assignments WHERE id=assignment;
 IF a.person_id IS DISTINCT FROM actor OR a.appointing_organization_id IS DISTINCT FROM issuer
     OR a.role_code IS DISTINCT FROM role_expected OR a.state IS DISTINCT FROM 'approved'
     OR a.begins_at>act_at OR (a.ends_at IS NOT NULL AND a.ends_at<=act_at)
     OR NOT (a.operation_id=op OR EXISTS(SELECT 1 FROM program_deployments d
             WHERE d.id=a.deployment_id AND d.operation_id=op)) THEN
   RAISE EXCEPTION 'Academic actor lacks current scoped delegated authority'; END IF;
END $$;
CREATE OR REPLACE FUNCTION v26_validate_course_grade_issuance() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE op uuid; dep uuid; oldgrade record;
BEGIN
 IF NEW.status='draft' THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM learner_course_attempts ca
   WHERE ca.id=NEW.course_attempt_id AND ca.noncredit_registration_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Noncredit course attempts cannot issue official course grades';
 END IF;
 SELECT d.operation_id,ca.deployment_id INTO op,dep
   FROM learner_course_attempts ca JOIN program_deployments d ON d.id=ca.deployment_id
   WHERE ca.id=NEW.course_attempt_id;
 PERFORM v26_require_academic_issuer(op,NEW.issuer_organization_id,
   NEW.finalized_by_person_id,NEW.authority_assignment_id,
   'grade_finalizer','school_of_record',NEW.finalized_at);
 IF NEW.corrected_from_id IS NOT NULL THEN
   SELECT * INTO oldgrade FROM official_course_grades WHERE id=NEW.corrected_from_id;
   IF oldgrade.course_attempt_id<>NEW.course_attempt_id OR oldgrade.issuer_organization_id<>NEW.issuer_organization_id THEN
     RAISE EXCEPTION 'Corrected grade must supersede same learner/course/issuer'; END IF;
 ELSIF NEW.status='corrected' THEN RAISE EXCEPTION 'Correction requires corrected_from_id'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER course_grade_issuer_gate BEFORE INSERT OR UPDATE OF status ON official_course_grades
 FOR EACH ROW EXECUTE FUNCTION v26_validate_course_grade_issuance();
CREATE TRIGGER course_grade_final_immutable BEFORE UPDATE OR DELETE ON official_course_grades
 FOR EACH ROW WHEN (OLD.status<>'draft') EXECUTE FUNCTION reject_immutable_insert_only();
CREATE OR REPLACE FUNCTION v26_validate_credit_issuance() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE op uuid; ga record;
BEGIN
 IF EXISTS(SELECT 1 FROM learner_course_attempts ca
   WHERE ca.id=NEW.course_attempt_id AND ca.noncredit_registration_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Noncredit course attempts cannot award academic credit';
 END IF;
 SELECT d.operation_id INTO op FROM learner_course_attempts ca
  JOIN program_deployments d ON d.id=ca.deployment_id WHERE ca.id=NEW.course_attempt_id;
 PERFORM v26_require_academic_issuer(op,NEW.credit_issuer_organization_id,
   NEW.awarded_by_person_id,NEW.authority_assignment_id,
   'credit_awarder','credit_issuer',NEW.awarded_at);
 IF NEW.grade_id IS NOT NULL THEN
   SELECT * INTO ga FROM official_course_grades WHERE id=NEW.grade_id;
   IF ga.course_attempt_id<>NEW.course_attempt_id OR ga.status NOT IN ('finalized','corrected') THEN
      RAISE EXCEPTION 'Credit award requires finalized grade from same course attempt'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academic_credit_issuer_gate BEFORE INSERT ON academic_credit_awards
 FOR EACH ROW EXECUTE FUNCTION v26_validate_credit_issuance();
CREATE TRIGGER academic_credit_append_only BEFORE UPDATE OR DELETE ON academic_credit_awards
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();

CREATE OR REPLACE FUNCTION v26_protect_financial_commitment() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='funding_allocations' THEN
   IF OLD.status='approved' AND TG_OP='DELETE' THEN RAISE EXCEPTION 'Cannot delete approved allocation'; END IF;
   IF OLD.status='approved' AND TG_OP='UPDATE' AND
       ROW(NEW.source_id,NEW.award_id,NEW.benefit_entitlement_id,NEW.currency,NEW.amount_cents)
        IS DISTINCT FROM ROW(OLD.source_id,OLD.award_id,OLD.benefit_entitlement_id,OLD.currency,OLD.amount_cents) THEN
     RAISE EXCEPTION 'Approved allocation immutable except status revocation'; END IF;
 ELSIF TG_TABLE_NAME='funding_claims' THEN
   IF OLD.status IN ('accepted','paid') AND TG_OP='DELETE' THEN
     RAISE EXCEPTION 'Cannot delete accepted or paid claim'; END IF;
 ELSIF TG_TABLE_NAME='funding_claim_lines' THEN
   IF TG_OP='DELETE' AND EXISTS (SELECT 1 FROM funding_claims c
      WHERE c.id=OLD.funding_claim_id AND c.status<>'draft') THEN
     RAISE EXCEPTION 'Submitted financial claim lines are append-only'; END IF;
 ELSIF TG_TABLE_NAME='fundable_sources' THEN
   IF TG_OP='DELETE' AND EXISTS(SELECT 1 FROM funding_allocations fa WHERE fa.source_id=OLD.id) THEN
      RAISE EXCEPTION 'Cannot remove a source with allocations'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER funding_allocation_delete_guard BEFORE UPDATE OR DELETE ON funding_allocations
 FOR EACH ROW EXECUTE FUNCTION v26_protect_financial_commitment();
CREATE TRIGGER funding_claim_delete_guard BEFORE DELETE ON funding_claims
 FOR EACH ROW EXECUTE FUNCTION v26_protect_financial_commitment();
CREATE TRIGGER funding_claim_line_delete_guard BEFORE DELETE ON funding_claim_lines
 FOR EACH ROW EXECUTE FUNCTION v26_protect_financial_commitment();
CREATE TRIGGER fundable_source_delete_guard BEFORE DELETE ON fundable_sources
 FOR EACH ROW EXECUTE FUNCTION v26_protect_financial_commitment();

CREATE OR REPLACE FUNCTION v26_protect_refresher_rule() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE previous_state text; next_state text;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT lifecycle INTO previous_state FROM foundation_delivery_policy_versions
   WHERE id=OLD.delivery_policy_version_id;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT lifecycle INTO next_state FROM foundation_delivery_policy_versions
   WHERE id=NEW.delivery_policy_version_id;
 END IF;
 IF previous_state='published' OR next_state='published' THEN
   RAISE EXCEPTION 'Published policy refresher rules are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER refresher_rule_policy_freeze BEFORE INSERT OR UPDATE OR DELETE ON foundation_refresher_rule_versions
 FOR EACH ROW EXECUTE FUNCTION v26_protect_refresher_rule();
CREATE TRIGGER course_alignment_append_only BEFORE UPDATE OR DELETE ON course_curriculum_alignments
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE TRIGGER competency_withdrawal_append_only BEFORE UPDATE OR DELETE ON competency_version_withdrawals
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_insert_only();
CREATE INDEX instructional_track_reviews_current_idx ON instructional_track_reviews(track_version_id,review_kind,decision_order DESC);
CREATE INDEX instructor_supplement_reviews_current_idx ON instructor_supplement_reviews(supplement_version_id,review_kind,decision_order DESC);
CREATE INDEX production_review_decisions_current_idx ON production_review_decisions(deliverable_id,review_kind,decision_order DESC);
CREATE INDEX assessment_item_review_decisions_current_idx ON assessment_item_review_decisions(item_version_id,review_kind,decision_order DESC);
CREATE INDEX assessment_form_review_decisions_current_idx ON assessment_form_review_decisions(form_version_id,review_kind,decision_order DESC);
CREATE INDEX assessment_version_review_decisions_current_idx ON assessment_version_review_decisions(assessment_version_id,review_kind,decision_order DESC);

CREATE UNIQUE INDEX official_scope_no_duplicates ON official_authorization_scopes (
 authorization_id,organization_id,operation_id,site_id,offering_id,deployment_id,geographic_area_id,modality_code)
 NULLS NOT DISTINCT;
CREATE INDEX assessment_scoring_assignment_admin_idx ON assessment_scoring_assignments(administration_id,status);
CREATE INDEX readiness_evaluation_learner_profile_idx ON readiness_evaluations(learner_id,readiness_profile_version_id,decided_at DESC);
CREATE INDEX evidence_competency_result_idx ON learner_competency_evidence(learner_id,competency_version_id,assessment_result_id);
CREATE INDEX primary_track_offering_scope_idx ON track_distribution_authorizations(track_version_id,approved_offering_id,status);


COMMENT ON TABLE education_operations IS 'Persistent education operation identity; not the legal organization itself.';
COMMENT ON TABLE blueprints IS 'Reusable recipe for a proposed educational experience.';
COMMENT ON TABLE offerings IS 'Approved packaged education product; independent of the deployment providing it.';
COMMENT ON TABLE program_deployments IS 'Actual delivery of an Offering by one education operation.';
COMMENT ON TABLE staff_assignments IS 'Time-bound exclusive on-site staffing coverage; NOT an authority grant.';
COMMENT ON TABLE professional_role_assignments IS 'Scoped, effective-dated authorization delegated by an organization; not a scheduling record.';
COMMENT ON TABLE assessment_item_competencies IS 'Exact item-version-to-competency-version alignment (no unversioned framework code).';
COMMENT ON TABLE learner_competency_evidence IS 'Raw learner/competency-version evidence, distinct from mastery or readiness judgments.';
COMMENT ON TABLE learner_competency_determinations IS 'Append-only mastery decision under an immutable policy with cited evidence.';
COMMENT ON TABLE readiness_evaluations IS 'Course-specific readiness decision under a provider policy; NOT an automatic enrollment prohibition.';
COMMENT ON TABLE foundation_program_adoptions IS 'Time- and purpose-scoped adoption of a published Foundation, constrained by current distribution rights.';
COMMENT ON TABLE foundation_refresher_rule_versions IS 'Immutable member rules of a published Foundation delivery policy version.';
COMMENT ON TABLE official_course_grades IS 'Official school-of-record grade issuance; requires scoped institutional and human authority.';
COMMENT ON TABLE academic_credit_awards IS 'Official academic credit award; not a grade and never inferred from Foundation engagement.';
COMMENT ON TABLE assessment_item_secure_keys IS 'Restricted encrypted correct-answer material. Default-deny RLS is mandatory.';


-- 13. v2.7: Governance, Trust, Feedback, Assurance and School Operations.
-- New tables are native to a clean education_v30 schema. Network affiliation is optional.

-- POLICY is an obligation. STANDARD is expected experience. CONTROL verifies evidence.
CREATE TABLE governance_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL, title text NOT NULL, category_code text NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
 UNIQUE(owner_organization_id,code)
);
CREATE TABLE governance_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_id uuid NOT NULL REFERENCES governance_policies(id),
 version_no integer NOT NULL CHECK(version_no>0), obligation_text text NOT NULL,
 severity text NOT NULL DEFAULT 'mandatory' CHECK(severity IN ('mandatory','advisory')),
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 effective_from timestamptz, effective_through timestamptz,
 author_person_id uuid NOT NULL REFERENCES persons(id), published_at timestamptz,
 supersedes_id uuid REFERENCES governance_policy_versions(id),
 UNIQUE(policy_id,version_no), UNIQUE(id,policy_id), UNIQUE(supersedes_id),
 CHECK(supersedes_id IS NULL OR supersedes_id<>id),
 CHECK(effective_through IS NULL OR effective_from IS NULL OR effective_through>effective_from),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE governance_policy_scopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_version_id uuid NOT NULL REFERENCES governance_policy_versions(id),
 scope_kind text NOT NULL CHECK(scope_kind IN ('global','organization','network','operation','deployment','site','offering','geography')),
 organization_id uuid REFERENCES organizations(id), network_id uuid REFERENCES education_networks(id),
 operation_id uuid REFERENCES education_operations(id), deployment_id uuid REFERENCES program_deployments(id),
 site_id uuid REFERENCES sites(id), offering_id uuid REFERENCES offerings(id),
 geographic_area_id uuid REFERENCES geographic_areas(id),
 min_age integer CHECK(min_age BETWEEN 0 AND 130), max_age integer CHECK(max_age BETWEEN 0 AND 130),
 delivery_modality text, modality_vocabulary_code text NOT NULL DEFAULT 'delivery_modality' CHECK(modality_vocabulary_code='delivery_modality'),
 FOREIGN KEY(modality_vocabulary_code,delivery_modality) REFERENCES vocabulary_terms(vocabulary_code,code),
 CHECK(max_age IS NULL OR min_age IS NULL OR max_age>=min_age),
 CHECK((scope_kind='global' AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=0)
 OR (scope_kind='organization' AND organization_id IS NOT NULL AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=1)
 OR (scope_kind='network' AND network_id IS NOT NULL AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=1)
 OR (scope_kind='operation' AND operation_id IS NOT NULL AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=1)
 OR (scope_kind='deployment' AND deployment_id IS NOT NULL AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=1)
 OR (scope_kind='site' AND site_id IS NOT NULL AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=1)
 OR (scope_kind='offering' AND offering_id IS NOT NULL AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=1)
 OR (scope_kind='geography' AND geographic_area_id IS NOT NULL AND num_nonnulls(organization_id,network_id,operation_id,deployment_id,site_id,offering_id,geographic_area_id)=1))
);
CREATE TABLE governance_policy_adoptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_version_id uuid NOT NULL REFERENCES governance_policy_versions(id),
 adopting_organization_id uuid NOT NULL REFERENCES organizations(id), operation_id uuid REFERENCES education_operations(id),
 deployment_id uuid REFERENCES program_deployments(id), network_id uuid REFERENCES education_networks(id),
 decision text NOT NULL CHECK(decision IN ('proposed','approved','suspended','revoked')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(), valid_from timestamptz NOT NULL,
 valid_through timestamptz, decided_by_person_id uuid NOT NULL REFERENCES persons(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 CHECK(num_nonnulls(operation_id,deployment_id,network_id)<=1),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 CHECK(decision<>'approved' OR evidence_version_id IS NOT NULL)
);
CREATE TABLE experience_standards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), policy_id uuid REFERENCES governance_policies(id),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id), code text NOT NULL, title text NOT NULL,
 UNIQUE(owner_organization_id,code)
);
CREATE TABLE experience_standard_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), standard_id uuid NOT NULL REFERENCES experience_standards(id),
 version_no integer NOT NULL CHECK(version_no>0), expectation_text text NOT NULL,
 metric_code text, target_value numeric(18,5), unit_code text,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz, UNIQUE(standard_id,version_no), CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE assurance_controls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 control_code text NOT NULL, title text NOT NULL, UNIQUE(owner_organization_id,control_code)
);
CREATE TABLE assurance_control_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), control_id uuid NOT NULL REFERENCES assurance_controls(id),
 version_no integer NOT NULL CHECK(version_no>0), standard_version_id uuid REFERENCES experience_standard_versions(id),
 policy_version_id uuid REFERENCES governance_policy_versions(id),
 verification_method text NOT NULL, evidence_requirements text NOT NULL,
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz, UNIQUE(control_id,version_no),
 CHECK(num_nonnulls(standard_version_id,policy_version_id)>=1),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE control_obligations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), control_version_id uuid NOT NULL REFERENCES assurance_control_versions(id),
 accountable_organization_id uuid NOT NULL REFERENCES organizations(id),
 operation_id uuid REFERENCES education_operations(id), deployment_id uuid REFERENCES program_deployments(id),
 site_id uuid REFERENCES sites(id), valid_from timestamptz NOT NULL, valid_through timestamptz,
 obligation_status text NOT NULL DEFAULT 'active' CHECK(obligation_status IN ('active','suspended','ended')),
 CHECK(num_nonnulls(operation_id,deployment_id,site_id)=1),
 CHECK(valid_through IS NULL OR valid_through>valid_from)
);
CREATE TABLE control_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), obligation_id uuid NOT NULL REFERENCES control_obligations(id),
 evaluated_by_person_id uuid NOT NULL REFERENCES persons(id), evaluator_organization_id uuid NOT NULL REFERENCES organizations(id),
 determination text NOT NULL CHECK(determination IN ('compliant','deficient','inconclusive','not_applicable')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(), effective_on date NOT NULL DEFAULT CURRENT_DATE,
 supersedes_id uuid UNIQUE REFERENCES control_evaluations(id),
 CHECK(supersedes_id IS NULL OR supersedes_id<>id)
);
CREATE TABLE control_evaluation_evidence (
 evaluation_id uuid NOT NULL REFERENCES control_evaluations(id),
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 evidence_purpose text NOT NULL, PRIMARY KEY(evaluation_id,evidence_version_id)
);
CREATE TABLE governance_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), obligation_id uuid NOT NULL REFERENCES control_obligations(id),
 requested_by_organization_id uuid NOT NULL REFERENCES organizations(id),
 decision text NOT NULL CHECK(decision IN ('requested','approved','denied','revoked')),
 scope_justification text NOT NULL, authorized_by_person_id uuid REFERENCES persons(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 valid_from timestamptz, valid_through timestamptz,
 CHECK(valid_through IS NULL OR valid_from IS NULL OR valid_through>valid_from),
 CHECK(decision<>'approved' OR (authorized_by_person_id IS NOT NULL AND evidence_version_id IS NOT NULL))
);

-- Operational permissions are independently granted, revoked and scoped.
-- Permission to MARKET_PROPOSED never implies permission to ENROLL or OPERATE.
CREATE TABLE operational_authorization_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 stage_code text NOT NULL CHECK(stage_code IN ('design','market_proposed','publish_approved','accept_inquiries',
 'accept_applications','enroll','register_noncredit','deliver','operate','issue_credit','issue_credential')),
 operation_id uuid REFERENCES education_operations(id), deployment_id uuid REFERENCES program_deployments(id),
 site_id uuid REFERENCES sites(id), offering_version_id uuid REFERENCES offering_versions(id),
 authority_organization_id uuid NOT NULL REFERENCES organizations(id),
 authorizing_person_id uuid NOT NULL REFERENCES persons(id),
 governance_policy_version_id uuid REFERENCES governance_policy_versions(id),
 decision text NOT NULL CHECK(decision IN ('approved','conditional','denied','suspended','revoked')),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE, decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 supersedes_id uuid UNIQUE REFERENCES operational_authorization_decisions(id),
 CHECK(num_nonnulls(operation_id,deployment_id,site_id,offering_version_id)=1),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 CHECK(supersedes_id IS NULL OR supersedes_id<>id)
);
CREATE INDEX operational_permission_scope_idx ON operational_authorization_decisions
 (stage_code,operation_id,deployment_id,site_id,offering_version_id,decision_order DESC);

-- The published site is able to distinguish plans from approved and available experiences.
CREATE TABLE program_publication_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_snapshot_id uuid NOT NULL REFERENCES operation_publication_snapshots(id),
 operation_id uuid NOT NULL REFERENCES education_operations(id), deployment_id uuid REFERENCES program_deployments(id),
 offering_version_id uuid REFERENCES offering_versions(id),
 program_claim_kind text NOT NULL CHECK(program_claim_kind IN ('proposed','approved','enrolling','operating')),
 display_text text NOT NULL, source_authorization_decision_id uuid NOT NULL REFERENCES operational_authorization_decisions(id),
 reviewed_by_person_id uuid NOT NULL REFERENCES persons(id),
 CHECK(num_nonnulls(deployment_id,offering_version_id)<=1)
);

-- Authoritative public-claim projection. Internal plan/Blueprint approval cannot publish.
-- security_invoker=true intentionally requires explicit publication-reader RLS policy.
CREATE VIEW v301_current_public_program_claims WITH (security_invoker=true) AS
 SELECT c.id AS claim_id,c.operation_id,c.deployment_id,c.offering_version_id,
   c.program_claim_kind,c.display_text,s.published_at,c.publication_snapshot_id,
   c.source_authorization_decision_id
 FROM program_publication_claims c
 JOIN operation_publication_snapshots s ON s.id=c.publication_snapshot_id
 JOIN operational_authorization_decisions a ON a.id=c.source_authorization_decision_id
 WHERE s.published_at<=CURRENT_TIMESTAMP
   AND NOT EXISTS (SELECT 1 FROM publication_withdrawals w
     WHERE w.publication_snapshot_id=s.id AND w.effective_at<=CURRENT_TIMESTAMP)
   AND NOT EXISTS (SELECT 1 FROM operation_publication_snapshots newer
     WHERE newer.operation_id=s.operation_id
       AND newer.deployment_id IS NOT DISTINCT FROM s.deployment_id
       AND (newer.published_at,newer.id)>(s.published_at,s.id)
       AND newer.published_at<=CURRENT_TIMESTAMP)
   AND a.decision='approved'
   AND a.valid_from<=CURRENT_TIMESTAMP
   AND (a.valid_through IS NULL OR a.valid_through>CURRENT_TIMESTAMP)
   AND a.stage_code=CASE c.program_claim_kind
       WHEN 'proposed' THEN 'market_proposed'
       WHEN 'approved' THEN 'publish_approved'
       WHEN 'enrolling' THEN 'enroll' ELSE 'operate' END
   AND NOT EXISTS (SELECT 1 FROM operational_authorization_decisions later
     WHERE later.supersedes_id=a.id);
COMMENT ON VIEW v301_current_public_program_claims IS
 'Only latest effective independently-reviewed claims with current stage authorization; caller still requires scoped RLS permissions.';

-- A published public Site can expose only the current, authorized claims for
-- Operations actively linked to that Site. Callers receive no table access.
CREATE FUNCTION v301_public_site_claims(requested_slug text)
RETURNS TABLE(site_id uuid, site_name text, operation_id uuid,
  program_claim_kind text, display_text text, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,education_v30,pg_temp AS $$
 SELECT DISTINCT s.id,s.name,c.operation_id,c.program_claim_kind,c.display_text,c.published_at
 FROM site_publication_bindings b
 JOIN sites s ON s.id=b.site_id
 LEFT JOIN education_operation_sites os ON os.site_id=s.id
   AND os.valid_from<=CURRENT_TIMESTAMP
   AND (os.valid_through IS NULL OR os.valid_through>CURRENT_TIMESTAMP)
 LEFT JOIN v301_current_public_program_claims c ON c.operation_id=os.operation_id
 WHERE b.public_slug=requested_slug AND b.status='published'
$$;
REVOKE ALL ON FUNCTION v301_public_site_claims(text) FROM PUBLIC;
COMMENT ON FUNCTION v301_public_site_claims(text) IS
 'Public-safe Site and current authorized program claims by published slug; grant execution only to the restricted public-site reader role.';

-- Facility capabilities are proposed and independently verified; JSON resources are informational only.
CREATE TABLE facility_capability_types (
 code text PRIMARY KEY, title text NOT NULL, verification_guidance text NOT NULL
);
INSERT INTO facility_capability_types(code,title,verification_guidance) VALUES
 ('general_instruction','General instruction space','Confirm egress, supervision and capacity'),
 ('art_ventilation','Art ventilation','Verify ventilation appropriate to materials and activities'),
 ('accessible_access','Accessible access','Inspect accessible routes and equipment'),
 ('science_laboratory','Science lab','Validate equipment, storage, protection, permits'),
 ('internet_access','Internet access','Measure connectivity and learner access'),
 ('secure_supervision','Supervision','Review visibility, safeguarding and staffing');
CREATE TABLE site_space_capability_assertions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), space_id uuid NOT NULL REFERENCES site_spaces(id),
 capability_code text NOT NULL REFERENCES facility_capability_types(code),
 claimed_by_organization_id uuid NOT NULL REFERENCES organizations(id),
 claimed_by_person_id uuid NOT NULL REFERENCES persons(id), claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','withdrawn')),
 UNIQUE(id,capability_code,space_id)
);
CREATE TABLE site_space_capability_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assertion_id uuid NOT NULL REFERENCES site_space_capability_assertions(id),
 verifier_person_id uuid NOT NULL REFERENCES persons(id), verifier_organization_id uuid NOT NULL REFERENCES organizations(id),
 result text NOT NULL CHECK(result IN ('verified','not_verified','revoked','requires_review')),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz,
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 CHECK(expires_at IS NULL OR expires_at>verified_at)
);
CREATE TABLE blueprint_facility_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), blueprint_component_id uuid NOT NULL REFERENCES blueprint_components(id),
 capability_code text NOT NULL REFERENCES facility_capability_types(code),
 minimum_spaces integer NOT NULL DEFAULT 1 CHECK(minimum_spaces>0),
 rationale text NOT NULL, UNIQUE(blueprint_component_id,capability_code)
);
CREATE TABLE site_requirement_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), facility_requirement_id uuid NOT NULL REFERENCES blueprint_facility_requirements(id),
 space_id uuid NOT NULL REFERENCES site_spaces(id), verification_id uuid NOT NULL REFERENCES site_space_capability_verifications(id),
 decided_by_person_id uuid NOT NULL REFERENCES persons(id), deciding_organization_id uuid NOT NULL REFERENCES organizations(id),
 decision text NOT NULL CHECK(decision IN ('satisfied','not_satisfied','conditional')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(), reason text,
 UNIQUE(id,facility_requirement_id)
);

-- Publication review of the exact artifact manifest, not an arbitrary review of a mutable collection.
CREATE TABLE content_publication_manifests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 track_version_id uuid REFERENCES instructional_track_versions(id),
 foundation_version_id uuid REFERENCES foundation_versions(id),
 offering_version_id uuid REFERENCES offering_versions(id),
 manifest_hash text NOT NULL CHECK(manifest_hash ~ '^[a-f0-9]{64}$'),
 manifest_status text NOT NULL DEFAULT 'draft' CHECK(manifest_status IN ('draft','approved')),
 created_by_person_id uuid NOT NULL REFERENCES persons(id), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(track_version_id,foundation_version_id,offering_version_id)=1), UNIQUE(manifest_hash)
);
CREATE TABLE content_publication_manifest_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifest_id uuid NOT NULL REFERENCES content_publication_manifests(id),
 content_asset_version_id uuid NOT NULL REFERENCES content_asset_versions(id),
 usage_kind text NOT NULL CHECK(usage_kind IN ('required_instruction','supporting','accessibility','assessment')),
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 rights_evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(manifest_id,content_asset_version_id,usage_kind)
);
CREATE TABLE content_manifest_review_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifest_id uuid NOT NULL REFERENCES content_publication_manifests(id),
 review_kind text NOT NULL CHECK(review_kind IN ('academic','rights','accessibility','coverage','safety')),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id), decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 evidence_version_id uuid REFERENCES evidence_document_versions(id)
);
CREATE OR REPLACE FUNCTION validate_track_manifest_rights_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE track_id uuid; evidence_kind text; verified_at_value timestamptz;
        verified_by_value uuid; valid_from_value date; valid_through_value date;
BEGIN
 SELECT track_version_id INTO track_id
   FROM content_publication_manifests WHERE id=NEW.manifest_id;
 IF track_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.rights_evidence_version_id IS NULL THEN
  RAISE EXCEPTION 'Track manifest items require evidence-bound rights review';
 END IF;
 SELECT d.kind_code,v.verified_at,v.verified_by_person_id,v.valid_from,v.valid_through
   INTO evidence_kind,verified_at_value,verified_by_value,valid_from_value,valid_through_value
   FROM evidence_document_versions v
   JOIN evidence_documents d ON d.id=v.document_id
   WHERE v.id=NEW.rights_evidence_version_id;
 IF NOT FOUND OR evidence_kind<>'rights' OR verified_at_value IS NULL
   OR verified_at_value>clock_timestamp() OR verified_by_value IS NULL
   OR (valid_from_value IS NOT NULL AND valid_from_value>(clock_timestamp() AT TIME ZONE 'UTC')::date)
   OR (valid_through_value IS NOT NULL AND valid_through_value<(clock_timestamp() AT TIME ZONE 'UTC')::date) THEN
  RAISE EXCEPTION 'Track manifest rights evidence must be verified and current';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER track_manifest_rights_evidence_guard
 BEFORE INSERT OR UPDATE OF manifest_id,rights_evidence_version_id ON content_publication_manifest_items
 FOR EACH ROW EXECUTE FUNCTION validate_track_manifest_rights_evidence();

-- Survey design is separate from assignment, response, classification and finding.
CREATE TABLE survey_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 code text NOT NULL, title text NOT NULL, purpose_code text NOT NULL,
 intended_audience text NOT NULL CHECK(intended_audience IN ('learner','guardian','professional','operator','any')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
 UNIQUE(owner_organization_id,code)
);
CREATE TABLE survey_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), survey_id uuid NOT NULL REFERENCES survey_definitions(id),
 version_no integer NOT NULL CHECK(version_no>0), locale text NOT NULL DEFAULT 'en-US',
 author_person_id uuid NOT NULL REFERENCES persons(id),
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz, UNIQUE(survey_id,version_no,locale), UNIQUE(id,survey_id),
 CHECK(lifecycle<>'published' OR published_at IS NOT NULL)
);
CREATE TABLE survey_questions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), survey_version_id uuid NOT NULL REFERENCES survey_versions(id),
 question_key text NOT NULL, prompt_text text NOT NULL, ordinal integer NOT NULL CHECK(ordinal>0),
 question_type text NOT NULL CHECK(question_type IN ('single_choice','multiple_choice','rating','likert','nps','text','matrix')),
 required boolean NOT NULL DEFAULT false,
 safety_triage boolean NOT NULL DEFAULT false,
 rating_min integer, rating_max integer,
 UNIQUE(survey_version_id,question_key), UNIQUE(survey_version_id,ordinal),
 UNIQUE(id,survey_version_id),
 CHECK((question_type IN ('rating','likert','nps') AND rating_min IS NOT NULL AND rating_max IS NOT NULL AND rating_max>rating_min)
 OR (question_type NOT IN ('rating','likert','nps') AND rating_min IS NULL AND rating_max IS NULL))
);
CREATE TABLE survey_question_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), question_id uuid NOT NULL REFERENCES survey_questions(id),
 option_key text NOT NULL, label text NOT NULL, ordinal integer NOT NULL CHECK(ordinal>0),
 numeric_value numeric(12,5),
 UNIQUE(question_id,option_key), UNIQUE(question_id,ordinal), UNIQUE(id,question_id)
);
CREATE TABLE survey_question_branch_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), survey_version_id uuid NOT NULL REFERENCES survey_versions(id),
 source_question_id uuid NOT NULL, target_question_id uuid NOT NULL,
 source_option_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('show','skip_to')),
 FOREIGN KEY(source_question_id,survey_version_id) REFERENCES survey_questions(id,survey_version_id),
 FOREIGN KEY(target_question_id,survey_version_id) REFERENCES survey_questions(id,survey_version_id),
 FOREIGN KEY(source_option_id,source_question_id) REFERENCES survey_question_options(id,question_id),
 CHECK(source_question_id<>target_question_id)
);
CREATE TABLE survey_version_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), survey_version_id uuid NOT NULL REFERENCES survey_versions(id),
 review_kind text NOT NULL CHECK(review_kind IN ('academic','privacy','accessibility','safeguarding')),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id), decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 evidence_version_id uuid REFERENCES evidence_document_versions(id)
);
CREATE TABLE survey_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), survey_version_id uuid NOT NULL REFERENCES survey_versions(id),
 operating_organization_id uuid NOT NULL REFERENCES organizations(id),
 operation_id uuid REFERENCES education_operations(id), network_id uuid REFERENCES education_networks(id),
 deployment_id uuid REFERENCES program_deployments(id), offering_id uuid REFERENCES offerings(id),
 site_id uuid REFERENCES sites(id),
 response_mode text NOT NULL CHECK(response_mode IN ('identified','confidential','anonymous')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','paused','closed')),
 starts_at timestamptz NOT NULL, ends_at timestamptz,
 minimum_reporting_cell integer NOT NULL DEFAULT 10 CHECK(minimum_reporting_cell>=5),
 authorized_by_person_id uuid NOT NULL REFERENCES persons(id),
 survey_permission_evidence_id uuid REFERENCES evidence_document_versions(id),
 CHECK(num_nonnulls(operation_id,network_id,deployment_id,offering_id,site_id)<=1),
 CHECK(ends_at IS NULL OR ends_at>starts_at), UNIQUE(id,survey_version_id)
);
CREATE TABLE survey_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES survey_campaigns(id),
 invited_person_id uuid NOT NULL REFERENCES persons(id),
 invite_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 delivery_channel text NOT NULL CHECK(delivery_channel IN ('email','sms','in_app','paper')),
 sent_at timestamptz, due_at timestamptz, reminder_count integer NOT NULL DEFAULT 0 CHECK(reminder_count>=0),
 UNIQUE(campaign_id,invited_person_id)
);
-- Anonymous token redemption has no person, invitation, IP, user-agent, or source identifier.
-- Identity verification and issuance occur outside the respondent-facing survey database.
CREATE TABLE survey_anonymous_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES survey_campaigns(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 redeemed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,campaign_id)
);
CREATE TABLE survey_confidential_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),campaign_id uuid NOT NULL REFERENCES survey_campaigns(id),
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 redeemed_day date NOT NULL DEFAULT CURRENT_DATE, UNIQUE(id,campaign_id)
);
CREATE TABLE survey_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL,
 survey_version_id uuid NOT NULL, respondent_mode text NOT NULL
 CHECK(respondent_mode IN ('identified','confidential','anonymous')),
 invitation_id uuid REFERENCES survey_invitations(id), anonymous_redemption_id uuid,
 confidential_redemption_id uuid,
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(), language_code text NOT NULL DEFAULT 'en-US',
 consent_evidence_version_id uuid REFERENCES evidence_document_versions(id),
 FOREIGN KEY(campaign_id,survey_version_id) REFERENCES survey_campaigns(id,survey_version_id),
 FOREIGN KEY(anonymous_redemption_id,campaign_id) REFERENCES survey_anonymous_redemptions(id,campaign_id),
 FOREIGN KEY(confidential_redemption_id,campaign_id) REFERENCES survey_confidential_redemptions(id,campaign_id),
 UNIQUE(id,survey_version_id), UNIQUE(invitation_id), UNIQUE(anonymous_redemption_id), UNIQUE(confidential_redemption_id),
 CHECK((respondent_mode='anonymous' AND invitation_id IS NULL AND anonymous_redemption_id IS NOT NULL AND confidential_redemption_id IS NULL)
 OR (respondent_mode='confidential' AND invitation_id IS NULL AND anonymous_redemption_id IS NULL AND confidential_redemption_id IS NOT NULL)
 OR (respondent_mode='identified' AND invitation_id IS NOT NULL AND anonymous_redemption_id IS NULL AND confidential_redemption_id IS NULL))
);
CREATE TABLE survey_answers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), response_id uuid NOT NULL,
 survey_version_id uuid NOT NULL, question_id uuid NOT NULL,
 answer_text text, answer_numeric numeric(15,5), answer_boolean boolean,
 sensitive_redacted boolean NOT NULL DEFAULT false,
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(response_id,survey_version_id) REFERENCES survey_responses(id,survey_version_id),
 FOREIGN KEY(question_id,survey_version_id) REFERENCES survey_questions(id,survey_version_id),
 UNIQUE(response_id,question_id), UNIQUE(id,question_id),
 CHECK(num_nonnulls(answer_text,answer_numeric,answer_boolean)<=1),
 CHECK(NOT sensitive_redacted OR num_nonnulls(answer_text,answer_numeric,answer_boolean)=0)
);
CREATE TABLE survey_answer_choices (
 answer_id uuid NOT NULL, question_id uuid NOT NULL, option_id uuid NOT NULL,
 PRIMARY KEY(answer_id,option_id),
 FOREIGN KEY(answer_id,question_id) REFERENCES survey_answers(id,question_id),
 FOREIGN KEY(option_id,question_id) REFERENCES survey_question_options(id,question_id)
);
CREATE TABLE survey_trigger_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES survey_campaigns(id),
 trigger_kind text NOT NULL CHECK(trigger_kind IN ('enrollment_started','unit_completed','track_switched',
 'tutoring_completed','term_ended','staff_onboarded','incident_resolved','program_renewal')),
 cooldown_days integer NOT NULL DEFAULT 30 CHECK(cooldown_days>=0),
 max_invites_per_person integer NOT NULL DEFAULT 1 CHECK(max_invites_per_person>0), enabled boolean NOT NULL DEFAULT true
);

-- Feedback is NOT a substantiated finding; a negative rating alone cannot revoke a person's authorization.
CREATE TABLE feedback_categories (
 code text PRIMARY KEY, title text NOT NULL, safety_classification boolean NOT NULL DEFAULT false
);
INSERT INTO feedback_categories(code,title,safety_classification) VALUES
 ('academic_experience','Academic experience',false),('learner_support','Learner support',false),
 ('facility','Facility',false),('family_communication','Family communication',false),
 ('workforce_experience','Workforce experience',false),('program_effectiveness','Program effectiveness',false),
 ('platform_support','Platform support',false),('safety','Safety or safeguarding',true);
CREATE TABLE feedback_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 feedback_kind text NOT NULL CHECK(feedback_kind IN ('suggestion','compliment','concern','complaint','observation')),
 category_code text NOT NULL REFERENCES feedback_categories(code),
 survey_response_id uuid REFERENCES survey_responses(id),
 submitted_by_person_id uuid REFERENCES persons(id),
 privacy_mode text NOT NULL CHECK(privacy_mode IN ('identified','confidential','anonymous')),
 details_text text, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 priority text NOT NULL DEFAULT 'routine' CHECK(priority IN ('routine','high','urgent')),
 status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','triaged','referred','closed')),
 CHECK(privacy_mode<>'anonymous' OR submitted_by_person_id IS NULL),
 CHECK(category_code<>'safety' OR details_text IS NULL),
 CHECK(num_nonnulls(survey_response_id,submitted_by_person_id)>=1 OR privacy_mode='anonymous')
);
CREATE TABLE feedback_subjects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), feedback_id uuid NOT NULL REFERENCES feedback_items(id),
 operation_id uuid REFERENCES education_operations(id), deployment_id uuid REFERENCES program_deployments(id),
 course_version_id uuid REFERENCES course_versions(id), track_version_id uuid REFERENCES instructional_track_versions(id),
 foundation_version_id uuid REFERENCES foundation_versions(id),
 site_id uuid REFERENCES sites(id), professional_person_id uuid REFERENCES persons(id),
 service_engagement_id uuid REFERENCES professional_service_engagements(id), organization_id uuid REFERENCES organizations(id),
 CHECK(num_nonnulls(operation_id,deployment_id,course_version_id,track_version_id,foundation_version_id,
 site_id,professional_person_id,service_engagement_id,organization_id)=1)
);
CREATE TABLE feedback_followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), feedback_id uuid NOT NULL REFERENCES feedback_items(id),
 initiated_by_person_id uuid NOT NULL REFERENCES persons(id), followup_campaign_id uuid REFERENCES survey_campaigns(id),
 verification_question text NOT NULL, resolution_rating integer CHECK(resolution_rating BETWEEN 1 AND 5),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Reusable case workflow, distinct secured detail boundary for child-safety disclosures.
CREATE TABLE assurance_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owning_organization_id uuid NOT NULL REFERENCES organizations(id),
 case_kind text NOT NULL CHECK(case_kind IN ('complaint','quality','incident','safeguarding')),
 operation_id uuid REFERENCES education_operations(id), site_id uuid REFERENCES sites(id),
 deployment_id uuid REFERENCES program_deployments(id),
 feedback_id uuid REFERENCES feedback_items(id),
 case_reference text NOT NULL UNIQUE, general_summary text,
 severity text NOT NULL CHECK(severity IN ('routine','high','critical')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','triage','investigating','action','resolved','closed','reopened')),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(case_kind<>'safeguarding' OR general_summary IS NULL)
);
CREATE TABLE assurance_case_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES assurance_cases(id),
 actor_person_id uuid NOT NULL REFERENCES persons(id), event_kind text NOT NULL CHECK(event_kind IN
 ('opened','triaged','assigned','escalated','evidence_received','protective_measure','finding','resolved','reopened','closed')),
 event_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 event_summary text, evidence_version_id uuid REFERENCES evidence_document_versions(id),
 CHECK(event_kind<>'protective_measure' OR evidence_version_id IS NOT NULL)
);
CREATE TABLE assurance_case_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES assurance_cases(id),
 accountable_organization_id uuid NOT NULL REFERENCES organizations(id),
 responsible_person_id uuid NOT NULL REFERENCES persons(id),
 assignment_kind text NOT NULL CHECK(assignment_kind IN ('triage','investigation','remediation','independent_verification')),
 starts_at timestamptz NOT NULL, ends_at timestamptz, assigned_by_person_id uuid NOT NULL REFERENCES persons(id),
 CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE TABLE assurance_case_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES assurance_cases(id),
 escalated_by_person_id uuid NOT NULL REFERENCES persons(id),
 escalation_to_organization_id uuid NOT NULL REFERENCES organizations(id),
 reason_code text NOT NULL, required_response_at timestamptz NOT NULL,
 escalated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 CHECK(required_response_at>=escalated_at)
);
CREATE TABLE assurance_case_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES assurance_cases(id),
 control_evaluation_id uuid REFERENCES control_evaluations(id),
 finding_kind text NOT NULL CHECK(finding_kind IN ('substantiated','unsubstantiated','inconclusive','policy_gap')),
 determined_by_person_id uuid NOT NULL REFERENCES persons(id),
 determined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 supersedes_id uuid UNIQUE REFERENCES assurance_case_findings(id),
 CHECK(supersedes_id IS NULL OR supersedes_id<>id)
);
CREATE TABLE assurance_case_outcomes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES assurance_cases(id),
 outcome_kind text NOT NULL CHECK(outcome_kind IN ('resolved','unresolved','referred','withdrawn','appealed','closed')),
 decided_by_person_id uuid NOT NULL REFERENCES persons(id), decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 supersedes_id uuid UNIQUE REFERENCES assurance_case_outcomes(id),
 CHECK(supersedes_id IS NULL OR supersedes_id<>id)
);
-- Every safety-designated intake receives a synchronous triage queue entry.
CREATE TABLE safeguarding_triage_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), feedback_id uuid UNIQUE REFERENCES feedback_items(id),
 case_id uuid UNIQUE REFERENCES assurance_cases(id),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 priority text NOT NULL DEFAULT 'urgent' CHECK(priority IN ('urgent','critical')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','escalated','closed')),
 CHECK(num_nonnulls(feedback_id,case_id)=1)
);

-- Restricted storage boundary. Ordinary survey, feedback and network dashboards cannot access details.
CREATE SCHEMA IF NOT EXISTS education_v30_secure;
-- Anonymous contact details are kept apart from the organization-scoped
-- prospect and interest rows. Public-site inquiries are contact requests,
-- never identity, household, application, or enrollment creation.
CREATE TABLE education_v30_secure.enrollment_prospect_contact_details (
 prospect_id uuid PRIMARY KEY REFERENCES education_v30.enrollment_prospects(id),
 request_id uuid NOT NULL UNIQUE,
 contact_first_name text NOT NULL CHECK(length(btrim(contact_first_name)) BETWEEN 1 AND 80),
 contact_last_name text NOT NULL CHECK(length(btrim(contact_last_name)) BETWEEN 1 AND 80),
 contact_email text NOT NULL CHECK(
   length(contact_email)<=254 AND contact_email=lower(btrim(contact_email))),
 email_digest text NOT NULL CHECK(email_digest ~ '^[0-9a-f]{64}$'),
 message text NOT NULL DEFAULT '' CHECK(length(message)<=500),
 contact_consent_at timestamptz NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX enrollment_prospect_contact_digest_idx
 ON education_v30_secure.enrollment_prospect_contact_details(email_digest,captured_at DESC);
COMMENT ON TABLE education_v30_secure.enrollment_prospect_contact_details IS
 'Restricted anonymous contact payload for a prospect; do not copy contact fields into ordinary rows, audit events, or domain events.';
-- Raw student practice answers are separately restricted; ordinary progress reads
-- need not expose the student's response text or JSON. Access requires reviewed role grants.
CREATE TABLE education_v30_secure.formative_practice_responses (
  practice_attempt_id uuid PRIMARY KEY REFERENCES education_v30.formative_practice_attempts(id),
  response jsonb NOT NULL CHECK(jsonb_typeof(response)='object'),
  privacy_class text NOT NULL DEFAULT 'restricted'
    CHECK(privacy_class IN ('restricted','highly_restricted')),
  retained_until timestamptz,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER formative_practice_response_append_only
BEFORE UPDATE OR DELETE ON education_v30_secure.formative_practice_responses
FOR EACH ROW EXECUTE FUNCTION education_v30.reject_immutable_insert_only();
COMMENT ON TABLE education_v30_secure.formative_practice_responses IS
 'Learner practice responses; never grant via general learner progress, network or content access roles.';
CREATE TABLE education_v30_secure.safeguarding_cases (
 case_id uuid PRIMARY KEY REFERENCES education_v30.assurance_cases(id),
 opened_by_person_id uuid REFERENCES education_v30.persons(id),
 restricted_classification text NOT NULL DEFAULT 'safeguarding' CHECK(restricted_classification='safeguarding'),
 triage_status text NOT NULL DEFAULT 'pending' CHECK(triage_status IN ('pending','active','escalated','closed')),
 sensitive_summary text, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE education_v30_secure.safeguarding_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid REFERENCES education_v30_secure.safeguarding_cases(case_id),
 survey_response_id uuid REFERENCES education_v30.survey_responses(id),
 survey_question_id uuid REFERENCES education_v30.survey_questions(id),
 feedback_id uuid REFERENCES education_v30.feedback_items(id),
 report_text text NOT NULL, reported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reporting_person_id uuid REFERENCES education_v30.persons(id),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','triaged','linked','closed')),
 CHECK(num_nonnulls(survey_response_id,feedback_id,case_id)>=1)
);
CREATE TABLE education_v30_secure.safeguarding_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES education_v30_secure.safeguarding_cases(case_id),
 evidence_version_id uuid NOT NULL REFERENCES education_v30.evidence_document_versions(id),
 added_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 disclosure_level text NOT NULL CHECK(disclosure_level IN ('investigator_only','authorized_custodian','legal_hold')),
 UNIQUE(case_id,evidence_version_id)
);
CREATE TABLE education_v30_secure.safeguarding_identity_escrow (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid NOT NULL UNIQUE REFERENCES education_v30_secure.safeguarding_reports(id),
 reporter_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 escrow_reason text NOT NULL, authorized_custodian_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE experience_metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metric_code text NOT NULL UNIQUE,
 name text NOT NULL, definition text NOT NULL,
 calculation_method text NOT NULL, higher_is_better boolean,
 standard_version_id uuid REFERENCES experience_standard_versions(id),
 default_minimum_cell integer NOT NULL DEFAULT 10 CHECK(default_minimum_cell>=5)
);
CREATE TABLE metric_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), metric_id uuid NOT NULL REFERENCES experience_metrics(id),
 observing_organization_id uuid NOT NULL REFERENCES organizations(id),
 network_id uuid REFERENCES education_networks(id), operation_id uuid REFERENCES education_operations(id),
 site_id uuid REFERENCES sites(id), deployment_id uuid REFERENCES program_deployments(id),
 period_from date NOT NULL, period_through date NOT NULL,
 sample_count integer NOT NULL CHECK(sample_count>=0), eligible_count integer CHECK(eligible_count>=sample_count),
 minimum_cell integer NOT NULL DEFAULT 10 CHECK(minimum_cell>=5),
 is_suppressed boolean NOT NULL, observed_value numeric(18,6),
 calculation_version text NOT NULL, generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(period_through>=period_from),
 CHECK(num_nonnulls(network_id,operation_id,site_id,deployment_id)=1),
 CHECK((sample_count<minimum_cell AND is_suppressed AND observed_value IS NULL)
 OR (sample_count>=minimum_cell AND NOT is_suppressed))
);
CREATE TABLE quality_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 standard_version_id uuid REFERENCES experience_standard_versions(id),
 control_evaluation_id uuid REFERENCES control_evaluations(id),
 subject_operation_id uuid REFERENCES education_operations(id),
 subject_site_id uuid REFERENCES sites(id), subject_track_version_id uuid REFERENCES instructional_track_versions(id),
 subject_deployment_id uuid REFERENCES program_deployments(id),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id), reviewing_organization_id uuid NOT NULL REFERENCES organizations(id),
 determination text NOT NULL CHECK(determination IN ('meets_standard','improvement_needed','inconclusive')),
 evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(standard_version_id,control_evaluation_id)=1),
 CHECK(num_nonnulls(subject_operation_id,subject_site_id,subject_track_version_id,subject_deployment_id)=1)
);
CREATE TABLE quality_evaluation_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quality_evaluation_id uuid NOT NULL REFERENCES quality_evaluations(id),
 survey_response_id uuid REFERENCES survey_responses(id),
 metric_observation_id uuid REFERENCES metric_observations(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 assessment_result_id uuid REFERENCES assessment_attempt_results(id),
 CHECK(num_nonnulls(survey_response_id,metric_observation_id,evidence_version_id,assessment_result_id)=1)
);
CREATE TABLE improvement_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid REFERENCES assurance_cases(id),
 quality_evaluation_id uuid REFERENCES quality_evaluations(id),
 control_evaluation_id uuid REFERENCES control_evaluations(id),
 qualification_finding_id uuid,
 accountable_organization_id uuid NOT NULL REFERENCES organizations(id),
 title text NOT NULL, opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 plan_status text NOT NULL DEFAULT 'draft' CHECK(plan_status IN ('draft','approved','active','completed','cancelled')),
 CHECK(num_nonnulls(case_id,quality_evaluation_id,control_evaluation_id,qualification_finding_id)>=1)
);
CREATE TABLE improvement_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES improvement_plans(id),
 assigned_organization_id uuid NOT NULL REFERENCES organizations(id),
 action_owner_person_id uuid NOT NULL REFERENCES persons(id), action_description text NOT NULL,
 due_at timestamptz NOT NULL,
 action_status text NOT NULL DEFAULT 'assigned' CHECK(action_status IN ('assigned','in_progress','completed','cancelled')),
 completed_at timestamptz, CHECK(action_status<>'completed' OR completed_at IS NOT NULL)
);
CREATE TABLE improvement_action_evidence (
 action_id uuid NOT NULL REFERENCES improvement_actions(id),
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 submitted_by_person_id uuid NOT NULL REFERENCES persons(id),
 PRIMARY KEY(action_id,evidence_version_id)
);
CREATE TABLE improvement_verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), action_id uuid NOT NULL REFERENCES improvement_actions(id),
 verifier_person_id uuid NOT NULL REFERENCES persons(id),
 determination text NOT NULL CHECK(determination IN ('verified','rejected','requires_followup')),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 UNIQUE(action_id,verified_at)
);
CREATE TABLE quality_reassessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), plan_id uuid NOT NULL REFERENCES improvement_plans(id),
 followup_quality_evaluation_id uuid REFERENCES quality_evaluations(id),
 followup_metric_observation_id uuid REFERENCES metric_observations(id),
 outcome text NOT NULL CHECK(outcome IN ('improved','unchanged','worsened','inconclusive')),
 reassessed_by_person_id uuid NOT NULL REFERENCES persons(id),
 reassessed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(followup_quality_evaluation_id,followup_metric_observation_id)=1)
);

-- Credential issuer authority and traceable academic support without conflating transcript and grade.
CREATE TABLE credential_issuance_support (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), issuance_id uuid NOT NULL REFERENCES credential_issuances(id),
 issuing_organization_id uuid NOT NULL REFERENCES organizations(id),
 authorization_id uuid REFERENCES official_authorizations(id),
 operational_authorization_decision_id uuid REFERENCES operational_authorization_decisions(id),
 graduation_decision_id uuid REFERENCES graduation_decisions(id),
 academic_credit_award_id uuid REFERENCES academic_credit_awards(id),
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 authorized_by_person_id uuid NOT NULL REFERENCES persons(id),
 CHECK(num_nonnulls(graduation_decision_id,academic_credit_award_id)>=1),
 CHECK(num_nonnulls(authorization_id,operational_authorization_decision_id)>=1),
 UNIQUE(issuance_id,evidence_version_id)
);

-- Runtime permissions are data, not implicit network inheritance. A real application
-- identity must be verified through a trusted authentication boundary, not custom SET GUC.
CREATE TABLE application_principals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), person_id uuid REFERENCES persons(id),
 service_organization_id uuid REFERENCES organizations(id),
 principal_kind text NOT NULL CHECK(principal_kind IN ('human','service')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 CHECK((principal_kind='human' AND person_id IS NOT NULL AND service_organization_id IS NULL)
 OR (principal_kind='service' AND person_id IS NULL AND service_organization_id IS NOT NULL))
);
CREATE TABLE application_principal_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal_id uuid NOT NULL REFERENCES application_principals(id),
 grantee_organization_id uuid NOT NULL REFERENCES organizations(id),
 operation_id uuid REFERENCES education_operations(id), deployment_id uuid REFERENCES program_deployments(id),
 site_id uuid REFERENCES sites(id), network_id uuid REFERENCES education_networks(id),
 permission_code text NOT NULL CHECK(permission_code IN ('survey_manage','survey_respond','feedback_read',
 'case_triage','case_investigate','case_verify','safeguarding_investigate','safeguarding_custodian',
 'policy_manage','facility_verify','blueprint_execute','admission_manage','academic_issue','device_manage','technology_support','initiative_manage','funding_manage','noncredit_register')),
 effective_from timestamptz NOT NULL, effective_through timestamptz,
 granted_by_person_id uuid NOT NULL REFERENCES persons(id),
 status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','suspended','revoked')),
 CHECK(num_nonnulls(operation_id,deployment_id,site_id,network_id)<=1),
 CHECK(effective_through IS NULL OR effective_through>effective_from)
);

CREATE TABLE application_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES program_applications(id),
 deciding_organization_id uuid NOT NULL REFERENCES organizations(id), decided_by_person_id uuid NOT NULL REFERENCES persons(id),
 decision text NOT NULL CHECK(decision IN ('offer','waitlist','decline','withdraw_offer')),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(), evidence_version_id uuid REFERENCES evidence_document_versions(id),
 supersedes_id uuid UNIQUE REFERENCES application_decisions(id),
 CHECK(supersedes_id IS NULL OR supersedes_id<>id)
);
CREATE TABLE applicant_offer_responses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_decision_id uuid NOT NULL REFERENCES application_decisions(id),
 response text NOT NULL CHECK(response IN ('accepted','declined','deferred')),
 responded_by_person_id uuid NOT NULL REFERENCES persons(id),
 responded_at timestamptz NOT NULL DEFAULT clock_timestamp(), response_evidence_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(application_decision_id)
);



-- v2.7 data integrity and secure workflow triggers.
-- CAN OS v2.8 server-side invariants. All functions run as invoker.
-- There are no implicit rights based on membership in a denomination/network.

CREATE OR REPLACE FUNCTION v27_reject_update_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN RAISE EXCEPTION '% is append-only; append a correction or superseding decision', TG_TABLE_NAME; END $$;

-- Published governance and survey versions retain the exact definitions evaluated.
CREATE OR REPLACE FUNCTION v27_protect_published_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF OLD.lifecycle='published' THEN RAISE EXCEPTION 'Published version % is immutable',TG_TABLE_NAME; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_policy_version BEFORE UPDATE OR DELETE ON governance_policy_versions
 FOR EACH ROW EXECUTE FUNCTION v27_protect_published_parent();
CREATE TRIGGER protect_standard_version BEFORE UPDATE OR DELETE ON experience_standard_versions
 FOR EACH ROW EXECUTE FUNCTION v27_protect_published_parent();
CREATE TRIGGER protect_control_version BEFORE UPDATE OR DELETE ON assurance_control_versions
 FOR EACH ROW EXECUTE FUNCTION v27_protect_published_parent();
CREATE TRIGGER protect_survey_version BEFORE UPDATE OR DELETE ON survey_versions
 FOR EACH ROW EXECUTE FUNCTION v27_protect_published_parent();
CREATE OR REPLACE FUNCTION v27_protect_survey_children() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE s_old text; s_new text;
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF TG_TABLE_NAME='survey_questions' THEN
   SELECT lifecycle INTO s_old FROM survey_versions WHERE id=OLD.survey_version_id;
  ELSIF TG_TABLE_NAME='survey_question_options' THEN
   SELECT v.lifecycle INTO s_old FROM survey_questions q JOIN survey_versions v ON v.id=q.survey_version_id WHERE q.id=OLD.question_id;
  ELSIF TG_TABLE_NAME='survey_question_branch_rules' THEN
   SELECT lifecycle INTO s_old FROM survey_versions WHERE id=OLD.survey_version_id;
  ELSE RAISE EXCEPTION 'Unexpected survey child table %',TG_TABLE_NAME; END IF;
  IF s_old IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Cannot mutate child of published survey'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  IF TG_TABLE_NAME='survey_questions' THEN
   SELECT lifecycle INTO s_new FROM survey_versions WHERE id=NEW.survey_version_id;
  ELSIF TG_TABLE_NAME='survey_question_options' THEN
   SELECT v.lifecycle INTO s_new FROM survey_questions q JOIN survey_versions v ON v.id=q.survey_version_id WHERE q.id=NEW.question_id;
  ELSIF TG_TABLE_NAME='survey_question_branch_rules' THEN
   SELECT lifecycle INTO s_new FROM survey_versions WHERE id=NEW.survey_version_id;
  END IF;
  IF s_new IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'Cannot add to published survey'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_question_snapshot BEFORE INSERT OR UPDATE OR DELETE ON survey_questions
 FOR EACH ROW EXECUTE FUNCTION v27_protect_survey_children();
CREATE TRIGGER survey_option_snapshot BEFORE INSERT OR UPDATE OR DELETE ON survey_question_options
 FOR EACH ROW EXECUTE FUNCTION v27_protect_survey_children();
CREATE TRIGGER survey_branch_snapshot BEFORE INSERT OR UPDATE OR DELETE ON survey_question_branch_rules
 FOR EACH ROW EXECUTE FUNCTION v27_protect_survey_children();
CREATE OR REPLACE FUNCTION v27_check_survey_publication() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE k text; review record; author uuid;
BEGIN
 IF NEW.lifecycle<>'published' THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM survey_questions WHERE survey_version_id=NEW.id) THEN
  RAISE EXCEPTION 'Cannot publish a survey with no questions'; END IF;
 FOREACH k IN ARRAY ARRAY['privacy','accessibility','safeguarding'] LOOP
  SELECT decision,reviewer_person_id INTO review FROM survey_version_reviews
   WHERE survey_version_id=NEW.id AND review_kind=k ORDER BY decision_order DESC LIMIT 1;
  IF review.decision IS DISTINCT FROM 'approved' OR review.reviewer_person_id=NEW.author_person_id THEN
   RAISE EXCEPTION 'Survey requires independent % review',k; END IF;
  review:=NULL;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_publication_gate BEFORE INSERT OR UPDATE OF lifecycle ON survey_versions
 FOR EACH ROW EXECUTE FUNCTION v27_check_survey_publication();
CREATE OR REPLACE FUNCTION v27_check_survey_campaign() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.status IN ('scheduled','active') THEN
  IF NOT EXISTS(SELECT 1 FROM survey_versions WHERE id=NEW.survey_version_id AND lifecycle='published') THEN
   RAISE EXCEPTION 'Campaign must use a published survey version'; END IF;
  IF NEW.survey_permission_evidence_id IS NULL THEN
   RAISE EXCEPTION 'Campaign requires scope and audience authorization evidence'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_campaign_gate BEFORE INSERT OR UPDATE OF status,survey_version_id ON survey_campaigns
 FOR EACH ROW EXECUTE FUNCTION v27_check_survey_campaign();
CREATE OR REPLACE FUNCTION v27_check_survey_response() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE mode text; state text; from_at timestamptz; through_at timestamptz;
BEGIN
 SELECT response_mode,status,starts_at,ends_at INTO mode,state,from_at,through_at
 FROM survey_campaigns WHERE id=NEW.campaign_id FOR SHARE;
 IF mode IS DISTINCT FROM NEW.respondent_mode OR state<>'active' OR clock_timestamp()<from_at
   OR (through_at IS NOT NULL AND clock_timestamp()>=through_at) THEN
  RAISE EXCEPTION 'Survey not active or respondent mode does not match campaign'; END IF;
 IF NEW.invitation_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM survey_invitations WHERE id=NEW.invitation_id AND campaign_id=NEW.campaign_id) THEN
  RAISE EXCEPTION 'Invitation does not belong to this survey campaign'; END IF;
 NEW.submitted_at:=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER survey_response_gate BEFORE INSERT ON survey_responses
 FOR EACH ROW EXECUTE FUNCTION v27_check_survey_response();
CREATE OR REPLACE FUNCTION v27_check_survey_answer() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE is_safety boolean; q_kind text; min_v int; max_v int;
BEGIN
 SELECT safety_triage,question_type,rating_min,rating_max INTO is_safety,q_kind,min_v,max_v
 FROM survey_questions WHERE id=NEW.question_id;
 IF is_safety AND (NOT NEW.sensitive_redacted OR
    num_nonnulls(NEW.answer_text,NEW.answer_numeric,NEW.answer_boolean)<>0) THEN
   RAISE EXCEPTION 'Safeguarding response must be redacted in ordinary survey storage'; END IF;
 IF q_kind IN ('rating','likert','nps') AND NEW.answer_numeric IS NOT NULL AND
    (NEW.answer_numeric<min_v OR NEW.answer_numeric>max_v) THEN
   RAISE EXCEPTION 'Rating is outside the published question scale'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER survey_answer_gate BEFORE INSERT ON survey_answers
 FOR EACH ROW EXECUTE FUNCTION v27_check_survey_answer();
CREATE OR REPLACE FUNCTION v27_require_secure_safety_intake() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,education_v30_secure,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM education_v30.survey_questions q WHERE q.id=NEW.question_id AND q.safety_triage)
  AND NOT EXISTS(SELECT 1 FROM education_v30_secure.safeguarding_reports r
    WHERE r.survey_response_id=NEW.response_id AND r.survey_question_id=NEW.question_id)
 THEN RAISE EXCEPTION 'Safety answer requires restricted intake in the same transaction'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER survey_sensitive_intake_required AFTER INSERT ON survey_answers
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v27_require_secure_safety_intake();

-- Minimal triage metadata is created synchronously; sensitive descriptions are never copied to network surveys.
CREATE OR REPLACE FUNCTION v27_open_safety_feedback_triage() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.category_code='safety' THEN
   INSERT INTO safeguarding_triage_queue(feedback_id,priority) VALUES(NEW.id,
    CASE WHEN NEW.priority='urgent' THEN 'critical' ELSE 'urgent' END) ON CONFLICT(feedback_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER feedback_safety_triage AFTER INSERT ON feedback_items
 FOR EACH ROW EXECUTE FUNCTION v27_open_safety_feedback_triage();
CREATE OR REPLACE FUNCTION v27_open_safeguarding_case_triage() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.case_kind='safeguarding' THEN
  INSERT INTO safeguarding_triage_queue(case_id,priority) VALUES(NEW.id,
    CASE WHEN NEW.severity='critical' THEN 'critical' ELSE 'urgent' END);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER case_safety_triage AFTER INSERT ON assurance_cases
 FOR EACH ROW EXECUTE FUNCTION v27_open_safeguarding_case_triage();
CREATE OR REPLACE FUNCTION education_v30_secure.v27_safeguarding_case_kind() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30_secure,education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM education_v30.assurance_cases
  WHERE id=NEW.case_id AND case_kind='safeguarding') THEN
   RAISE EXCEPTION 'Restricted safeguarding record requires a safeguarding-classified case'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER safeguarding_case_kind BEFORE INSERT ON education_v30_secure.safeguarding_cases
 FOR EACH ROW EXECUTE FUNCTION education_v30_secure.v27_safeguarding_case_kind();

-- Blueprint output requires a reviewed, frozen recipe and one approved decision per selected component.
CREATE OR REPLACE FUNCTION v27_validate_blueprint_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE missing_count integer; state text; publication_state text; decision text;
BEGIN
 IF TG_OP='UPDATE' AND (NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
   OR NEW.executing_organization_id IS DISTINCT FROM OLD.executing_organization_id
   OR NEW.configuration_version_id IS DISTINCT FROM OLD.configuration_version_id
   OR NEW.blueprint_version_id IS DISTINCT FROM OLD.blueprint_version_id
   OR NEW.review_id IS DISTINCT FROM OLD.review_id) THEN
   RAISE EXCEPTION 'Executed recipe batch identity is immutable'; END IF;
 IF NEW.execution_status NOT IN ('authorized','executed') THEN RETURN NEW; END IF;
 SELECT lifecycle INTO state FROM blueprint_configuration_versions WHERE id=NEW.configuration_version_id;
 SELECT lifecycle INTO publication_state FROM blueprint_versions WHERE id=NEW.blueprint_version_id;
 SELECT r.decision INTO decision FROM configuration_reviews r WHERE r.id=NEW.review_id;
 IF state IS DISTINCT FROM 'frozen' OR publication_state IS DISTINCT FROM 'published'
    OR decision IS DISTINCT FROM 'approved' THEN
  RAISE EXCEPTION 'Blueprint batch requires published recipe, frozen configuration, approved review'; END IF;
 SELECT count(*) INTO missing_count FROM blueprint_configuration_components c
 WHERE c.configuration_version_id=NEW.configuration_version_id AND c.selection_status='selected'
   AND NOT EXISTS(SELECT 1 FROM
     (SELECT DISTINCT ON (a.component_id) a.component_id,a.decision
      FROM blueprint_component_approval_decisions a
      WHERE a.configuration_version_id=NEW.configuration_version_id
      ORDER BY a.component_id,a.decision_order DESC) latest
      WHERE latest.component_id=c.component_id AND latest.decision='approved');
 IF missing_count>0 THEN RAISE EXCEPTION 'Selected Blueprint components need independent approved decisions'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER blueprint_batch_gate BEFORE INSERT OR UPDATE OF execution_status ON blueprint_execution_batches
 FOR EACH ROW EXECUTE FUNCTION v27_validate_blueprint_batch();

-- Every new public program claim must have an effective and independently scoped decision.
CREATE OR REPLACE FUNCTION v27_check_publication_claim() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE k text; expected text; decision record; op uuid; snapshot_dep uuid; offer uuid;
BEGIN
 SELECT operation_id,deployment_id INTO op,snapshot_dep FROM operation_publication_snapshots WHERE id=NEW.publication_snapshot_id;
 IF NOT EXISTS(SELECT 1 FROM operation_publication_snapshots s
   WHERE s.id=NEW.publication_snapshot_id
     AND (CASE s.publication_kind
       WHEN 'planned' THEN 1 WHEN 'approved' THEN 2
       WHEN 'enrolling' THEN 3 ELSE 4 END)
       >= (CASE NEW.program_claim_kind
       WHEN 'proposed' THEN 1 WHEN 'approved' THEN 2
       WHEN 'enrolling' THEN 3 ELSE 4 END)) THEN
   RAISE EXCEPTION 'Public claim cannot assert a later stage than the approved snapshot'; END IF;
 IF op IS DISTINCT FROM NEW.operation_id THEN RAISE EXCEPTION 'Claim outside its publication operation'; END IF;
 IF snapshot_dep IS NOT NULL AND NEW.deployment_id IS DISTINCT FROM snapshot_dep THEN
   RAISE EXCEPTION 'Deployment claim does not match its publication snapshot'; END IF;
 IF NEW.deployment_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM program_deployments WHERE id=NEW.deployment_id AND operation_id=NEW.operation_id) THEN
   RAISE EXCEPTION 'Publication references deployment from another operation'; END IF;
 expected:=CASE NEW.program_claim_kind
  WHEN 'proposed' THEN 'market_proposed'
  WHEN 'approved' THEN 'publish_approved'
  WHEN 'enrolling' THEN 'enroll' ELSE 'operate' END;
 SELECT a.decision,a.stage_code,a.operation_id,a.deployment_id,a.offering_version_id,a.valid_from,a.valid_through,a.authorizing_person_id
 INTO decision FROM operational_authorization_decisions a
 WHERE a.id=NEW.source_authorization_decision_id;
 IF decision.decision IS DISTINCT FROM 'approved' OR decision.stage_code IS DISTINCT FROM expected
  OR decision.valid_from>clock_timestamp() OR
   (decision.valid_through IS NOT NULL AND decision.valid_through<=clock_timestamp()) THEN
   RAISE EXCEPTION 'Program claim lacks current stage-specific authorization'; END IF;
 IF NEW.reviewed_by_person_id=decision.authorizing_person_id THEN
   RAISE EXCEPTION 'Claim reviewer must be independent from its authorizing person'; END IF;
 IF NOT ((decision.operation_id IS NOT NULL AND decision.operation_id=NEW.operation_id)
  OR (decision.deployment_id IS NOT NULL AND decision.deployment_id=NEW.deployment_id)
  OR (decision.offering_version_id IS NOT NULL AND decision.offering_version_id=NEW.offering_version_id)) THEN
   RAISE EXCEPTION 'Program claim authorization scope mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM operational_authorization_decisions newer
    WHERE newer.supersedes_id=NEW.source_authorization_decision_id) THEN
   RAISE EXCEPTION 'Superseded publication authorization is no longer current'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER publication_claim_gate BEFORE INSERT OR UPDATE ON program_publication_claims
 FOR EACH ROW EXECUTE FUNCTION v27_check_publication_claim();
CREATE OR REPLACE FUNCTION v27_check_application_decision() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE dep uuid; operation_uuid uuid;
BEGIN
 SELECT deployment_id INTO dep FROM program_applications WHERE id=NEW.application_id;
 SELECT operation_id INTO operation_uuid FROM program_deployments WHERE id=dep;
 IF NOT EXISTS (SELECT 1 FROM operational_authorization_decisions a
  WHERE a.stage_code='accept_applications' AND a.decision='approved'
   AND a.authority_organization_id=NEW.deciding_organization_id
   AND (a.deployment_id=dep OR a.operation_id=operation_uuid)
   AND a.valid_from<=NEW.decided_at AND (a.valid_through IS NULL OR a.valid_through>NEW.decided_at)
   AND NOT EXISTS(SELECT 1 FROM operational_authorization_decisions n WHERE n.supersedes_id=a.id)) THEN
  RAISE EXCEPTION 'Admissions decision issuer must hold current authorized application scope'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER admission_decision_gate BEFORE INSERT ON application_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_check_application_decision();
CREATE OR REPLACE FUNCTION v27_check_offer_response() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM application_decisions WHERE id=NEW.application_decision_id AND decision='offer') THEN
  RAISE EXCEPTION 'Only an actual admission offer can be accepted or declined by an applicant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER offer_response_gate BEFORE INSERT ON applicant_offer_responses
 FOR EACH ROW EXECUTE FUNCTION v27_check_offer_response();

CREATE OR REPLACE FUNCTION v27_check_facility_verification() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE proposer uuid;
BEGIN
 SELECT claimed_by_person_id INTO proposer FROM site_space_capability_assertions WHERE id=NEW.assertion_id;
 IF NEW.result='verified' AND NEW.verifier_person_id=proposer THEN
  RAISE EXCEPTION 'Proposer cannot independently verify their own facility capability'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER facility_independent_verification BEFORE INSERT ON site_space_capability_verifications
 FOR EACH ROW EXECUTE FUNCTION v27_check_facility_verification();
CREATE OR REPLACE FUNCTION v27_check_facility_requirement() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE expected_code text; actual_code text; actual_space uuid; latest_verification uuid; result text; expires timestamptz;
BEGIN
 IF NEW.decision<>'satisfied' THEN RETURN NEW; END IF;
 SELECT capability_code INTO expected_code FROM blueprint_facility_requirements WHERE id=NEW.facility_requirement_id;
 SELECT a.capability_code,a.space_id INTO actual_code,actual_space
 FROM site_space_capability_verifications v
 JOIN site_space_capability_assertions a ON a.id=v.assertion_id WHERE v.id=NEW.verification_id;
 SELECT v.id,v.result,v.expires_at INTO latest_verification,result,expires
 FROM site_space_capability_verifications v
 JOIN site_space_capability_assertions a ON a.id=v.assertion_id
 WHERE a.capability_code=expected_code AND a.space_id=NEW.space_id
 ORDER BY v.decision_order DESC LIMIT 1;
 IF actual_code IS DISTINCT FROM expected_code OR actual_space IS DISTINCT FROM NEW.space_id
  OR latest_verification IS DISTINCT FROM NEW.verification_id
  OR result IS DISTINCT FROM 'verified' OR (expires IS NOT NULL AND expires<=NEW.decided_at) THEN
  RAISE EXCEPTION 'Facility requirement needs current verified matching space capability'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER facility_requirement_gate BEFORE INSERT ON site_requirement_evaluations
 FOR EACH ROW EXECUTE FUNCTION v27_check_facility_requirement();

CREATE OR REPLACE FUNCTION v27_check_manifest_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE author uuid;
BEGIN
 SELECT created_by_person_id INTO author FROM content_publication_manifests WHERE id=NEW.manifest_id;
 IF NEW.decision='approved' AND NEW.reviewer_person_id=author THEN
  RAISE EXCEPTION 'Content author cannot independently approve own manifest'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER manifest_independent_review BEFORE INSERT ON content_manifest_review_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_check_manifest_review();
CREATE OR REPLACE FUNCTION v27_check_manifest_approval() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE k text; r text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.manifest_status='approved' THEN
  RAISE EXCEPTION 'Approved content manifests are immutable; publish a new manifest or withdrawal'; END IF;
 IF NEW.manifest_status<>'approved' THEN RETURN NEW; END IF;
 IF NOT EXISTS(SELECT 1 FROM content_publication_manifest_items WHERE manifest_id=NEW.id) THEN
  RAISE EXCEPTION 'Cannot approve empty content manifest'; END IF;
 FOREACH k IN ARRAY ARRAY['academic','rights','accessibility'] LOOP
  SELECT decision INTO r FROM content_manifest_review_decisions
  WHERE manifest_id=NEW.id AND review_kind=k ORDER BY decision_order DESC LIMIT 1;
  IF r IS DISTINCT FROM 'approved' THEN RAISE EXCEPTION 'Manifest requires % review',k; END IF;
  r:=NULL;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER manifest_approval_gate BEFORE INSERT OR UPDATE ON content_publication_manifests
 FOR EACH ROW EXECUTE FUNCTION v27_check_manifest_approval();
CREATE OR REPLACE FUNCTION v27_manifest_child_lock() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE s_old text; s_new text;
BEGIN
 IF TG_OP<>'INSERT' THEN
  SELECT manifest_status INTO s_old FROM content_publication_manifests WHERE id=OLD.manifest_id;
  IF s_old='approved' THEN RAISE EXCEPTION 'Cannot mutate approved content manifest entries'; END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN
  SELECT manifest_status INTO s_new FROM content_publication_manifests WHERE id=NEW.manifest_id;
  IF s_new='approved' THEN RAISE EXCEPTION 'Cannot add to approved content manifest'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER manifest_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON content_publication_manifest_items
 FOR EACH ROW EXECUTE FUNCTION v27_manifest_child_lock();

CREATE OR REPLACE FUNCTION v27_case_event_privacy() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM assurance_cases WHERE id=NEW.case_id AND case_kind='safeguarding')
   AND NEW.event_summary IS NOT NULL THEN
   RAISE EXCEPTION 'Safeguarding case narrative belongs only in restricted storage'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER case_event_guard BEFORE INSERT ON assurance_case_events
 FOR EACH ROW EXECUTE FUNCTION v27_case_event_privacy();
CREATE OR REPLACE FUNCTION v27_verify_improvement() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE owner uuid; state text;
BEGIN
 SELECT action_owner_person_id,action_status INTO owner,state FROM improvement_actions WHERE id=NEW.action_id;
 IF NEW.determination='verified' THEN
  IF state<>'completed' OR owner=NEW.verifier_person_id THEN
    RAISE EXCEPTION 'Completed action requires independent verification'; END IF;
  IF NOT EXISTS(SELECT 1 FROM improvement_action_evidence WHERE action_id=NEW.action_id) THEN
    RAISE EXCEPTION 'Verified action requires completion evidence'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER independent_improvement_verification BEFORE INSERT ON improvement_verifications
 FOR EACH ROW EXECUTE FUNCTION v27_verify_improvement();
CREATE OR REPLACE FUNCTION v27_check_plan_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.plan_status='completed' AND OLD.plan_status<>'completed' AND (
   NOT EXISTS (SELECT 1 FROM improvement_actions WHERE plan_id=NEW.id) OR EXISTS(
   SELECT 1 FROM improvement_actions a WHERE a.plan_id=NEW.id AND
    (a.action_status<>'completed' OR NOT EXISTS (
     SELECT 1 FROM improvement_verifications v WHERE v.action_id=a.id AND v.determination='verified'
       AND NOT EXISTS(SELECT 1 FROM improvement_verifications successor
           WHERE successor.action_id=v.action_id AND successor.verified_at>v.verified_at)
    )))) THEN
   RAISE EXCEPTION 'Plan cannot complete until each action is independently verified'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER plan_completion_gate BEFORE UPDATE OF plan_status ON improvement_plans
 FOR EACH ROW EXECUTE FUNCTION v27_check_plan_completion();
CREATE OR REPLACE FUNCTION v27_check_metric_observation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE threshold integer;
BEGIN
 SELECT default_minimum_cell INTO threshold FROM experience_metrics WHERE id=NEW.metric_id;
 IF NEW.minimum_cell<threshold THEN RAISE EXCEPTION 'Metric reporting cell threshold cannot be weakened'; END IF;
 IF NEW.is_suppressed AND NEW.observed_value IS NOT NULL THEN RAISE EXCEPTION 'Suppressed group cannot expose metric'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER metric_privacy_gate BEFORE INSERT ON metric_observations
 FOR EACH ROW EXECUTE FUNCTION v27_check_metric_observation();
CREATE OR REPLACE FUNCTION v27_check_credential_support() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE issuer uuid; learner uuid; stage text; actual_learner uuid;
BEGIN
 SELECT issuing_organization_id,learner_id INTO issuer,learner FROM credential_issuances WHERE id=NEW.issuance_id;
 IF issuer IS DISTINCT FROM NEW.issuing_organization_id THEN
  RAISE EXCEPTION 'Credential support issuer must match actual credential issuer'; END IF;
 IF NEW.graduation_decision_id IS NOT NULL THEN
  SELECT learner_id INTO actual_learner FROM graduation_decisions WHERE id=NEW.graduation_decision_id;
  IF actual_learner IS DISTINCT FROM learner THEN RAISE EXCEPTION 'Graduation evidence belongs to different learner'; END IF;
 END IF;
 IF NEW.academic_credit_award_id IS NOT NULL THEN
  SELECT e.learner_id INTO actual_learner FROM academic_credit_awards a
   JOIN learner_course_attempts ca ON ca.id=a.course_attempt_id JOIN enrollments e ON e.id=ca.enrollment_id
   WHERE a.id=NEW.academic_credit_award_id;
  IF actual_learner IS DISTINCT FROM learner THEN RAISE EXCEPTION 'Credit support belongs to different learner'; END IF;
 END IF;
 IF NEW.operational_authorization_decision_id IS NOT NULL THEN
  SELECT stage_code INTO stage FROM operational_authorization_decisions
   WHERE id=NEW.operational_authorization_decision_id AND decision='approved'
    AND authority_organization_id=issuer AND valid_from<=clock_timestamp()
    AND (valid_through IS NULL OR valid_through>clock_timestamp())
    AND NOT EXISTS (SELECT 1 FROM operational_authorization_decisions newer
      WHERE newer.supersedes_id=NEW.operational_authorization_decision_id);
  IF stage IS DISTINCT FROM 'issue_credential' THEN
   RAISE EXCEPTION 'Credential issuance needs current issue_credential authorization'; END IF;
 END IF;
 IF NEW.authorization_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM official_authorizations a JOIN official_authorization_scopes s ON s.authorization_id=a.id
  WHERE a.id=NEW.authorization_id AND a.official_decision='approved'
   AND a.effective_at<=clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
   AND s.organization_id=issuer
   AND NOT EXISTS(SELECT 1 FROM official_authorization_events e
    WHERE e.authorization_id=a.id AND e.event_kind IN ('revoked','suspended')
      AND e.effective_at<=clock_timestamp())) THEN
  RAISE EXCEPTION 'Credential support lacks scoped issuer authorization'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credential_support_authority BEFORE INSERT ON credential_issuance_support
 FOR EACH ROW EXECUTE FUNCTION v27_check_credential_support();
CREATE OR REPLACE FUNCTION v27_check_internal_credential_issuance() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.status='issued' AND NEW.issuing_organization_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM credential_issuance_support s
   WHERE s.issuance_id=NEW.id AND s.issuing_organization_id=NEW.issuing_organization_id
   AND (s.authorization_id IS NOT NULL OR s.operational_authorization_decision_id IS NOT NULL)) THEN
  RAISE EXCEPTION 'Internal credential issuance requires documented authority and supporting academic evidence'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER internal_credential_evidence_gate AFTER INSERT ON credential_issuances
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v27_check_internal_credential_issuance();

-- Audit-worthy decisions and proof are insert-only: correction creates another row.
CREATE TRIGGER policy_adoption_append_only BEFORE UPDATE OR DELETE ON governance_policy_adoptions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER policy_scope_immutable BEFORE UPDATE OR DELETE ON governance_policy_scopes
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER control_evaluation_append_only BEFORE UPDATE OR DELETE ON control_evaluations
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER control_evaluation_evidence_append_only BEFORE UPDATE OR DELETE ON control_evaluation_evidence
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER operation_permission_append_only BEFORE UPDATE OR DELETE ON operational_authorization_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
-- Each whole-configuration review is independent, historical evidence.
CREATE TRIGGER blueprint_configuration_review_append_only BEFORE UPDATE OR DELETE ON configuration_reviews
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER blueprint_component_decision_append_only BEFORE UPDATE OR DELETE ON blueprint_component_approval_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER facility_verification_append_only BEFORE UPDATE OR DELETE ON site_space_capability_verifications
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER survey_response_append_only BEFORE UPDATE OR DELETE ON survey_responses
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER survey_answer_append_only BEFORE UPDATE OR DELETE ON survey_answers
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER survey_answer_choices_append_only BEFORE UPDATE OR DELETE ON survey_answer_choices
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER survey_version_reviews_append_only BEFORE UPDATE OR DELETE ON survey_version_reviews
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER feedback_subject_append_only BEFORE UPDATE OR DELETE ON feedback_subjects
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER case_event_append_only BEFORE UPDATE OR DELETE ON assurance_case_events
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER case_finding_append_only BEFORE UPDATE OR DELETE ON assurance_case_findings
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER case_outcome_append_only BEFORE UPDATE OR DELETE ON assurance_case_outcomes
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER improvement_verification_append_only BEFORE UPDATE OR DELETE ON improvement_verifications
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER quality_reassessment_append_only BEFORE UPDATE OR DELETE ON quality_reassessments
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER metric_observation_append_only BEFORE UPDATE OR DELETE ON metric_observations
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER content_manifest_reviews_append_only BEFORE UPDATE OR DELETE ON content_manifest_review_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER application_decision_append_only BEFORE UPDATE OR DELETE ON application_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER applicant_response_append_only BEFORE UPDATE OR DELETE ON applicant_offer_responses
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER credential_support_append_only BEFORE UPDATE OR DELETE ON credential_issuance_support
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER secure_safeguarding_report_append_only BEFORE UPDATE OR DELETE ON education_v30_secure.safeguarding_reports
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER secure_safeguarding_escrow_append_only BEFORE UPDATE OR DELETE ON education_v30_secure.safeguarding_identity_escrow
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();

COMMENT ON TABLE survey_anonymous_redemptions IS 'No person, invitation, IP, or analytics join key. Eligible token issuance requires a separate trusted privacy-preserving service.';
COMMENT ON TABLE education_v30_secure.safeguarding_reports IS 'Sensitive intake is inaccessible to normal survey, school, and denomination analytics. A different restricted storage boundary.';
COMMENT ON TABLE operational_authorization_decisions IS 'Permission to market a proposed school is not permission to enroll, deliver, or issue credentials.';
COMMENT ON TABLE quality_evaluations IS 'Professional quality judgment; survey ratings remain observations rather than findings.';
COMMENT ON TABLE control_evaluations IS 'Append-only assurance decision against a declared control obligation.';
COMMENT ON TABLE blueprint_execution_batches IS 'One approved recipe execution may yield one operation and multiple independent offering outputs.';
COMMENT ON TABLE enrollment_prospects IS 'Prospective participant or family contact, NOT a fake learner or enrolled student.';

CREATE OR REPLACE FUNCTION v27_validate_operational_authorization() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE op uuid; offering uuid; needed_role text; prev record;
BEGIN
 IF NEW.supersedes_id IS NOT NULL THEN
  SELECT stage_code,operation_id,deployment_id,site_id,offering_version_id,authority_organization_id
    INTO prev FROM operational_authorization_decisions WHERE id=NEW.supersedes_id;
  IF prev.stage_code IS DISTINCT FROM NEW.stage_code OR
     prev.operation_id IS DISTINCT FROM NEW.operation_id OR
     prev.deployment_id IS DISTINCT FROM NEW.deployment_id OR
     prev.site_id IS DISTINCT FROM NEW.site_id OR
     prev.offering_version_id IS DISTINCT FROM NEW.offering_version_id OR
     prev.authority_organization_id IS DISTINCT FROM NEW.authority_organization_id THEN
   RAISE EXCEPTION 'Permission corrections must retain the same stage, scope and issuer'; END IF;
 END IF;
 IF NEW.decision NOT IN ('approved','conditional') THEN RETURN NEW; END IF;
 op:=NEW.operation_id;
 IF NEW.deployment_id IS NOT NULL THEN
  SELECT operation_id INTO op FROM program_deployments WHERE id=NEW.deployment_id;
 END IF;
 IF op IS NOT NULL THEN
   needed_role:=CASE NEW.stage_code WHEN 'issue_credit' THEN 'credit_issuer'
    WHEN 'issue_credential' THEN 'credential_issuer'
    WHEN 'enroll' THEN 'school_of_record'
    ELSE 'operator' END;
   IF NOT EXISTS(SELECT 1 FROM education_operation_organization_roles r
     WHERE r.operation_id=op AND r.organization_id=NEW.authority_organization_id
       AND r.role_code=needed_role AND r.status='approved'
       AND r.valid_from<=NEW.decided_at AND (r.valid_through IS NULL OR r.valid_through>NEW.decided_at)) THEN
     RAISE EXCEPTION 'Organization does not hold effective % authority for this operation',needed_role; END IF;
 ELSIF NEW.site_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM site_organization_roles r
     WHERE r.site_id=NEW.site_id AND r.organization_id=NEW.authority_organization_id
       AND r.role_code IN ('operator','facility_manager')
       AND r.valid_from<=NEW.decided_at AND (r.valid_through IS NULL OR r.valid_through>NEW.decided_at)) THEN
      RAISE EXCEPTION 'Organization lacks site operating or management authorization'; END IF;
 ELSIF NEW.offering_version_id IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM offering_versions ov JOIN offerings o ON o.id=ov.offering_id
    WHERE ov.id=NEW.offering_version_id AND o.publisher_organization_id=NEW.authority_organization_id) THEN
      RAISE EXCEPTION 'Organization is not the accountable Offering publisher'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER operational_authority_scope_gate BEFORE INSERT ON operational_authorization_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_validate_operational_authorization();
CREATE OR REPLACE FUNCTION v27_validate_control_obligation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM assurance_control_versions v
   WHERE v.id=NEW.control_version_id AND v.lifecycle='published') THEN
   RAISE EXCEPTION 'Control obligations require published control definitions'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER control_obligation_publish_gate BEFORE INSERT ON control_obligations
 FOR EACH ROW EXECUTE FUNCTION v27_validate_control_obligation();
CREATE OR REPLACE FUNCTION v27_validate_case_outcome() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.outcome_kind IN ('closed','resolved') AND EXISTS(SELECT 1 FROM improvement_plans p
  WHERE p.case_id=NEW.case_id AND p.plan_status NOT IN ('completed','cancelled')) THEN
  RAISE EXCEPTION 'Cannot resolve case with unverified outstanding improvement plan'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER case_outcome_completion_gate BEFORE INSERT ON assurance_case_outcomes
 FOR EACH ROW EXECUTE FUNCTION v27_validate_case_outcome();


-- v2.7 secure defaults.
ALTER TABLE governance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_policy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_policy_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_policy_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_policy_adoptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_policy_adoptions FORCE ROW LEVEL SECURITY;
ALTER TABLE experience_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_standards FORCE ROW LEVEL SECURITY;
ALTER TABLE experience_standard_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE experience_standard_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_control_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_control_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE control_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_obligations FORCE ROW LEVEL SECURITY;
ALTER TABLE control_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_evaluations FORCE ROW LEVEL SECURITY;
ALTER TABLE control_evaluation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_evaluation_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE governance_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_exceptions FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_authorization_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_authorization_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE program_publication_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_publication_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE site_space_capability_assertions ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_space_capability_assertions FORCE ROW LEVEL SECURITY;
ALTER TABLE site_space_capability_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_space_capability_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE blueprint_facility_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_facility_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE site_requirement_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_requirement_evaluations FORCE ROW LEVEL SECURITY;
ALTER TABLE content_publication_manifests ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_publication_manifests FORCE ROW LEVEL SECURITY;
ALTER TABLE content_publication_manifest_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_publication_manifest_items FORCE ROW LEVEL SECURITY;
ALTER TABLE content_manifest_review_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_manifest_review_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_question_options FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_question_branch_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_question_branch_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_version_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_version_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_campaigns FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_anonymous_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_anonymous_redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answers FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_answer_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_answer_choices FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_trigger_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_trigger_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE feedback_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_items FORCE ROW LEVEL SECURITY;
ALTER TABLE feedback_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_subjects FORCE ROW LEVEL SECURITY;
ALTER TABLE feedback_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_followups FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_events FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_escalations FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_findings FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_case_outcomes FORCE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_triage_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_triage_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.formative_practice_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.formative_practice_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_reports FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_identity_escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.safeguarding_identity_escrow FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.enrollment_prospect_contact_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.enrollment_prospect_contact_details FORCE ROW LEVEL SECURITY;
ALTER TABLE metric_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE metric_observations FORCE ROW LEVEL SECURITY;
ALTER TABLE quality_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_evaluations FORCE ROW LEVEL SECURITY;
ALTER TABLE quality_evaluation_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_evaluation_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE improvement_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE improvement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE improvement_action_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_action_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE improvement_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_verifications FORCE ROW LEVEL SECURITY;
ALTER TABLE quality_reassessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_reassessments FORCE ROW LEVEL SECURITY;
ALTER TABLE credential_issuance_support ENABLE ROW LEVEL SECURITY;
ALTER TABLE credential_issuance_support FORCE ROW LEVEL SECURITY;
ALTER TABLE application_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE application_principal_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_principal_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE application_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE applicant_offer_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE applicant_offer_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollment_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_prospects FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollment_prospect_interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollment_prospect_interests FORCE ROW LEVEL SECURITY;
ALTER TABLE prospect_learner_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospect_learner_conversions FORCE ROW LEVEL SECURITY;
ALTER TABLE site_publication_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_publication_bindings FORCE ROW LEVEL SECURITY;
ALTER TABLE blueprint_component_approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_component_approval_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE blueprint_execution_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE blueprint_execution_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA education_v30_secure FROM PUBLIC;


-- v2.6 privacy baseline: deny-by-default with FORCE RLS even for table owner.
-- SQL gives NO privileged access to an application user. Deploy purpose-, scope- and
-- action-specific policies separately after security review; do not use owner role in app.
ALTER TABLE education_service_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_benefit_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_compensation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_compensation_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_compensation_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_credit_awards FORCE ROW LEVEL SECURITY;
ALTER TABLE academic_framework_review_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_access_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_accommodation_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempt_items FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempt_results FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_item_scoring_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_item_secure_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_response_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_response_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_review_events FORCE ROW LEVEL SECURITY;
ALTER TABLE assessment_scoring_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE competency_determination_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE content_usage_events FORCE ROW LEVEL SECURITY;
ALTER TABLE content_usage_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE education_service_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE formative_practice_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_command_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_materials FORCE ROW LEVEL SECURITY;
ALTER TABLE track_lesson_presentations FORCE ROW LEVEL SECURITY;
ALTER TABLE published_asset_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_policy_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_policy_withdrawals FORCE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE instructional_track_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE instructional_tracks FORCE ROW LEVEL SECURITY;
ALTER TABLE content_withdrawals FORCE ROW LEVEL SECURITY;
ALTER TABLE foundation_release_review_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE funding_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE funding_awards FORCE ROW LEVEL SECURITY;
ALTER TABLE funding_claim_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE funding_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE graded_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE grading_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE grading_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE guardian_authorities FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_benefit_entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_competency_determinations FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_competency_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_course_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE track_distribution_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_data_disclosures FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_foundation_activity_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_foundation_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_outcomes FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_refresher_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_supplement_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_track_selections FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_unit_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE official_assessment_result_adoptions FORCE ROW LEVEL SECURITY;
ALTER TABLE official_course_grades FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_compensation_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_payables FORCE ROW LEVEL SECURITY;
ALTER TABLE person_access_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE persons FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_capability_authorizations FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_contributions FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_qualifications FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_role_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_screening_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_service_delivery_records FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_service_engagements FORCE ROW LEVEL SECURITY;
ALTER TABLE professional_service_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE qualified_creator_usage FORCE ROW LEVEL SECURITY;
ALTER TABLE readiness_evaluation_requirements FORCE ROW LEVEL SECURITY;
ALTER TABLE readiness_evaluations FORCE ROW LEVEL SECURITY;
ALTER TABLE readiness_requirement_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE transcript_issuances FORCE ROW LEVEL SECURITY;
ALTER TABLE workforce_compensation_agreements FORCE ROW LEVEL SECURITY;
ALTER TABLE workforce_compensation_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE workforce_earning_events FORCE ROW LEVEL SECURITY;

-- P0 foreign-key access paths: create a covering index for each currently uncovered
-- FK column prefix. Review duplicates/overlap with workload benchmarks before cutover.
DO $fk_indexes$
DECLARE fk record; columns_sql text; index_name text; covered boolean;
BEGIN
 FOR fk IN
  SELECT c.oid,c.conrelid,c.conkey
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
   WHERE n.nspname='education_v30' AND c.contype='f'
   ORDER BY c.conrelid,c.oid
 LOOP
   SELECT EXISTS (
      SELECT 1 FROM pg_index i
       WHERE i.indrelid=fk.conrelid AND i.indisvalid AND i.indpred IS NULL
         AND i.indnkeyatts>=cardinality(fk.conkey)
         AND (SELECT array_agg(i.indkey[x.i-1]::smallint ORDER BY x.i)
                FROM generate_series(1,cardinality(fk.conkey)) AS x(i))=fk.conkey
   ) INTO covered;
   IF covered THEN CONTINUE; END IF;
   SELECT string_agg(quote_ident(a.attname),', ' ORDER BY x.ordinality)
     INTO columns_sql
     FROM unnest(fk.conkey) WITH ORDINALITY AS x(attnum,ordinality)
     JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=x.attnum;
   index_name:=left('fk_'||replace(fk.conrelid::regclass::text,'education_v30.','')||'_'||fk.oid::text,63);
   EXECUTE format('CREATE INDEX %I ON %s (%s)',index_name,fk.conrelid::regclass,columns_sql);
 END LOOP;
END $fk_indexes$;


-- v2.8 business domains (integral to canonical replacement)
-- 16. National education initiatives and optional network coordination.
-- An initiative is a cross-site business program, NOT another course or school.
CREATE TABLE education_initiatives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sponsor_organization_id uuid NOT NULL REFERENCES organizations(id),
 network_id uuid REFERENCES education_networks(id), initiative_code text NOT NULL UNIQUE,
 name text NOT NULL, initiative_kind text NOT NULL CHECK(initiative_kind IN ('pilot','launch','expansion','sponsored_program','research','other')),
 status text NOT NULL DEFAULT 'planning' CHECK(status IN ('planning','authorized','active','paused','completed','cancelled')),
 starts_on date, ends_on date, objective text NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on)
);
CREATE TABLE initiative_partner_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), initiative_id uuid NOT NULL REFERENCES education_initiatives(id),
 organization_id uuid NOT NULL REFERENCES organizations(id), role_code text NOT NULL
 CHECK(role_code IN ('sponsor','national_coordinator','regional_coordinator','local_operator','host','academic_provider','fiscal_agent','device_provider','evaluator')),
 valid_from date NOT NULL, valid_through date,
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','suspended','ended')),
 CHECK(valid_through IS NULL OR valid_through>=valid_from), UNIQUE(initiative_id,organization_id,role_code,valid_from)
);
CREATE TABLE initiative_deployments (
 initiative_id uuid NOT NULL REFERENCES education_initiatives(id), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
 participating_organization_id uuid NOT NULL REFERENCES organizations(id),
 active_from timestamptz NOT NULL, active_through timestamptz,
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','paused','completed')),
 CHECK(active_through IS NULL OR active_through>active_from), PRIMARY KEY(initiative_id,deployment_id)
);
CREATE TABLE initiative_success_metrics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), initiative_id uuid NOT NULL REFERENCES education_initiatives(id),
 metric_code text NOT NULL, description text NOT NULL, unit_code text NOT NULL,
 target_value numeric(18,4), due_on date, evidence_rule text,
 UNIQUE(initiative_id,metric_code)
);
CREATE TABLE initiative_metric_definition_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 metric_id uuid NOT NULL REFERENCES initiative_success_metrics(id),
 version_no integer NOT NULL CHECK(version_no>0),
 counting_unit text NOT NULL CHECK(counting_unit IN
   ('unique_people','registrations','attendance_events','completions','verified_outcomes','other')),
 numerator_rule jsonb NOT NULL CHECK(jsonb_typeof(numerator_rule)='object'),
 denominator_rule jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(denominator_rule)='object'),
 deduplication_key text NOT NULL,
 source_query_identifier text NOT NULL,
 reporting_window_rule text NOT NULL,
 published_by_person_id uuid NOT NULL REFERENCES persons(id),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(metric_id,version_no), UNIQUE(id,metric_id)
);
CREATE TABLE initiative_impact_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), initiative_id uuid NOT NULL REFERENCES education_initiatives(id),
 as_of timestamptz NOT NULL, generated_by_person_id uuid NOT NULL REFERENCES persons(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id), cohort_size integer NOT NULL CHECK(cohort_size>=0),
 small_cell_suppressed boolean NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','withdrawn')),
 approved_by_person_id uuid REFERENCES persons(id),
 CHECK(cohort_size>=10 OR small_cell_suppressed),
 CHECK(status<>'approved' OR (approved_by_person_id IS NOT NULL AND approved_by_person_id<>generated_by_person_id)),
 UNIQUE(initiative_id,as_of)
);
CREATE TABLE initiative_metric_observations (
 snapshot_id uuid NOT NULL REFERENCES initiative_impact_snapshots(id), metric_id uuid NOT NULL REFERENCES initiative_success_metrics(id),
 definition_version_id uuid,
 calculation_method text NOT NULL DEFAULT 'derived'
  CHECK(calculation_method IN ('derived','verified_manual')),
 calculation_fingerprint text CHECK(calculation_fingerprint ~ '^[a-f0-9]{64}$'),
 calculated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 observed_value numeric(18,4), sample_size integer NOT NULL CHECK(sample_size>=0),
 source_evidence_id uuid REFERENCES evidence_document_versions(id),
 FOREIGN KEY(definition_version_id,metric_id) REFERENCES initiative_metric_definition_versions(id,metric_id),
 is_suppressed boolean NOT NULL, PRIMARY KEY(snapshot_id,metric_id),
 CHECK(sample_size>=10 OR (is_suppressed AND observed_value IS NULL)),
 CHECK(NOT is_suppressed OR observed_value IS NULL),
 CHECK(observed_value IS NULL OR (definition_version_id IS NOT NULL
    AND calculation_fingerprint IS NOT NULL AND source_evidence_id IS NOT NULL))
);
CREATE TABLE initiative_metric_observation_sources (
 snapshot_id uuid NOT NULL, metric_id uuid NOT NULL,
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 source_relation text NOT NULL,
 source_record_key text NOT NULL,
 source_fingerprint text NOT NULL CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 added_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(snapshot_id,metric_id) REFERENCES initiative_metric_observations(snapshot_id,metric_id),
 PRIMARY KEY(snapshot_id,metric_id,source_relation,source_record_key)
);
CREATE OR REPLACE FUNCTION v30_verify_impact_observation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE calculated integer;
BEGIN
 IF TG_OP='INSERT' AND NEW.status='approved' THEN
  RAISE EXCEPTION 'Create impact snapshot as draft; approve only after evidence has been recorded'; END IF;
 IF NEW.status='approved' THEN
  IF EXISTS(SELECT 1 FROM initiative_metric_observations o
   WHERE o.snapshot_id=NEW.id AND NOT o.is_suppressed
    AND (o.definition_version_id IS NULL OR o.calculation_fingerprint IS NULL
      OR o.source_evidence_id IS NULL
      OR NOT EXISTS(SELECT 1 FROM initiative_metric_observation_sources src
        WHERE src.snapshot_id=o.snapshot_id AND src.metric_id=o.metric_id))) THEN
     RAISE EXCEPTION 'Approved impact metrics require versioned calculations and traceable source inputs'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER initiative_snapshot_provenance_gate
 BEFORE INSERT OR UPDATE OF status ON initiative_impact_snapshots FOR EACH ROW
 EXECUTE FUNCTION v30_verify_impact_observation();
CREATE OR REPLACE FUNCTION v30_guard_impact_evidence_mutation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE sid uuid; mid uuid;
BEGIN
 sid:=CASE WHEN TG_OP='DELETE' THEN OLD.snapshot_id ELSE NEW.snapshot_id END;
 mid:=CASE WHEN TG_OP='DELETE' THEN OLD.metric_id ELSE NEW.metric_id END;
 IF EXISTS(SELECT 1 FROM initiative_impact_snapshots snap
  WHERE snap.id=sid AND snap.status='approved') THEN
    RAISE EXCEPTION 'Approved impact report evidence is immutable; create a new snapshot'; END IF;
 IF TG_TABLE_NAME='initiative_metric_observations' AND TG_OP='INSERT' THEN
  IF NOT EXISTS(SELECT 1 FROM initiative_impact_snapshots snap
    JOIN initiative_success_metrics metric ON metric.initiative_id=snap.initiative_id
    WHERE snap.id=sid AND metric.id=mid) THEN
     RAISE EXCEPTION 'Metric observation belongs to a different education initiative'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER initiative_metric_observation_guard
 BEFORE INSERT OR UPDATE OR DELETE ON initiative_metric_observations FOR EACH ROW
 EXECUTE FUNCTION v30_guard_impact_evidence_mutation();
CREATE TRIGGER initiative_metric_sources_guard
 BEFORE INSERT OR UPDATE OR DELETE ON initiative_metric_observation_sources FOR EACH ROW
 EXECUTE FUNCTION v30_guard_impact_evidence_mutation();
CREATE TABLE network_governance_delegations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), network_id uuid NOT NULL REFERENCES education_networks(id),
 delegator_organization_id uuid NOT NULL REFERENCES organizations(id), delegate_organization_id uuid NOT NULL REFERENCES organizations(id),
 authority_code text NOT NULL CHECK(authority_code IN ('coordinate','market','aggregate_reporting','operate','funding_applicant','fiscal_recipient')),
 geography_id uuid REFERENCES geographic_areas(id), valid_from timestamptz NOT NULL, valid_through timestamptz,
 agreement_evidence_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','ended')),
 CHECK(delegator_organization_id<>delegate_organization_id), CHECK(valid_through IS NULL OR valid_through>valid_from),
 UNIQUE(network_id,delegator_organization_id,delegate_organization_id,authority_code,valid_from)
);

-- 17. Noncredit participant registration and training completion: NO Section or school-of-record requirement.
CREATE TABLE noncredit_training_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), offering_version_id uuid NOT NULL UNIQUE REFERENCES offering_versions(id),
 provider_organization_id uuid NOT NULL REFERENCES organizations(id),
 title text NOT NULL, required_instruction_minutes integer NOT NULL CHECK(required_instruction_minutes>=0),
 published_at timestamptz, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published')),
 author_person_id uuid NOT NULL REFERENCES persons(id), approved_by_person_id uuid REFERENCES persons(id),
 assessment_version_id uuid REFERENCES assessment_versions(id),
 UNIQUE(id,offering_version_id),
 CHECK(state<>'published' OR (published_at IS NOT NULL AND approved_by_person_id IS NOT NULL AND approved_by_person_id<>author_person_id))
);
CREATE TABLE noncredit_registrations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
 training_version_id uuid NOT NULL REFERENCES noncredit_training_versions(id),
 adoption_id uuid NOT NULL, offering_version_id uuid NOT NULL,
 participant_person_id uuid NOT NULL REFERENCES persons(id),
 learner_id uuid REFERENCES learner_profiles(id), -- optional only when shared assessment engine is used
 initiative_id uuid REFERENCES education_initiatives(id),
 registering_organization_id uuid NOT NULL REFERENCES organizations(id),
 registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','active','completed','withdrawn','cancelled')),
 consent_evidence_id uuid REFERENCES evidence_document_versions(id),
 FOREIGN KEY(adoption_id,deployment_id,offering_version_id)
   REFERENCES deployment_offering_adoptions(id,deployment_id,offering_version_id),
 FOREIGN KEY(training_version_id,offering_version_id)
   REFERENCES noncredit_training_versions(id,offering_version_id),
 UNIQUE(deployment_id,training_version_id,participant_person_id),
 UNIQUE(id,participant_person_id), UNIQUE(id,deployment_id)
);
ALTER TABLE noncredit_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE noncredit_registrations FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_course_attempts
  ADD CONSTRAINT learner_attempt_noncredit_registration_fk
  FOREIGN KEY(noncredit_registration_id,deployment_id)
  REFERENCES noncredit_registrations(id,deployment_id);
CREATE OR REPLACE FUNCTION validate_course_attempt_source() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE participation_status text; training_state text;
BEGIN
 IF NEW.enrollment_id IS NOT NULL THEN
   SELECT status INTO participation_status FROM enrollments
   WHERE id=NEW.enrollment_id AND deployment_id=NEW.deployment_id;
   IF participation_status IS NULL OR participation_status NOT IN ('active','completed') THEN
     RAISE EXCEPTION 'Course attempt requires an active school enrollment';
   END IF;
 ELSE
   SELECT r.status,t.state INTO participation_status,training_state
   FROM noncredit_registrations r
   JOIN noncredit_training_versions t ON t.id=r.training_version_id
   WHERE r.id=NEW.noncredit_registration_id
     AND r.deployment_id=NEW.deployment_id
     AND r.adoption_id=NEW.adoption_id
     AND r.offering_version_id=NEW.offering_version_id
     AND EXISTS(SELECT 1 FROM offering_courses oc
       WHERE oc.offering_version_id=r.offering_version_id
         AND oc.course_version_id=NEW.course_version_id);
   IF participation_status IS NULL OR participation_status NOT IN ('registered','active')
      OR training_state IS DISTINCT FROM 'published' THEN
     RAISE EXCEPTION 'Course attempt requires an active registration in published noncredit training';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER learner_course_attempt_source_gate
 BEFORE INSERT OR UPDATE OF enrollment_id,noncredit_registration_id,deployment_id,adoption_id,
   offering_version_id,course_version_id,status
 ON learner_course_attempts
 FOR EACH ROW EXECUTE FUNCTION validate_course_attempt_source();
-- Idempotent assessment provisioning follows an approved registration and published
-- provider-owned training. It never creates School enrollment, grades or credits.
-- The published training approver is the accountable authorizing principal.
CREATE OR REPLACE FUNCTION v301_provision_noncredit_knowledge_access(p_attempt uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $v301_auto_assessment$
DECLARE rec record; administration_id uuid; administration_count integer; person_learner uuid;
BEGIN
 SELECT ca.id,ca.deployment_id,ca.course_version_id,ca.status,
        ca.offering_version_id,ca.adoption_id,
        r.id AS registration_id,r.participant_person_id,r.learner_id AS registration_learner_id,
        r.status AS registration_status,
        t.assessment_version_id,t.provider_organization_id,t.approved_by_person_id
 INTO rec
 FROM learner_course_attempts ca
 JOIN noncredit_registrations r
   ON r.id=ca.noncredit_registration_id
   AND r.deployment_id=ca.deployment_id
   AND r.adoption_id=ca.adoption_id
   AND r.offering_version_id=ca.offering_version_id
 JOIN noncredit_training_versions t
   ON t.id=r.training_version_id AND t.offering_version_id=ca.offering_version_id
 WHERE ca.id=p_attempt
   AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
   AND ca.status='active'
   AND r.status IN ('registered','active')
   AND t.state='published' AND t.assessment_version_id IS NOT NULL
   AND t.approved_by_person_id IS NOT NULL;

 IF NOT FOUND THEN RETURN; END IF;
 SELECT count(*),min(ad.id) INTO administration_count,administration_id
 FROM assessment_administrations ad
 JOIN assessment_versions version ON version.id=ad.assessment_version_id
 JOIN assessment_definitions definition ON definition.id=version.assessment_id
 JOIN assessment_form_versions form ON form.id=ad.form_version_id
 WHERE ad.assessment_version_id=rec.assessment_version_id
   AND ad.deployment_id=rec.deployment_id
   AND ad.course_version_id=rec.course_version_id
   AND ad.administering_organization_id=rec.provider_organization_id
   AND ad.status='open' AND ad.proctor_policy='none'
   AND version.lifecycle='published'
   AND form.lifecycle='published'
   AND definition.purpose IN ('formative','practice','readiness','mastery');
 IF administration_count<>1 THEN RETURN; END IF;

 INSERT INTO learner_profiles(person_id)
 VALUES(rec.participant_person_id)
 ON CONFLICT(person_id) DO NOTHING;
 SELECT id INTO person_learner FROM learner_profiles
 WHERE person_id=rec.participant_person_id;
 IF rec.registration_learner_id IS NOT NULL
    AND rec.registration_learner_id IS DISTINCT FROM person_learner THEN
   RAISE EXCEPTION 'Noncredit registration is assigned to another learner';
 END IF;
 UPDATE noncredit_registrations SET learner_id=person_learner
 WHERE id=rec.registration_id AND learner_id IS NULL;
 -- Never reopen a revoked grant; conflict means preserve its existing status.
 INSERT INTO assessment_access_grants
   (administration_id,learner_id,course_attempt_id,granted_by_person_id,access_status)
 VALUES(administration_id,person_learner,p_attempt,rec.approved_by_person_id,'approved')
 ON CONFLICT (administration_id,learner_id,course_attempt_id) DO NOTHING;
END $v301_auto_assessment$;

CREATE OR REPLACE FUNCTION v301_noncredit_attempt_access_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $v301_attempt_provision$
BEGIN
 IF NEW.noncredit_registration_id IS NOT NULL AND NEW.enrollment_id IS NULL
    AND NEW.status='active' THEN
   PERFORM v301_provision_noncredit_knowledge_access(NEW.id);
 END IF;
 RETURN NEW;
END $v301_attempt_provision$;
CREATE TRIGGER v301_noncredit_attempt_assessment_access
AFTER INSERT OR UPDATE OF noncredit_registration_id,status
ON learner_course_attempts
FOR EACH ROW EXECUTE FUNCTION v301_noncredit_attempt_access_trigger();

-- When the approved administration opens after the learner enrolled, fill
-- only course attempts for this exact deployment, course and version.
CREATE OR REPLACE FUNCTION v301_noncredit_admin_access_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $v301_admin_provision$
DECLARE attempt_row record;
BEGIN
 IF NEW.status='open' THEN
   FOR attempt_row IN
     SELECT ca.id
     FROM learner_course_attempts ca
     JOIN noncredit_registrations r ON r.id=ca.noncredit_registration_id
     JOIN noncredit_training_versions t ON t.id=r.training_version_id
     WHERE ca.enrollment_id IS NULL AND ca.section_id IS NULL
       AND ca.status='active' AND r.status IN ('registered','active')
       AND ca.deployment_id=NEW.deployment_id
       AND ca.course_version_id=NEW.course_version_id
       AND t.assessment_version_id=NEW.assessment_version_id
       AND t.provider_organization_id=NEW.administering_organization_id
   LOOP
     PERFORM v301_provision_noncredit_knowledge_access(attempt_row.id);
   END LOOP;
 END IF;
 RETURN NEW;
END $v301_admin_provision$;
CREATE TRIGGER v301_noncredit_admin_assessment_access
AFTER INSERT OR UPDATE OF status,assessment_version_id
ON assessment_administrations
FOR EACH ROW EXECUTE FUNCTION v301_noncredit_admin_access_trigger();
REVOKE ALL ON FUNCTION v301_provision_noncredit_knowledge_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_noncredit_attempt_access_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_noncredit_admin_access_trigger() FROM PUBLIC;

CREATE TABLE noncredit_participation_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL REFERENCES noncredit_registrations(id),
 event_kind text NOT NULL CHECK(event_kind IN ('lesson_completed','session_attended','skill_practiced','activity_completed','attendance_corrected')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 counted_minutes integer NOT NULL CHECK(counted_minutes>=0),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 recorded_by_person_id uuid NOT NULL REFERENCES persons(id),
 supersedes_id uuid UNIQUE REFERENCES noncredit_participation_events(id),
 CHECK(supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE noncredit_completion_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), training_version_id uuid NOT NULL REFERENCES noncredit_training_versions(id),
 policy_version integer NOT NULL CHECK(policy_version>0),
 min_participation_minutes integer NOT NULL CHECK(min_participation_minutes>=0),
 require_all_lessons boolean NOT NULL DEFAULT false,
 skills_assessment_required boolean NOT NULL DEFAULT false, minimum_assessment_fraction numeric(6,5) CHECK(minimum_assessment_fraction BETWEEN 0 AND 1),
 effective_at timestamptz NOT NULL, approved_by_person_id uuid NOT NULL REFERENCES persons(id),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(training_version_id,policy_version), UNIQUE(id,training_version_id),
 CHECK(NOT skills_assessment_required OR minimum_assessment_fraction IS NOT NULL)
);
CREATE TABLE noncredit_completion_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), registration_id uuid NOT NULL REFERENCES noncredit_registrations(id),
 policy_id uuid NOT NULL REFERENCES noncredit_completion_policies(id),
 assessment_result_id uuid REFERENCES assessment_attempt_results(id),
 outcome text NOT NULL CHECK(outcome IN ('completed','not_yet_completed','voided')),
 decided_by_person_id uuid NOT NULL REFERENCES persons(id), decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_version_id uuid REFERENCES evidence_document_versions(id), supersedes_id uuid UNIQUE REFERENCES noncredit_completion_decisions(id),
 CHECK(supersedes_id IS DISTINCT FROM id), UNIQUE(id,registration_id)
);
CREATE TABLE noncredit_completion_certificates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), decision_id uuid NOT NULL UNIQUE REFERENCES noncredit_completion_decisions(id),
 issuer_organization_id uuid NOT NULL REFERENCES organizations(id), issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 issued_by_person_id uuid NOT NULL REFERENCES persons(id), certificate_reference text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','revoked')),
 revocation_evidence_id uuid REFERENCES evidence_document_versions(id),
 CHECK(status<>'revoked' OR revocation_evidence_id IS NOT NULL)
);

CREATE VIEW learner_longitudinal_outcomes WITH (security_invoker=true) AS
 SELECT p.person_id, 'credit'::text AS pathway, e.deployment_id,
        o.occurred_on::timestamptz AS occurred_at, o.outcome_code,
        o.evidence_version_id, o.id AS academic_outcome_id,
        NULL::uuid AS noncredit_completion_decision_id
 FROM learner_outcomes o JOIN enrollments e ON e.id=o.enrollment_id
 JOIN learner_profiles p ON p.id=e.learner_id
 UNION ALL
 SELECT r.participant_person_id, 'noncredit'::text, r.deployment_id,
        d.decided_at, 'noncredit_completed'::text, d.evidence_version_id,
        NULL::uuid, d.id
 FROM noncredit_completion_decisions d
 JOIN noncredit_registrations r ON r.id=d.registration_id
 WHERE d.outcome='completed'
  AND NOT EXISTS(SELECT 1 FROM noncredit_completion_decisions later WHERE later.supersedes_id=d.id);
COMMENT ON VIEW learner_longitudinal_outcomes IS
 'Privacy-aware projection of distinct credit and noncredit outcomes; access remains governed by the source tables.';

-- 18. Technology access is NOT the same as owning or tracking a physical device.
CREATE TABLE technology_access_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), offering_version_id uuid REFERENCES offering_versions(id),
 deployment_id uuid REFERENCES program_deployments(id), training_version_id uuid REFERENCES noncredit_training_versions(id),
 requirement_code text NOT NULL, description text NOT NULL,
 device_category text CHECK(device_category IN ('laptop','desktop','tablet','smartphone','assistive','shared_lab','any')),
 min_memory_gb numeric(6,2) CHECK(min_memory_gb IS NULL OR min_memory_gb>=0),
 bandwidth_mbps numeric(9,2) CHECK(bandwidth_mbps IS NULL OR bandwidth_mbps>0),
 required boolean NOT NULL DEFAULT true, published_at timestamptz,
 CHECK(num_nonnulls(offering_version_id,deployment_id,training_version_id)=1)
);
CREATE TABLE participant_technology_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), participant_person_id uuid NOT NULL REFERENCES persons(id),
 noncredit_registration_id uuid, enrollment_id uuid REFERENCES enrollments(id),
 assessed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 assessment_mode text NOT NULL CHECK(assessment_mode IN ('self_reported','verified','assisted_interview')),
 reliable_internet boolean, shared_device_only boolean, needs_device boolean, needs_connectivity boolean,
 assistive_technology_needed boolean,
 assessor_person_id uuid REFERENCES persons(id),
 CHECK(num_nonnulls(noncredit_registration_id,enrollment_id)<=1),
 FOREIGN KEY(noncredit_registration_id,participant_person_id) REFERENCES noncredit_registrations(id,participant_person_id)
);
CREATE TABLE participant_technology_capabilities (
 assessment_id uuid NOT NULL REFERENCES participant_technology_assessments(id), category text NOT NULL
 CHECK(category IN ('laptop','desktop','tablet','smartphone','assistive','shared_lab','other')),
 access_level text NOT NULL CHECK(access_level IN ('personally_owned','shared','borrowed','none')),
 compatible boolean, PRIMARY KEY(assessment_id,category)
);
CREATE TABLE equipment_catalog (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manufacturer text, model text NOT NULL,
 category text NOT NULL CHECK(category IN ('laptop','desktop','tablet','hotspot','router','assistive','other')),
 specifications jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(specifications)='object')
);
CREATE TABLE equipment_acquisitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), acquiring_organization_id uuid NOT NULL REFERENCES organizations(id),
 donor_organization_id uuid REFERENCES organizations(id), invoice_evidence_id uuid REFERENCES evidence_document_versions(id),
 cost_id uuid UNIQUE REFERENCES eligible_operating_costs(id),
 method text NOT NULL CHECK(method IN ('purchase','donation','lease','transfer')),
 acquired_on date NOT NULL, currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
 total_cost_cents bigint NOT NULL DEFAULT 0 CHECK(total_cost_cents>=0)
);
CREATE TABLE equipment_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_code text NOT NULL,
 catalog_id uuid NOT NULL REFERENCES equipment_catalog(id),
 acquisition_id uuid REFERENCES equipment_acquisitions(id),
 inventory_organization_id uuid NOT NULL REFERENCES organizations(id),
 encrypted_serial bytea, -- NO personal BYOD identifiers. Encryption key managed outside DB.
 state text NOT NULL DEFAULT 'in_stock' CHECK(state IN ('in_stock','in_use','repair','lost','retired','disposed')),
 acquired_at timestamptz, disposed_at timestamptz,
 CHECK(disposed_at IS NULL OR state IN ('disposed','retired')),
 UNIQUE(inventory_organization_id,asset_code)
);
CREATE TABLE equipment_ownership_periods (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES equipment_assets(id),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 owned_from timestamptz NOT NULL, owned_through timestamptz,
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 CHECK(owned_through IS NULL OR owned_through>owned_from),
 EXCLUDE USING gist(asset_id WITH =,tstzrange(owned_from,owned_through,'[)') WITH &&)
);
CREATE TABLE equipment_custody_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES equipment_assets(id),
 from_organization_id uuid REFERENCES organizations(id), to_organization_id uuid REFERENCES organizations(id),
 from_site_id uuid REFERENCES sites(id), to_site_id uuid REFERENCES sites(id),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), actor_person_id uuid NOT NULL REFERENCES persons(id),
 document_version_id uuid REFERENCES evidence_document_versions(id),
 event_kind text NOT NULL CHECK(event_kind IN ('received','transferred','checked_out','returned','lost','disposed','corrected')),
 event_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE TABLE equipment_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES equipment_assets(id),
 participant_person_id uuid REFERENCES persons(id),
 site_id uuid REFERENCES sites(id), assigned_organization_id uuid REFERENCES organizations(id),
 assigned_from timestamptz NOT NULL, assigned_through timestamptz,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('reserved','active','completed','cancelled')),
 authorized_by_person_id uuid NOT NULL REFERENCES persons(id),
 CHECK(num_nonnulls(participant_person_id,site_id,assigned_organization_id)=1),
 CHECK(assigned_through IS NULL OR assigned_through>assigned_from),
 EXCLUDE USING gist(asset_id WITH =,tstzrange(assigned_from,assigned_through,'[)') WITH &&)
 WHERE (status IN ('reserved','active','completed'))
);
CREATE TABLE equipment_service_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), asset_id uuid NOT NULL REFERENCES equipment_assets(id),
 kind text NOT NULL CHECK(kind IN ('inspection','configuration','repair','replacement','loss_report','security_wipe','retirement')),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(), provider_organization_id uuid REFERENCES organizations(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id), cost_id uuid REFERENCES eligible_operating_costs(id)
);
CREATE TABLE connectivity_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_organization_id uuid NOT NULL REFERENCES organizations(id),
 responsible_organization_id uuid NOT NULL REFERENCES organizations(id),
 category text NOT NULL CHECK(category IN ('mobile_hotspot','home_broadband','facility_broadband','data_plan','other')),
 participant_person_id uuid REFERENCES persons(id), site_id uuid REFERENCES sites(id),
 from_at timestamptz NOT NULL, through_at timestamptz,
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','paused','ended')),
 agreement_evidence_id uuid REFERENCES evidence_document_versions(id),
 CHECK(num_nonnulls(participant_person_id,site_id)=1),
 CHECK(through_at IS NULL OR through_at>from_at)
);
CREATE TABLE technology_access_interventions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), assessment_id uuid NOT NULL REFERENCES participant_technology_assessments(id),
 responsible_organization_id uuid NOT NULL REFERENCES organizations(id),
 equipment_assignment_id uuid REFERENCES equipment_assignments(id), connectivity_service_id uuid REFERENCES connectivity_services(id),
 intervention_kind text NOT NULL CHECK(intervention_kind IN ('device_loan','device_gift','connectivity','training','shared_lab','accessibility','other')),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','delivered','verified','ended')),
 delivered_at timestamptz, verified_by_person_id uuid REFERENCES persons(id),
 CHECK(status<>'verified' OR (delivered_at IS NOT NULL AND verified_by_person_id IS NOT NULL))
);
CREATE TABLE technology_readiness_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
 site_id uuid REFERENCES sites(id), evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evaluator_person_id uuid NOT NULL REFERENCES persons(id),
 expected_participant_count integer NOT NULL CHECK(expected_participant_count>=0),
 suitable_equipment_count integer NOT NULL CHECK(suitable_equipment_count>=0),
 connectivity_sufficient boolean, outcome text NOT NULL
 CHECK(outcome IN ('ready','ready_with_support','needs_equipment','needs_connectivity','not_evaluated')),
 evidence_version_id uuid REFERENCES evidence_document_versions(id)
);

-- 19. Funding opportunities, applications, grant restrictions, reconciliations.
CREATE TABLE funding_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_program_id uuid NOT NULL REFERENCES funding_programs(id),
 funder_organization_id uuid REFERENCES organizations(id), opportunity_reference text NOT NULL,
 title text NOT NULL, opens_on date, deadline date, opportunity_status text NOT NULL DEFAULT 'researched'
 CHECK(opportunity_status IN ('researched','open','closed','cancelled','awarded')),
 source_evidence_id uuid REFERENCES evidence_document_versions(id),
 CHECK(deadline IS NULL OR opens_on IS NULL OR deadline>=opens_on),
 UNIQUE(funding_program_id,opportunity_reference)
);
CREATE TABLE funding_eligibility_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_opportunity_id uuid NOT NULL REFERENCES funding_opportunities(id),
 requirement_code text NOT NULL, scope_kind text NOT NULL
 CHECK(scope_kind IN ('provider','geography','program','population','site','cost','regulatory')),
 requirement_text text NOT NULL, verifying_authority_organization_id uuid REFERENCES organizations(id),
 source_evidence_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(funding_opportunity_id,requirement_code)
);
CREATE TABLE funding_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), funding_opportunity_id uuid NOT NULL REFERENCES funding_opportunities(id),
 applicant_organization_id uuid NOT NULL REFERENCES organizations(id), initiative_id uuid REFERENCES education_initiatives(id),
 reference text NOT NULL, status text NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','ready','submitted','awarded','declined','withdrawn')),
 requested_amount_cents bigint CHECK(requested_amount_cents IS NULL OR requested_amount_cents>=0),
 currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
 submitted_at timestamptz, award_id uuid UNIQUE REFERENCES funding_awards(id),
 CHECK(status NOT IN ('submitted','awarded') OR submitted_at IS NOT NULL),
 CHECK(status<>'awarded' OR award_id IS NOT NULL),
 UNIQUE(funding_opportunity_id,applicant_organization_id,reference)
);
CREATE TABLE funding_application_partners (
 application_id uuid NOT NULL REFERENCES funding_applications(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 responsibility_code text NOT NULL CHECK(responsibility_code IN ('lead_applicant','fiscal_agent','program_operator','site_host','delivery_provider','evaluator','equipment_provider')),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 PRIMARY KEY(application_id,organization_id,responsibility_code)
);
CREATE TABLE funding_eligibility_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), application_id uuid NOT NULL REFERENCES funding_applications(id),
 requirement_id uuid NOT NULL REFERENCES funding_eligibility_requirements(id),
 verdict text NOT NULL CHECK(verdict IN ('verified','ineligible','incomplete','requires_review')),
 evaluated_by_person_id uuid NOT NULL REFERENCES persons(id), evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE
);
CREATE TABLE funding_cost_categories (
 code text PRIMARY KEY, name text NOT NULL,
 cost_group text NOT NULL CHECK(cost_group IN ('direct_program','contractors','administration','indirect','equipment','facilities','personnel','connectivity','other'))
);
CREATE TABLE funding_award_budget_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), award_id uuid NOT NULL REFERENCES funding_awards(id),
 version_no integer NOT NULL CHECK(version_no>0), state text NOT NULL DEFAULT 'draft'
 CHECK(state IN ('draft','approved','retired')),
 approved_by_person_id uuid REFERENCES persons(id), approved_at timestamptz,
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(award_id,version_no), UNIQUE(id,award_id),
 CHECK(state<>'approved' OR (approved_by_person_id IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE funding_award_budget_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), budget_version_id uuid NOT NULL REFERENCES funding_award_budget_versions(id),
 category_code text NOT NULL REFERENCES funding_cost_categories(code),
 approved_max_cents bigint NOT NULL CHECK(approved_max_cents>=0),
 UNIQUE(budget_version_id,category_code), UNIQUE(id,category_code)
);
CREATE TABLE funding_award_spending_limits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), budget_version_id uuid NOT NULL REFERENCES funding_award_budget_versions(id),
 cost_group text NOT NULL CHECK(cost_group IN ('contractors','administration','indirect','equipment','facilities','personnel','connectivity','other')),
 denominator_basis text NOT NULL CHECK(denominator_basis IN ('total_award','approved_budget')),
 max_fraction numeric(8,6) NOT NULL CHECK(max_fraction BETWEEN 0 AND 1),
 rule_source_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 UNIQUE(budget_version_id,cost_group)
);
CREATE TABLE funding_award_eligible_deployments (
 award_id uuid NOT NULL REFERENCES funding_awards(id), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
 source_evidence_id uuid REFERENCES evidence_document_versions(id),
 PRIMARY KEY(award_id,deployment_id)
);
CREATE TABLE funding_cost_classifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id uuid NOT NULL UNIQUE REFERENCES fundable_sources(id),
 category_code text NOT NULL REFERENCES funding_cost_categories(code),
 deployment_id uuid REFERENCES program_deployments(id), incurred_on date NOT NULL,
 classified_by_person_id uuid NOT NULL REFERENCES persons(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(id,source_id,category_code)
);
CREATE TABLE funding_allocation_attributions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), allocation_id uuid NOT NULL UNIQUE REFERENCES funding_allocations(id),
 award_id uuid NOT NULL REFERENCES funding_awards(id),
 source_id uuid NOT NULL REFERENCES fundable_sources(id),
 cost_classification_id uuid NOT NULL REFERENCES funding_cost_classifications(id),
 category_code text NOT NULL REFERENCES funding_cost_categories(code),
 budget_line_id uuid NOT NULL REFERENCES funding_award_budget_lines(id),
 budget_version_id uuid NOT NULL REFERENCES funding_award_budget_versions(id),
 amount_cents bigint NOT NULL CHECK(amount_cents>0),
 verified_by_person_id uuid NOT NULL REFERENCES persons(id),
 FOREIGN KEY(cost_classification_id,source_id,category_code)
   REFERENCES funding_cost_classifications(id,source_id,category_code),
 FOREIGN KEY(budget_line_id,category_code) REFERENCES funding_award_budget_lines(id,category_code),
 FOREIGN KEY(budget_version_id,award_id) REFERENCES funding_award_budget_versions(id,award_id)
);
CREATE TABLE funding_disbursements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), award_id uuid NOT NULL REFERENCES funding_awards(id),
 receiver_organization_id uuid NOT NULL REFERENCES organizations(id),
 received_cents bigint NOT NULL CHECK(received_cents>0), received_on date NOT NULL,
 payment_reference text NOT NULL, bank_evidence_id uuid REFERENCES evidence_document_versions(id),
 reconciliation_status text NOT NULL DEFAULT 'unreconciled' CHECK(reconciliation_status IN ('unreconciled','matched','disputed','reversed')),
 UNIQUE(award_id,payment_reference)
);
CREATE TABLE funding_reporting_obligations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), award_id uuid NOT NULL REFERENCES funding_awards(id),
 report_code text NOT NULL, due_on date NOT NULL, required_evidence_kind text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','submitted','accepted','overdue','waived')),
 submitted_at timestamptz, accepted_at timestamptz, evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(award_id,report_code)
);

-- 20. Founding development economics are independent of grant service payments.
CREATE TABLE founding_development_commitments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES commercial_contracts(id),
 contributor_organization_id uuid NOT NULL REFERENCES organizations(id),
 recipient_organization_id uuid NOT NULL REFERENCES organizations(id),
 initiative_id uuid REFERENCES education_initiatives(id),
 calculation_kind text NOT NULL CHECK(calculation_kind IN ('fixed','verified_participation','negotiated_milestones')),
 unit_amount_cents bigint CHECK(unit_amount_cents IS NULL OR unit_amount_cents>=0),
 committed_cents bigint NOT NULL CHECK(committed_cents>=0),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','signed','active','fulfilled','terminated')),
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 CHECK(contributor_organization_id<>recipient_organization_id),
 CHECK(calculation_kind<>'verified_participation' OR unit_amount_cents IS NOT NULL)
);
CREATE TABLE founding_development_milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), commitment_id uuid NOT NULL REFERENCES founding_development_commitments(id),
 milestone_code text NOT NULL, deliverable text NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents>=0),
 due_on date, status text NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','delivered','accepted','disputed','waived')),
 acceptance_evidence_id uuid REFERENCES evidence_document_versions(id),
 accepted_by_person_id uuid REFERENCES persons(id),
 CHECK(status<>'accepted' OR (acceptance_evidence_id IS NOT NULL AND accepted_by_person_id IS NOT NULL)),
 UNIQUE(commitment_id,milestone_code)
);
CREATE TABLE partnership_economic_targets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES commercial_contracts(id),
 initiative_id uuid REFERENCES education_initiatives(id),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 target_share_fraction numeric(8,6) NOT NULL CHECK(target_share_fraction BETWEEN 0 AND 1),
 is_nonbinding boolean NOT NULL DEFAULT true,
 source_evidence_id uuid REFERENCES evidence_document_versions(id),
 CHECK(is_nonbinding) -- targets do not themselves create a grant receivable or compensation entitlement
);
CREATE TABLE funded_partner_service_terms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contract_id uuid NOT NULL REFERENCES commercial_contracts(id),
 funding_award_id uuid NOT NULL REFERENCES funding_awards(id),
 service_provider_organization_id uuid NOT NULL REFERENCES organizations(id),
 service_kind_code text NOT NULL, currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
 authorized_max_cents bigint NOT NULL CHECK(authorized_max_cents>=0),
 approved_budget_line_id uuid NOT NULL REFERENCES funding_award_budget_lines(id),
 authorizing_evidence_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','authorized','suspended','closed'))
);

-- 21. Governing integrity functions and time-sensitive invariants.
CREATE OR REPLACE FUNCTION v28_published_noncredit() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.state='published' THEN
  RAISE EXCEPTION 'Published noncredit curriculum must be versioned, not edited'; END IF;
 IF TG_OP='DELETE' AND OLD.state='published' THEN RAISE EXCEPTION 'Published noncredit curriculum is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER noncredit_version_frozen BEFORE UPDATE OR DELETE ON noncredit_training_versions
 FOR EACH ROW EXECUTE FUNCTION v28_published_noncredit();
CREATE TRIGGER noncredit_policy_append_only BEFORE UPDATE OR DELETE ON noncredit_completion_policies
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER noncredit_participation_append_only BEFORE UPDATE OR DELETE ON noncredit_participation_events
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER noncredit_decision_append_only BEFORE UPDATE OR DELETE ON noncredit_completion_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE OR REPLACE FUNCTION v28_register_noncredit() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE dep record; provider uuid; trained uuid;
BEGIN
 SELECT d.operation_id,d.offering_id,d.status INTO dep FROM program_deployments d WHERE d.id=NEW.deployment_id;
 SELECT ov.offering_id,t.provider_organization_id INTO trained,provider
 FROM noncredit_training_versions t JOIN offering_versions ov ON ov.id=t.offering_version_id
 WHERE t.id=NEW.training_version_id AND t.state='published';
 IF provider IS NULL OR trained IS DISTINCT FROM dep.offering_id OR dep.status NOT IN ('authorized','active') THEN
  RAISE EXCEPTION 'Noncredit registration requires an authorized compatible deployment and published Offering'; END IF;
 IF NEW.registering_organization_id<>provider AND NOT EXISTS(
   SELECT 1 FROM education_operation_organization_roles r
   WHERE r.operation_id=dep.operation_id AND r.organization_id=NEW.registering_organization_id
    AND r.role_code='operator' AND r.status='approved' AND r.valid_from<=NEW.registered_at
    AND (r.valid_through IS NULL OR r.valid_through>NEW.registered_at)) THEN
  RAISE EXCEPTION 'Noncredit registrar lacks operational authority'; END IF;
 IF NOT EXISTS(SELECT 1 FROM operational_authorization_decisions a
  WHERE a.stage_code='register_noncredit' AND a.decision='approved'
    AND (a.operation_id=dep.operation_id OR a.deployment_id=NEW.deployment_id)
    AND a.valid_from<=NEW.registered_at AND (a.valid_through IS NULL OR a.valid_through>NEW.registered_at)
    AND NOT EXISTS(SELECT 1 FROM operational_authorization_decisions later WHERE later.supersedes_id=a.id)) THEN
  RAISE EXCEPTION 'Noncredit registration requires current noncredit permission, not school-of-record authority'; END IF;
 IF NEW.learner_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM learner_profiles l WHERE l.id=NEW.learner_id AND l.person_id=NEW.participant_person_id) THEN
  RAISE EXCEPTION 'Global learner profile must belong to participant'; END IF;
 IF NEW.initiative_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM initiative_deployments i WHERE i.initiative_id=NEW.initiative_id AND i.deployment_id=NEW.deployment_id
     AND i.status='approved') THEN RAISE EXCEPTION 'Initiative is not authorized for this deployment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER register_noncredit_authority BEFORE INSERT ON noncredit_registrations
 FOR EACH ROW EXECUTE FUNCTION v28_register_noncredit();
CREATE OR REPLACE FUNCTION v28_validate_participation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.counted_minutes>0 AND NEW.evidence_version_id IS NULL THEN
  RAISE EXCEPTION 'Counted noncredit participation minutes require attributable evidence'; END IF;
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM noncredit_participation_events e WHERE e.id=NEW.supersedes_id AND e.registration_id=NEW.registration_id)
 THEN RAISE EXCEPTION 'Participation corrections must stay within the same registration'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER noncredit_participation_provenance BEFORE INSERT ON noncredit_participation_events
 FOR EACH ROW EXECUTE FUNCTION v28_validate_participation();
CREATE OR REPLACE FUNCTION v28_validate_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE row_registration record; pol record; minutes_seen bigint; q record;
BEGIN
 SELECT r.*,t.assessment_version_id AS training_assessment_id INTO row_registration
 FROM noncredit_registrations r JOIN noncredit_training_versions t ON t.id=r.training_version_id
 WHERE r.id=NEW.registration_id FOR SHARE OF r;
 SELECT * INTO pol FROM noncredit_completion_policies WHERE id=NEW.policy_id;
 IF pol.training_version_id IS DISTINCT FROM row_registration.training_version_id
  OR pol.effective_at>NEW.decided_at THEN RAISE EXCEPTION 'Incorrect noncredit completion policy'; END IF;
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM noncredit_completion_decisions d
  WHERE d.id=NEW.supersedes_id AND d.registration_id=NEW.registration_id
    AND NOT EXISTS(SELECT 1 FROM noncredit_completion_decisions nx WHERE nx.supersedes_id=d.id))
 THEN RAISE EXCEPTION 'Completion correction must supersede current decision for this registration'; END IF;
 IF NEW.outcome<>'completed' THEN RETURN NEW; END IF;
 -- Only independently verified current evidence contributes minutes.
 -- Self-marked lessons, unverified uploads and replaced events contribute zero.
 SELECT coalesce(sum(e.counted_minutes),0)::bigint INTO minutes_seen
 FROM noncredit_participation_events e
 JOIN evidence_document_versions v ON v.id=e.evidence_version_id
 WHERE e.registration_id=NEW.registration_id
   AND e.event_kind<>'attendance_corrected' AND e.counted_minutes>0
   AND e.occurred_at<=NEW.decided_at
   AND v.verified_at IS NOT NULL AND v.verified_by_person_id IS NOT NULL
   AND v.verified_at<=NEW.decided_at
   AND (v.valid_from IS NULL OR v.valid_from<=NEW.decided_at::date)
   AND (v.valid_through IS NULL OR v.valid_through>=NEW.decided_at::date)
   AND NOT EXISTS (
     SELECT 1 FROM noncredit_participation_events newer WHERE newer.supersedes_id=e.id
   );
 IF minutes_seen<pol.min_participation_minutes THEN RAISE EXCEPTION 'Noncredit participation below completion threshold'; END IF;
 -- Configurable learner-marked lessons are separate from evidenced minutes.
 -- An entire matching Course attempt must contain all published lessons.
 IF pol.require_all_lessons AND NOT EXISTS (
   SELECT 1 FROM learner_course_attempts ca
   JOIN course_lessons l ON l.course_version_id=ca.course_version_id
   LEFT JOIN learner_lesson_progress lp
     ON lp.course_attempt_id=ca.id AND lp.lesson_id=l.id AND lp.status='completed'
   WHERE ca.noncredit_registration_id=NEW.registration_id
     AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
     AND ca.status IN ('active','completed')
     AND ca.offering_version_id=row_registration.offering_version_id
   GROUP BY ca.id
   HAVING count(l.id)>0 AND count(lp.lesson_id)=count(l.id)
 ) THEN RAISE EXCEPTION 'Required noncredit lessons are incomplete'; END IF;
 IF pol.skills_assessment_required THEN
  SELECT a.learner_id,admin.assessment_version_id,result.result_status,
    result.points_earned,result.points_possible INTO q
  FROM assessment_attempt_results result
  JOIN assessment_attempts a ON a.id=result.attempt_id
  JOIN assessment_access_grants grant_row ON grant_row.id=a.access_grant_id
    AND grant_row.administration_id=a.administration_id
    AND grant_row.learner_id=a.learner_id
    AND grant_row.access_status='approved'
  JOIN learner_course_attempts ca ON ca.id=grant_row.course_attempt_id
    AND ca.noncredit_registration_id=NEW.registration_id
    AND ca.enrollment_id IS NULL AND ca.section_id IS NULL
  JOIN assessment_administrations admin ON admin.id=a.administration_id
    AND admin.deployment_id=ca.deployment_id
    AND admin.course_version_id=ca.course_version_id
  WHERE result.id=NEW.assessment_result_id AND a.state='finalized'
    AND NOT EXISTS (
      SELECT 1 FROM assessment_attempt_results newer WHERE newer.supersedes_id=result.id
    );
  IF q.learner_id IS DISTINCT FROM row_registration.learner_id
    OR q.assessment_version_id IS DISTINCT FROM row_registration.training_assessment_id
    OR q.result_status<>'finalized'
    OR q.points_possible IS NULL OR q.points_possible<=0
    OR q.points_earned/q.points_possible<pol.minimum_assessment_fraction THEN
    RAISE EXCEPTION 'Noncredit completion requires a current finalized course-bound assessment'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER noncredit_completion_authority BEFORE INSERT ON noncredit_completion_decisions
 FOR EACH ROW EXECUTE FUNCTION v28_validate_completion();
CREATE OR REPLACE FUNCTION v28_validate_completion_certificate() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE cert record;
BEGIN
 SELECT d.outcome,d.registration_id,r.training_version_id,t.provider_organization_id,
   r.registering_organization_id INTO cert
 FROM noncredit_completion_decisions d JOIN noncredit_registrations r ON r.id=d.registration_id
 JOIN noncredit_training_versions t ON t.id=r.training_version_id WHERE d.id=NEW.decision_id;
 IF cert.outcome IS DISTINCT FROM 'completed' OR NEW.issuer_organization_id<>cert.provider_organization_id
  OR EXISTS(SELECT 1 FROM noncredit_completion_decisions newer WHERE newer.supersedes_id=NEW.decision_id) THEN
  RAISE EXCEPTION 'Noncredit acknowledgement requires latest completed decision and provider issuer'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER noncredit_certificate_authorized BEFORE INSERT ON noncredit_completion_certificates
 FOR EACH ROW EXECUTE FUNCTION v28_validate_completion_certificate();

CREATE OR REPLACE FUNCTION v28_guard_equipment_assignment() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE state_now text;
BEGIN
 SELECT state INTO state_now FROM equipment_assets WHERE id=NEW.asset_id FOR UPDATE;
 IF state_now IN ('lost','retired','disposed') THEN RAISE EXCEPTION 'Unavailable equipment cannot be assigned'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER equipment_assignable BEFORE INSERT OR UPDATE OF asset_id,status,assigned_from,assigned_through
 ON equipment_assignments FOR EACH ROW EXECUTE FUNCTION v28_guard_equipment_assignment();
CREATE TRIGGER equipment_custody_append_only BEFORE UPDATE OR DELETE ON equipment_custody_events
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER funding_evaluation_append_only BEFORE UPDATE OR DELETE ON funding_eligibility_evaluations
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER funding_attribution_append_only BEFORE UPDATE OR DELETE ON funding_allocation_attributions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();

-- Grant rules are award-specific. An illustrative '25%' is never a universal CAN rate.
CREATE OR REPLACE FUNCTION v28_enforce_funding_attribution() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; award_row record; classification record; budget record; line record;
  group_name text; group_limit record; used_cents bigint; group_cents bigint; denominator bigint;
BEGIN
 SELECT * INTO award_row FROM funding_awards WHERE id=NEW.award_id FOR UPDATE;
 SELECT * INTO a FROM funding_allocations WHERE id=NEW.allocation_id FOR SHARE;
 SELECT * INTO classification FROM funding_cost_classifications WHERE id=NEW.cost_classification_id;
 SELECT * INTO budget FROM funding_award_budget_versions WHERE id=NEW.budget_version_id;
 SELECT * INTO line FROM funding_award_budget_lines WHERE id=NEW.budget_line_id;
 IF a.status<>'approved' OR a.award_id IS DISTINCT FROM NEW.award_id
  OR a.source_id<>NEW.source_id OR a.amount_cents<>NEW.amount_cents OR award_row.status<>'awarded'
  OR budget.state<>'approved' OR budget.award_id<>NEW.award_id
  OR line.budget_version_id<>budget.id OR line.category_code<>NEW.category_code
  OR classification.source_id<>NEW.source_id OR classification.category_code<>NEW.category_code THEN
  RAISE EXCEPTION 'Funding attribution does not match the approved allocation, budget and categorized source'; END IF;
 IF classification.incurred_on<award_row.available_from OR
  (award_row.available_through IS NOT NULL AND classification.incurred_on>award_row.available_through) THEN
  RAISE EXCEPTION 'Expense outside funding award service window'; END IF;
 IF classification.deployment_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM funding_award_eligible_deployments WHERE award_id=NEW.award_id
    AND deployment_id=classification.deployment_id) THEN
  RAISE EXCEPTION 'Expense not within the funded deployment geography/program scope'; END IF;
 SELECT coalesce(sum(x.amount_cents),0) INTO used_cents FROM funding_allocation_attributions x
  WHERE x.award_id=NEW.award_id;
 IF used_cents+NEW.amount_cents>award_row.awarded_cents THEN
  RAISE EXCEPTION 'Funding award allocation ceiling exceeded'; END IF;
 SELECT coalesce(sum(x.amount_cents),0) INTO used_cents FROM funding_allocation_attributions x
  WHERE x.budget_line_id=NEW.budget_line_id;
 IF used_cents+NEW.amount_cents>line.approved_max_cents THEN
  RAISE EXCEPTION 'Funding budget category ceiling exceeded'; END IF;
 SELECT cost_group INTO group_name FROM funding_cost_categories WHERE code=NEW.category_code;
 SELECT * INTO group_limit FROM funding_award_spending_limits
  WHERE budget_version_id=budget.id AND cost_group=group_name;
 IF FOUND THEN
  IF group_limit.denominator_basis='total_award' THEN denominator:=award_row.awarded_cents;
  ELSE SELECT coalesce(sum(approved_max_cents),0) INTO denominator
    FROM funding_award_budget_lines WHERE budget_version_id=budget.id; END IF;
  SELECT coalesce(sum(x.amount_cents),0) INTO group_cents
  FROM funding_allocation_attributions x JOIN funding_cost_categories c ON c.code=x.category_code
  WHERE x.budget_version_id=budget.id AND c.cost_group=group_name;
  IF group_cents+NEW.amount_cents>floor(denominator*group_limit.max_fraction) THEN
    RAISE EXCEPTION 'Aggregate restricted cost cap exceeded for group %',group_name; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER funding_attribution_ceiling BEFORE INSERT ON funding_allocation_attributions
 FOR EACH ROW EXECUTE FUNCTION v28_enforce_funding_attribution();
CREATE OR REPLACE FUNCTION v28_protect_budget_after_use() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Funding controls are historical; publish a new budget version'; END IF;
 IF TG_TABLE_NAME='funding_award_budget_versions' THEN
  IF OLD.state='approved' THEN RAISE EXCEPTION 'Approved funding budget is immutable'; END IF;
 ELSIF TG_TABLE_NAME='funding_award_budget_lines' THEN
  IF EXISTS(SELECT 1 FROM funding_award_budget_versions b
    WHERE b.id=OLD.budget_version_id AND b.state='approved') THEN
   RAISE EXCEPTION 'Approved funding budget line is immutable'; END IF;
 ELSIF TG_TABLE_NAME='funding_award_spending_limits' THEN
  IF EXISTS(SELECT 1 FROM funding_award_budget_versions b
    WHERE b.id=OLD.budget_version_id AND b.state='approved') THEN
   RAISE EXCEPTION 'Approved funding spending cap is immutable'; END IF;
 ELSE RAISE EXCEPTION 'Unsupported funding control table: %',TG_TABLE_NAME;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER funding_budget_protected BEFORE UPDATE OR DELETE ON funding_award_budget_versions
 FOR EACH ROW EXECUTE FUNCTION v28_protect_budget_after_use();
CREATE TRIGGER funding_line_protected BEFORE UPDATE OR DELETE ON funding_award_budget_lines
 FOR EACH ROW EXECUTE FUNCTION v28_protect_budget_after_use();
CREATE TRIGGER funding_cap_protected BEFORE UPDATE OR DELETE ON funding_award_spending_limits
 FOR EACH ROW EXECUTE FUNCTION v28_protect_budget_after_use();

-- Additional v2.7 security correctness corrections included in replacement target.
CREATE OR REPLACE FUNCTION v28_deny_redacted_choices() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM survey_answers a JOIN survey_questions q ON q.id=a.question_id
  WHERE a.id=NEW.answer_id AND (a.sensitive_redacted OR q.safety_triage)) THEN
  RAISE EXCEPTION 'Safeguarding survey answers cannot leak through selected choices'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_redacted_choices BEFORE INSERT OR UPDATE ON survey_answer_choices
 FOR EACH ROW EXECUTE FUNCTION v28_deny_redacted_choices();
CREATE OR REPLACE FUNCTION v28_guard_anonymous_feedback() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.privacy_mode='anonymous' AND NEW.survey_response_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM survey_responses sr WHERE sr.id=NEW.survey_response_id AND sr.respondent_mode='anonymous') THEN
  RAISE EXCEPTION 'Anonymous feedback must not link to an identified/confidential respondent'; END IF;
 IF TG_OP='UPDATE' AND ROW(OLD.privacy_mode,OLD.submitted_by_person_id,OLD.survey_response_id)
  IS DISTINCT FROM ROW(NEW.privacy_mode,NEW.submitted_by_person_id,NEW.survey_response_id) THEN
  RAISE EXCEPTION 'Feedback identity/privacy mode is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER feedback_anonymity_guard BEFORE INSERT OR UPDATE ON feedback_items
 FOR EACH ROW EXECUTE FUNCTION v28_guard_anonymous_feedback();
CREATE OR REPLACE FUNCTION v28_triage_feedback_reclassified() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.category_code='safety' AND (TG_OP='INSERT' OR OLD.category_code IS DISTINCT FROM NEW.category_code) THEN
   INSERT INTO safeguarding_triage_queue(feedback_id,priority) VALUES(NEW.id,
   CASE WHEN NEW.priority='urgent' THEN 'critical' ELSE 'urgent' END)
   ON CONFLICT (feedback_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER safety_reclassification_triage AFTER UPDATE OF category_code ON feedback_items
 FOR EACH ROW EXECUTE FUNCTION v28_triage_feedback_reclassified();

-- A confidential survey respondent is not anonymous. Access requires restricted service policies.
-- For anonymous responses, prevent exact time correlation with one-time redemption.
CREATE OR REPLACE FUNCTION v28_blur_anonymous_redemption_time() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 NEW.redeemed_at:=date_trunc('day',clock_timestamp()); RETURN NEW;
END $$;
CREATE TRIGGER anonymous_redemption_time_blur BEFORE INSERT ON survey_anonymous_redemptions
 FOR EACH ROW EXECUTE FUNCTION v28_blur_anonymous_redemption_time();

-- Existing sensitive tables missed in previous RLS inventory.
ALTER TABLE learner_lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_lesson_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_activity_events FORCE ROW LEVEL SECURITY;
ALTER TABLE learner_participation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE learner_participation_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE program_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE network_aggregate_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE network_aggregate_reports FORCE ROW LEVEL SECURITY;

-- Noncredit, device and funding records default-deny for nonowners, including owners without BYPASSRLS.
DO $v28_rls$
DECLARE entity text;
BEGIN
 FOREACH entity IN ARRAY ARRAY[
 'education_initiatives','initiative_partner_roles','initiative_deployments','initiative_impact_snapshots',
 'initiative_metric_observations','network_governance_delegations',
 'noncredit_registrations','noncredit_participation_events','noncredit_completion_decisions','noncredit_completion_certificates',
 'participant_technology_assessments','participant_technology_capabilities',
 'equipment_acquisitions','equipment_assets','equipment_ownership_periods','equipment_custody_events',
 'equipment_assignments','equipment_service_events','connectivity_services','technology_access_interventions',
 'technology_readiness_evaluations','funding_applications','funding_application_partners','funding_eligibility_evaluations',
 'funding_award_budget_versions','funding_award_budget_lines','funding_award_spending_limits',
 'funding_award_eligible_deployments','funding_cost_classifications','funding_allocation_attributions',
 'funding_disbursements','funding_reporting_obligations','founding_development_commitments',
 'founding_development_milestones','partnership_economic_targets','funded_partner_service_terms'
 ] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',entity);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',entity);
 END LOOP;
END $v28_rls$;

-- Re-index AFTER defining v2.8 FKs (earlier v2.7 pass occurred before these tables).
DO $v28_fk_indexes$
DECLARE fk record; columns_sql text; index_name text; covered boolean;
BEGIN
 FOR fk IN SELECT c.oid,c.conrelid,c.conkey FROM pg_constraint c
   JOIN pg_namespace n ON n.oid=c.connamespace
   WHERE n.nspname='education_v30' AND c.contype='f'
 LOOP
  SELECT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=fk.conrelid AND i.indisvalid
    AND i.indpred IS NULL AND i.indnkeyatts>=cardinality(fk.conkey)
    AND (SELECT array_agg(i.indkey[x.i-1]::smallint ORDER BY x.i)
      FROM generate_series(1,cardinality(fk.conkey)) x(i))=fk.conkey)
  INTO covered;
  IF covered THEN CONTINUE; END IF;
  SELECT string_agg(quote_ident(a.attname),', ' ORDER BY x.ordinality) INTO columns_sql
  FROM unnest(fk.conkey) WITH ORDINALITY x(attnum,ordinality)
  JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=x.attnum;
  index_name:=left('fk_'||replace(fk.conrelid::regclass::text,'education_v30.','')||'_'||fk.oid::text,63);
  EXECUTE format('CREATE INDEX %I ON %s (%s)',index_name,fk.conrelid::regclass,columns_sql);
 END LOOP;
END $v28_fk_indexes$;

-- Restricted service admission and RLS policies must be provisioned by trusted app role bootstrap.
-- No network membership grants student or safeguarding access automatically.



-- 22. Reconcile prior independent reviews. These are canonical rules, not compatibility shims.

-- Survey safety intake operates under a dedicated trusted schema owner; role policies must
-- allow the definer read-only verification without exposing restricted details to app roles.
REVOKE ALL ON FUNCTION v27_require_secure_safety_intake() FROM PUBLIC;
-- Functions executing with security definer need readable rows under FORCE RLS. Scope
-- the allow policies to the *trusted schema-owner role only*, not arbitrary app users.
DO $owner_policy$
DECLARE owner_role text := current_user;
BEGIN
 EXECUTE format('CREATE POLICY v28_secure_intake_owner_read ON education_v30_secure.safeguarding_reports FOR SELECT TO %I USING (true)',owner_role);
 EXECUTE format('CREATE POLICY v28_survey_question_owner_read ON education_v30.survey_questions FOR SELECT TO %I USING (true)',owner_role);
END $owner_policy$;
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions FORCE ROW LEVEL SECURITY;

-- For confidential mode, identity is escrowed in the restricted schema, not in the
-- ordinary survey response. No IP, browser fingerprint, or precise redemption timestamp.
CREATE TABLE education_v30_secure.survey_confidential_identity_escrow (
 redemption_id uuid PRIMARY KEY REFERENCES survey_confidential_redemptions(id),
 invitation_id uuid NOT NULL UNIQUE REFERENCES survey_invitations(id),
 source_evidence_id uuid REFERENCES evidence_document_versions(id)
);
ALTER TABLE education_v30_secure.survey_confidential_identity_escrow ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30_secure.survey_confidential_identity_escrow FORCE ROW LEVEL SECURITY;
ALTER TABLE survey_confidential_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_confidential_redemptions FORCE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION v28_guard_confidential_response() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.respondent_mode='confidential' AND NEW.confidential_redemption_id IS NULL THEN
  RAISE EXCEPTION 'Confidential survey requires a separate restricted token, not an identified invitation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER confidential_response_isolation BEFORE INSERT ON survey_responses
 FOR EACH ROW EXECUTE FUNCTION v28_guard_confidential_response();

-- Explicit withdrawal record rather than changing published immutable definitions.
CREATE TABLE versioned_standard_withdrawals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 survey_version_id uuid REFERENCES survey_versions(id),
 governance_policy_version_id uuid REFERENCES governance_policy_versions(id),
 experience_standard_version_id uuid REFERENCES experience_standard_versions(id),
 assurance_control_version_id uuid REFERENCES assurance_control_versions(id),
 effective_at timestamptz NOT NULL, reason_code text NOT NULL,
 decided_by_person_id uuid NOT NULL REFERENCES persons(id), evidence_version_id uuid REFERENCES evidence_document_versions(id),
 CHECK(num_nonnulls(survey_version_id,governance_policy_version_id,experience_standard_version_id,assurance_control_version_id)=1)
);
CREATE TRIGGER standard_withdrawals_append_only BEFORE UPDATE OR DELETE ON versioned_standard_withdrawals
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();

-- An approved Blueprint execution depends on the decisions that existed at approval time.
-- Reversals after authorization must suspend use until a new batch is independently approved.
CREATE OR REPLACE FUNCTION v28_suspend_reversed_blueprint_batch() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.decision IN ('denied','withdrawn') THEN
  UPDATE blueprint_execution_batches SET execution_status='suspended'
  WHERE configuration_version_id=NEW.configuration_version_id
   AND execution_status='authorized';
 END IF;
 RETURN NEW;
END $$;
-- Advisory: execution batches already completed are historical; do not erase their outputs.
CREATE TRIGGER blueprint_decision_reversal AFTER INSERT ON blueprint_component_approval_decisions
 FOR EACH ROW EXECUTE FUNCTION v28_suspend_reversed_blueprint_batch();

-- The catalog of site/curriculum requirements can evolve; published versions cannot.
COMMENT ON TABLE equipment_assets IS 'Serialized equipment owned or controlled by an organization, never an unconsented personal BYOD device.';
COMMENT ON TABLE participant_technology_assessments IS 'Technology access needs: never requires personal device serial number, fingerprint or full browsing history.';
COMMENT ON TABLE noncredit_completion_certificates IS 'Private provider acknowledgement of noncredit learning; not a diploma, credit award or third-party credential.';
COMMENT ON TABLE founding_development_commitments IS 'Development capitalization is independent of restricted grant service compensation.';
COMMENT ON TABLE funding_award_spending_limits IS 'Actual grant-specific contractor/admin/indirect cap, never a universal allocation percentage.';
COMMENT ON TABLE education_initiatives IS 'Cross-organization activity with measurable outcomes; optional networks and noncredit programs.';


-- v2.8 enforcement addendum, folded into the canonical replacement script.
-- An approved grant allocation must be categorized and scoped in the SAME transaction.
CREATE OR REPLACE FUNCTION v28_require_approved_grant_attribution() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE grant_kind text;
BEGIN
 IF NEW.status<>'approved' OR NEW.award_id IS NULL THEN RETURN NULL; END IF;
 SELECT p.funding_kind_code INTO grant_kind
 FROM funding_awards a JOIN funding_programs p ON p.id=a.funding_program_id
 WHERE a.id=NEW.award_id;
 IF grant_kind='grant' AND NOT EXISTS (
  SELECT 1 FROM funding_allocation_attributions x
  WHERE x.allocation_id=NEW.id AND x.award_id=NEW.award_id
   AND x.source_id=NEW.source_id AND x.amount_cents=NEW.amount_cents) THEN
  RAISE EXCEPTION 'Approved grant allocation must have eligible scoped, categorized attribution'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER approved_grant_attribution_required
 AFTER INSERT OR UPDATE OF status,award_id,source_id,amount_cents ON funding_allocations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v28_require_approved_grant_attribution();

-- Once published, no new cost categories or limits may be attached to an approved budget.
CREATE OR REPLACE FUNCTION v28_restrict_approved_budget_insert() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM funding_award_budget_versions b
   WHERE b.id=NEW.budget_version_id AND b.state='approved') THEN
  RAISE EXCEPTION 'Cannot alter approved budget by inserting a new line or spending rule'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER approved_budget_lines_frozen BEFORE INSERT ON funding_award_budget_lines
 FOR EACH ROW EXECUTE FUNCTION v28_restrict_approved_budget_insert();
CREATE TRIGGER approved_budget_limits_frozen BEFORE INSERT ON funding_award_spending_limits
 FOR EACH ROW EXECUTE FUNCTION v28_restrict_approved_budget_insert();

-- If any geography/deployment scopes are defined for an award, an expense must
-- be attributed to one of them. No generic unrestricted fallback.
CREATE OR REPLACE FUNCTION v28_validate_funded_deployment_scope() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE dep uuid;
BEGIN
 SELECT deployment_id INTO dep FROM funding_cost_classifications WHERE id=NEW.cost_classification_id;
 IF EXISTS(SELECT 1 FROM funding_award_eligible_deployments WHERE award_id=NEW.award_id) THEN
  IF dep IS NULL OR NOT EXISTS(SELECT 1 FROM funding_award_eligible_deployments
    WHERE award_id=NEW.award_id AND deployment_id=dep) THEN
    RAISE EXCEPTION 'Award has restricted deployments; cost must identify an approved deployment'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_funded_deployment_scope BEFORE INSERT ON funding_allocation_attributions
 FOR EACH ROW EXECUTE FUNCTION v28_validate_funded_deployment_scope();

CREATE OR REPLACE FUNCTION v28_check_device_acquisition_cost() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE actual_org uuid; actual_cost bigint; cost_date date;
BEGIN
 IF NEW.cost_id IS NULL THEN RETURN NEW; END IF;
 SELECT paying_organization_id,amount_cents,incurred_on INTO actual_org,actual_cost,cost_date
 FROM eligible_operating_costs WHERE id=NEW.cost_id;
 IF actual_org IS DISTINCT FROM NEW.acquiring_organization_id
   OR actual_cost IS DISTINCT FROM NEW.total_cost_cents
   OR cost_date IS DISTINCT FROM NEW.acquired_on THEN
  RAISE EXCEPTION 'Equipment acquisition must match its accountable expense, amount and date'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER equipment_purchase_accountability BEFORE INSERT OR UPDATE OF cost_id,total_cost_cents,acquired_on
 ON equipment_acquisitions FOR EACH ROW EXECUTE FUNCTION v28_check_device_acquisition_cost();

-- Device needs and participant identity must align even when an academic enrollment is referenced.
CREATE OR REPLACE FUNCTION v28_check_technology_assessment_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.enrollment_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM enrollments e JOIN learner_profiles l ON l.id=e.learner_id
  WHERE e.id=NEW.enrollment_id AND l.person_id=NEW.participant_person_id) THEN
   RAISE EXCEPTION 'Technology assessment enrollment does not belong to participant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER technology_assessment_identity_guard BEFORE INSERT ON participant_technology_assessments
 FOR EACH ROW EXECUTE FUNCTION v28_check_technology_assessment_identity();

-- Governance delegation never implicitly grants student or safeguard access.
CREATE OR REPLACE FUNCTION v28_check_network_delegation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.status='active' AND NOT EXISTS(
   SELECT 1 FROM education_networks n
   WHERE n.id=NEW.network_id AND n.steward_organization_id=NEW.delegator_organization_id
   UNION ALL
   SELECT 1 FROM network_memberships m
   WHERE m.network_id=NEW.network_id AND m.organization_id=NEW.delegator_organization_id
     AND m.status='active' AND m.valid_from<=NEW.valid_from::date
     AND (m.valid_through IS NULL OR m.valid_through>=NEW.valid_from::date)) THEN
  RAISE EXCEPTION 'Network delegator must hold network governance/active membership'; END IF;
 IF NEW.status='active' AND NOT EXISTS(SELECT 1 FROM network_memberships m
  WHERE m.network_id=NEW.network_id AND m.organization_id=NEW.delegate_organization_id
    AND m.status='active' AND m.valid_from<=NEW.valid_from::date
    AND (m.valid_through IS NULL OR m.valid_through>=NEW.valid_from::date)) THEN
  RAISE EXCEPTION 'Network delegation requires participating delegate'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER network_delegation_scope BEFORE INSERT OR UPDATE OF status,valid_from,valid_through
 ON network_governance_delegations FOR EACH ROW EXECUTE FUNCTION v28_check_network_delegation();

-- Operational readiness for programs involving minors, independent of school-of-record.
CREATE TABLE deployment_operating_contexts (
 deployment_id uuid PRIMARY KEY REFERENCES program_deployments(id),
 participant_population text NOT NULL CHECK(participant_population IN ('adults','minors','mixed','unknown')),
 delivery_context text NOT NULL CHECK(delivery_context IN ('remote','onsite','hybrid')),
 safeguarding_required boolean NOT NULL,
 approved_by_organization_id uuid NOT NULL REFERENCES organizations(id),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(participant_population NOT IN ('minors','mixed') OR safeguarding_required)
);
CREATE TABLE deployment_readiness_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), deployment_id uuid NOT NULL REFERENCES program_deployments(id),
 review_kind text NOT NULL CHECK(review_kind IN ('registration','delivery','operating')),
 outcome text NOT NULL CHECK(outcome IN ('ready','ready_with_conditions','not_ready')),
 evaluated_by_person_id uuid NOT NULL REFERENCES persons(id),
 evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 policy_snapshot_version_id uuid REFERENCES governance_policy_versions(id),
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 expires_at timestamptz, supersedes_id uuid UNIQUE REFERENCES deployment_readiness_reviews(id),
 CHECK(expires_at IS NULL OR expires_at>evaluated_at), CHECK(supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE deployment_readiness_evidence_checks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), review_id uuid NOT NULL REFERENCES deployment_readiness_reviews(id),
 requirement_kind text NOT NULL CHECK(requirement_kind IN ('staff_screening','guardian_consent','supervision','insurance','facility','safeguarding','technology','program_licensure')),
 outcome text NOT NULL CHECK(outcome IN ('satisfied','not_applicable','deficient','requires_review')),
 verifying_organization_id uuid NOT NULL REFERENCES organizations(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(review_id,requirement_kind)
);
CREATE OR REPLACE FUNCTION v28_require_youth_readiness() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE context record; review record;
BEGIN
 IF NEW.decision<>'approved' OR NEW.stage_code NOT IN ('register_noncredit','deliver','enroll','operate')
 OR NEW.deployment_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO context FROM deployment_operating_contexts WHERE deployment_id=NEW.deployment_id;
 IF context.participant_population IN ('minors','mixed') AND context.safeguarding_required THEN
  SELECT r.* INTO review FROM deployment_readiness_reviews r
  WHERE r.deployment_id=NEW.deployment_id
    AND r.review_kind=CASE WHEN NEW.stage_code='register_noncredit' THEN 'registration'
      WHEN NEW.stage_code='enroll' THEN 'registration'
      WHEN NEW.stage_code='operate' THEN 'operating' ELSE 'delivery' END
    AND r.evaluated_at<=NEW.decided_at AND (r.expires_at IS NULL OR r.expires_at>NEW.decided_at)
  ORDER BY r.evaluated_at DESC,r.id DESC LIMIT 1;
  IF review.outcome IS DISTINCT FROM 'ready' THEN
   RAISE EXCEPTION 'Youth program needs a current verified readiness decision before activation'; END IF;
  IF EXISTS(SELECT 1 FROM deployment_readiness_evidence_checks x
     WHERE x.review_id=review.id AND x.outcome IN ('deficient','requires_review')) THEN
    RAISE EXCEPTION 'Youth program has unresolved required safeguards'; END IF;
  IF NOT EXISTS(SELECT 1 FROM deployment_readiness_evidence_checks x
   WHERE x.review_id=review.id AND x.requirement_kind='safeguarding' AND x.outcome='satisfied') THEN
    RAISE EXCEPTION 'Youth program requires verified safeguarding evidence'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER youth_authorization_readiness BEFORE INSERT ON operational_authorization_decisions
 FOR EACH ROW EXECUTE FUNCTION v28_require_youth_readiness();
CREATE TRIGGER deployment_readiness_append_only BEFORE UPDATE OR DELETE ON deployment_readiness_reviews
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER deployment_readiness_evidence_append_only BEFORE UPDATE OR DELETE ON deployment_readiness_evidence_checks
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
ALTER TABLE deployment_operating_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_operating_contexts FORCE ROW LEVEL SECURITY;
ALTER TABLE deployment_readiness_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_readiness_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE deployment_readiness_evidence_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployment_readiness_evidence_checks FORCE ROW LEVEL SECURITY;

-- Nonprivileged runtime grant proof must verify tenant and purpose at the database layer;
-- raw application-supplied GUCs are NOT accepted as authenticated identities.
CREATE TABLE database_role_organization_bindings (
 db_role name NOT NULL,organization_id uuid NOT NULL REFERENCES organizations(id),
 purpose_code text NOT NULL CHECK(purpose_code IN ('training_registration','equipment_inventory','technology_support','read_only_reporting',
 'qualification_application','qualification_evidence','qualification_reviewer',
 'program_catalog','program_fit','program_activation','network_reporting',
 'blueprint_author','blueprint_reviewer')),
 valid_from timestamptz NOT NULL,valid_through timestamptz,
 status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','revoked')),
 PRIMARY KEY(db_role,organization_id,purpose_code,valid_from)
);
-- A role's authenticated identity is PostgreSQL current_user, not a forgeable SET can.actor GUC.
-- Program-catalog readers use a dedicated non-owner login for one Organization/purpose.
-- The server must select that role only from its verified access context.
CREATE OR REPLACE FUNCTION v28_role_can_access_org(org_id uuid,purpose text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM database_role_organization_bindings b
  WHERE b.db_role=(CASE WHEN current_setting('role',true) IS NULL
    OR current_setting('role',true) IN ('','none') THEN session_user::name
    ELSE current_setting('role',true)::name END) AND b.organization_id=org_id
    AND b.purpose_code=purpose AND b.status='approved'
    AND b.valid_from<=clock_timestamp() AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp()))
$$;
REVOKE ALL ON FUNCTION v28_role_can_access_org(uuid,text) FROM PUBLIC;
CREATE OR REPLACE FUNCTION v28_role_has_purpose(purpose text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM database_role_organization_bindings b
  WHERE b.db_role=(CASE WHEN current_setting('role',true) IS NULL
    OR current_setting('role',true) IN ('','none') THEN session_user::name
    ELSE current_setting('role',true)::name END)
    AND b.purpose_code=purpose AND b.status='approved'
    AND b.valid_from<=clock_timestamp()
    AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp()))
$$;
REVOKE ALL ON FUNCTION v28_role_has_purpose(text) FROM PUBLIC;
-- Deploy-specific roles must be granted EXECUTE explicitly by a trusted administrator.
-- A limited RLS example, not a substitute for the remaining purpose-based policies.
CREATE POLICY tenant_noncredit_registration_select ON noncredit_registrations FOR SELECT
 USING (v28_role_can_access_org(registering_organization_id,'training_registration'));
CREATE POLICY tenant_equipment_inventory_select ON equipment_assets FOR SELECT
 USING (v28_role_can_access_org(inventory_organization_id,'equipment_inventory'));

DO $v28_extra_indexes$
DECLARE f record; cols text; idx text;
BEGIN
 FOR f IN SELECT c.oid,c.conrelid,c.conkey FROM pg_constraint c
   JOIN pg_namespace n ON n.oid=c.connamespace
   WHERE n.nspname IN ('education_v30','education_v30_secure') AND c.contype='f'
 LOOP
 IF EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=f.conrelid AND i.indisvalid AND i.indpred IS NULL
     AND i.indnkeyatts>=cardinality(f.conkey)
     AND (SELECT array_agg(i.indkey[x.i-1]::smallint ORDER BY x.i)
       FROM generate_series(1,cardinality(f.conkey)) x(i))=f.conkey) THEN CONTINUE;END IF;
 SELECT string_agg(quote_ident(a.attname),', ' ORDER BY x.ordinality) INTO cols
  FROM unnest(f.conkey) WITH ORDINALITY x(attnum,ordinality)
  JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=x.attnum;
 idx:=left('fk_'||replace(f.conrelid::regclass::text,'education_v30.','')||'_'||f.oid::text,63);
 EXECUTE format('CREATE INDEX %I ON %s (%s)',idx,f.conrelid::regclass,cols);
 END LOOP;
END $v28_extra_indexes$;


-- CAN OS v2.9 Qualification, Verification & Evidence Management domain.
-- Applies within a clean education_v30 canonical target after v2.8 objects have been declared.
-- Questions, evidence templates, thresholds and conditions are DATA, not hardcoded schema.

-- 21. Durable qualification identities and immutable approved templates.
CREATE TABLE qualification_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 definition_code text NOT NULL, title text NOT NULL, description text,
 subject_kind text NOT NULL CHECK(subject_kind IN
 ('organization','proposed_site','site','operation','deployment','person','equipment_asset','funding_application')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','retired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_organization_id,definition_code), UNIQUE(id,subject_kind)
);
CREATE TABLE qualification_definition_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_id uuid NOT NULL REFERENCES qualification_definitions(id),
 version_no integer NOT NULL CHECK(version_no>0),
 author_person_id uuid NOT NULL REFERENCES persons(id),
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz, validity_days integer CHECK(validity_days IS NULL OR validity_days>0),
 instructions text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(definition_id,version_no), UNIQUE(id,definition_id),
 CHECK((lifecycle='published')=(published_at IS NOT NULL))
);
CREATE TABLE qualification_template_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_version_id uuid NOT NULL REFERENCES qualification_definition_versions(id),
 review_kind text NOT NULL CHECK(review_kind IN ('governance','privacy','accessibility','safeguarding')),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 decision text NOT NULL CHECK(decision IN ('approved','rejected','withdrawn')),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE qualification_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_version_id uuid NOT NULL REFERENCES qualification_definition_versions(id),
 requirement_code text NOT NULL, title text NOT NULL, explanatory_text text,
 sequence_no integer NOT NULL CHECK(sequence_no>0),
 importance text NOT NULL CHECK(importance IN ('blocking','required','advisory')),
 evidence_standard text NOT NULL CHECK(evidence_standard IN ('self_report','document_review','independent_verification')),
 audience text NOT NULL DEFAULT 'any' CHECK(audience IN ('any','minors','adults')),
 waiver_allowed boolean NOT NULL DEFAULT false,
 UNIQUE(definition_version_id,requirement_code), UNIQUE(definition_version_id,sequence_no),
 UNIQUE(id,definition_version_id),
 CHECK(importance<>'blocking' OR NOT waiver_allowed)
);
-- A reusable qualification version can include zero or more already-published surveys.
CREATE TABLE qualification_questionnaire_bindings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_version_id uuid NOT NULL REFERENCES qualification_definition_versions(id),
 survey_version_id uuid NOT NULL REFERENCES survey_versions(id),
 purpose text NOT NULL CHECK(purpose IN ('application','verification','renewal')),
 sequence_no integer NOT NULL DEFAULT 1 CHECK(sequence_no>0),
 UNIQUE(definition_version_id,survey_version_id), UNIQUE(id,definition_version_id,survey_version_id),
 UNIQUE(definition_version_id,purpose,sequence_no)
);
CREATE TABLE qualification_question_mappings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_version_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 questionnaire_binding_id uuid NOT NULL,
 survey_version_id uuid NOT NULL,
 question_id uuid NOT NULL,
 mapping_kind text NOT NULL DEFAULT 'assertion' CHECK(mapping_kind IN ('assertion','context','supporting_detail')),
 FOREIGN KEY(requirement_id,definition_version_id) REFERENCES qualification_requirements(id,definition_version_id),
 FOREIGN KEY(questionnaire_binding_id,definition_version_id,survey_version_id)
 REFERENCES qualification_questionnaire_bindings(id,definition_version_id,survey_version_id),
 FOREIGN KEY(question_id,survey_version_id) REFERENCES survey_questions(id,survey_version_id),
 UNIQUE(requirement_id,question_id), UNIQUE(id,requirement_id,question_id)
);
-- Conditional requirement applicability is specified with answer-option references.
-- A row may make a requirement applicable ONLY when an option is selected, or suppress it.
CREATE TABLE qualification_requirement_conditions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requirement_id uuid NOT NULL REFERENCES qualification_requirements(id),
 question_mapping_id uuid NOT NULL,
 question_id uuid NOT NULL, option_id uuid NOT NULL,
 condition_kind text NOT NULL CHECK(condition_kind IN ('apply_if_selected','skip_if_selected')),
 FOREIGN KEY(question_mapping_id,requirement_id,question_id)
 REFERENCES qualification_question_mappings(id,requirement_id,question_id),
 FOREIGN KEY(option_id,question_id) REFERENCES survey_question_options(id,question_id),
 UNIQUE(requirement_id,question_mapping_id,option_id,condition_kind)
);
CREATE UNIQUE INDEX qualification_condition_option_unique
 ON qualification_requirement_conditions(requirement_id,question_mapping_id,option_id);
COMMENT ON TABLE qualification_requirement_conditions IS
 'Multiple apply_if_selected rules use AND; skip_if_selected has precedence. A single option cannot have opposing rules.';
CREATE TABLE qualification_evidence_types (
 code text PRIMARY KEY, display_name text NOT NULL,
 category_code text NOT NULL, description text,
 permitted_mime_types text[] NOT NULL DEFAULT ARRAY[]::text[],
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE qualification_evidence_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_version_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 evidence_type_code text NOT NULL REFERENCES qualification_evidence_types(code),
 mandatory boolean NOT NULL DEFAULT true,
 minimum_accepted_items integer NOT NULL DEFAULT 1 CHECK(minimum_accepted_items>0),
 validity_days integer CHECK(validity_days IS NULL OR validity_days>0),
 verifier_instruction text,
 FOREIGN KEY(requirement_id,definition_version_id)
 REFERENCES qualification_requirements(id,definition_version_id),
 UNIQUE(requirement_id,evidence_type_code), UNIQUE(id,requirement_id)
);

-- 22. One subject at a time. Provisional locations do not require creating a school.
CREATE TABLE qualification_proposed_sites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proposing_organization_id uuid NOT NULL REFERENCES organizations(id),
 proposed_name text NOT NULL, street_address jsonb NOT NULL DEFAULT '{}'::jsonb
 CHECK(jsonb_typeof(street_address)='object'),
 intended_use_description text,
 reported_seating_capacity integer CHECK(reported_seating_capacity IS NULL OR reported_seating_capacity>=0),
 verified_seating_capacity integer CHECK(verified_seating_capacity IS NULL OR verified_seating_capacity>=0),
 capacity_verification_evidence_id uuid REFERENCES evidence_document_versions(id),
 CHECK(verified_seating_capacity IS NULL OR capacity_verification_evidence_id IS NOT NULL),
 created_by_person_id uuid NOT NULL REFERENCES persons(id),
 linked_site_id uuid UNIQUE REFERENCES sites(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,proposing_organization_id)
);
CREATE OR REPLACE FUNCTION v30_verify_proposed_site_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.verified_seating_capacity IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM evidence_document_versions v
  WHERE v.id=NEW.capacity_verification_evidence_id
   AND v.verified_at IS NOT NULL AND v.verified_by_person_id IS NOT NULL
   AND (v.valid_through IS NULL OR v.valid_through>=CURRENT_DATE)) THEN
   RAISE EXCEPTION 'Verified proposed-site capacity needs current independent evidence'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER proposed_site_capacity_guard
 BEFORE INSERT OR UPDATE OF verified_seating_capacity,capacity_verification_evidence_id
 ON qualification_proposed_sites FOR EACH ROW
 EXECUTE FUNCTION v30_verify_proposed_site_capacity();
CREATE TABLE qualification_person_consents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subject_person_id uuid NOT NULL REFERENCES persons(id),
 applicant_organization_id uuid NOT NULL REFERENCES organizations(id),
 consent_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz,
 status text NOT NULL DEFAULT 'approved' CHECK(status='approved'),
 UNIQUE(subject_person_id,applicant_organization_id,consent_evidence_version_id)
);
CREATE TABLE qualification_person_consent_withdrawals (
 consent_id uuid PRIMARY KEY REFERENCES qualification_person_consents(id),
 withdrawn_by_person_id uuid NOT NULL REFERENCES persons(id),
 withdrawal_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 withdrawn_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);
CREATE TABLE qualification_subjects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 applicant_organization_id uuid NOT NULL REFERENCES organizations(id),
 subject_kind text NOT NULL CHECK(subject_kind IN
 ('organization','proposed_site','site','operation','deployment','person','equipment_asset','funding_application')),
 organization_id uuid REFERENCES organizations(id),
 proposed_site_id uuid REFERENCES qualification_proposed_sites(id),
 site_id uuid REFERENCES sites(id), operation_id uuid REFERENCES education_operations(id),
 deployment_id uuid REFERENCES program_deployments(id),
 person_id uuid REFERENCES persons(id),
 equipment_asset_id uuid REFERENCES equipment_assets(id),
 funding_application_id uuid REFERENCES funding_applications(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,subject_kind), UNIQUE(id,applicant_organization_id),
 CHECK(num_nonnulls(organization_id,proposed_site_id,site_id,operation_id,
  deployment_id,person_id,equipment_asset_id,funding_application_id)=1),
 CHECK((subject_kind='organization' AND organization_id IS NOT NULL AND organization_id=applicant_organization_id)
 OR (subject_kind='proposed_site' AND proposed_site_id IS NOT NULL)
 OR (subject_kind='site' AND site_id IS NOT NULL)
 OR (subject_kind='operation' AND operation_id IS NOT NULL)
 OR (subject_kind='deployment' AND deployment_id IS NOT NULL)
 OR (subject_kind='person' AND person_id IS NOT NULL)
 OR (subject_kind='equipment_asset' AND equipment_asset_id IS NOT NULL)
 OR (subject_kind='funding_application' AND funding_application_id IS NOT NULL))
);
CREATE TABLE qualification_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 applicant_organization_id uuid NOT NULL REFERENCES organizations(id),
 subject_id uuid NOT NULL, subject_kind text NOT NULL,
 definition_id uuid NOT NULL, definition_version_id uuid NOT NULL,
 contact_person_id uuid NOT NULL REFERENCES persons(id),
 intended_population text NOT NULL DEFAULT 'any' CHECK(intended_population IN ('any','adults','minors','mixed')),
 intended_deployment_id uuid REFERENCES program_deployments(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','withdrawn','closed')),
 submitted_at timestamptz, opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 predecessor_application_id uuid REFERENCES qualification_applications(id),
 FOREIGN KEY(subject_id,applicant_organization_id) REFERENCES qualification_subjects(id,applicant_organization_id),
 FOREIGN KEY(subject_id,subject_kind) REFERENCES qualification_subjects(id,subject_kind),
 FOREIGN KEY(definition_version_id,definition_id) REFERENCES qualification_definition_versions(id,definition_id),
 UNIQUE(id,definition_version_id), UNIQUE(id,applicant_organization_id),
 UNIQUE(id,subject_id),
 CHECK((status IN ('submitted','closed'))=(submitted_at IS NOT NULL) OR status='withdrawn')
);
CREATE TABLE qualification_application_survey_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL, definition_version_id uuid NOT NULL,
 questionnaire_binding_id uuid NOT NULL, survey_version_id uuid NOT NULL,
 survey_response_id uuid NOT NULL,
 submitted_by_person_id uuid NOT NULL REFERENCES persons(id),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 supersedes_id uuid UNIQUE REFERENCES qualification_application_survey_submissions(id),
 FOREIGN KEY(application_id,definition_version_id) REFERENCES qualification_applications(id,definition_version_id),
 FOREIGN KEY(questionnaire_binding_id,definition_version_id,survey_version_id)
 REFERENCES qualification_questionnaire_bindings(id,definition_version_id,survey_version_id),
 FOREIGN KEY(survey_response_id,survey_version_id) REFERENCES survey_responses(id,survey_version_id),
 UNIQUE(survey_response_id), UNIQUE(id,application_id,questionnaire_binding_id),

 CHECK(supersedes_id IS DISTINCT FROM id)
);
-- A resubmission must supersede the current chain; never create parallel roots.
CREATE UNIQUE INDEX qualification_survey_submission_one_root
 ON qualification_application_survey_submissions(application_id,questionnaire_binding_id)
 WHERE supersedes_id IS NULL;
-- Multiple questionnaire submissions for corrections are a new qualification application revision.

-- Reviewer permissions are explicit, effective-dated, limited by definition and action.
CREATE TABLE qualification_reviewer_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_id uuid NOT NULL REFERENCES qualification_definitions(id),
 authorizing_organization_id uuid NOT NULL REFERENCES organizations(id),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 reviewer_organization_id uuid NOT NULL REFERENCES organizations(id),
 permission_code text NOT NULL CHECK(permission_code IN
 ('review_evidence','evaluate_requirement','decide_qualification','approve_exception')),
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','suspended','revoked')),
 approved_by_person_id uuid NOT NULL REFERENCES persons(id),
 authorization_evidence_version_id uuid REFERENCES evidence_document_versions(id),
 UNIQUE(id,definition_id,reviewer_person_id,permission_code),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 CHECK(approved_by_person_id<>reviewer_person_id)
);
CREATE TABLE qualification_evidence_access_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_document_id uuid NOT NULL REFERENCES evidence_documents(id),
 grantee_organization_id uuid NOT NULL REFERENCES organizations(id),
 grantor_organization_id uuid NOT NULL REFERENCES organizations(id),
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 purpose_code text NOT NULL DEFAULT 'qualification_review' CHECK(purpose_code='qualification_review'),
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 granted_by_person_id uuid NOT NULL REFERENCES persons(id),
 status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','revoked')),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 UNIQUE(evidence_document_id,grantee_organization_id,application_id,valid_from)
);
CREATE TABLE qualification_evidence_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 requirement_id uuid NOT NULL REFERENCES qualification_requirements(id),
 evidence_requirement_id uuid NOT NULL,
 request_note text, requested_by_person_id uuid NOT NULL REFERENCES persons(id),
 requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 due_at timestamptz,
 FOREIGN KEY(evidence_requirement_id,requirement_id) REFERENCES qualification_evidence_requirements(id,requirement_id),
 CHECK(due_at IS NULL OR due_at>requested_at)
);
CREATE TABLE qualification_evidence_submissions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 requirement_id uuid NOT NULL REFERENCES qualification_requirements(id),
 evidence_requirement_id uuid NOT NULL,
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 submitted_by_person_id uuid NOT NULL REFERENCES persons(id),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 explanation text,
 FOREIGN KEY(evidence_requirement_id,requirement_id) REFERENCES qualification_evidence_requirements(id,requirement_id),
 UNIQUE(application_id,requirement_id,evidence_version_id),
 UNIQUE(id,application_id,requirement_id),
 UNIQUE(id,evidence_requirement_id)
);
CREATE TABLE qualification_evidence_review_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_submission_id uuid NOT NULL REFERENCES qualification_evidence_submissions(id),
 reviewer_authorization_id uuid NOT NULL REFERENCES qualification_reviewer_authorizations(id),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 decision text NOT NULL CHECK(decision IN ('accepted','rejected','needs_information','revoked')),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 valid_through timestamptz,
 review_note text,
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 supersedes_id uuid UNIQUE REFERENCES qualification_evidence_review_decisions(id),
 CHECK(valid_through IS NULL OR valid_through>reviewed_at),
 CHECK(supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE qualification_evidence_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evidence_submission_id uuid NOT NULL REFERENCES qualification_evidence_submissions(id),
 event_kind text NOT NULL CHECK(event_kind IN ('revoked','replaced','withdrawn')),
 reviewer_authorization_id uuid REFERENCES qualification_reviewer_authorizations(id),
 effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 recorded_by_person_id uuid NOT NULL REFERENCES persons(id),
 reason text NOT NULL,
 replacement_submission_id uuid REFERENCES qualification_evidence_submissions(id),
 CHECK((event_kind='replaced')=(replacement_submission_id IS NOT NULL))
);

-- 23. Requirement-level assertions, evidence, evaluation, decisions, corrective actions.
CREATE TABLE qualification_requirement_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 requirement_id uuid NOT NULL REFERENCES qualification_requirements(id),
 reviewer_authorization_id uuid NOT NULL REFERENCES qualification_reviewer_authorizations(id),
 approved_by_person_id uuid NOT NULL REFERENCES persons(id),
 decision text NOT NULL CHECK(decision IN ('approved','denied','revoked')),
 justification text NOT NULL, evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(), valid_through timestamptz,
 supersedes_id uuid UNIQUE REFERENCES qualification_requirement_exceptions(id),
 CHECK(supersedes_id IS DISTINCT FROM id),
 CHECK(valid_through IS NULL OR valid_through>decided_at)
);
CREATE TABLE qualification_requirement_evaluations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 requirement_id uuid NOT NULL REFERENCES qualification_requirements(id),
 reviewer_authorization_id uuid NOT NULL REFERENCES qualification_reviewer_authorizations(id),
 evaluated_by_person_id uuid NOT NULL REFERENCES persons(id),
 determination text NOT NULL CHECK(determination IN ('satisfied','deficient','pending','waived','not_applicable')),
 rationale text NOT NULL, evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 valid_through timestamptz,
 exception_id uuid REFERENCES qualification_requirement_exceptions(id),
 supersedes_id uuid UNIQUE REFERENCES qualification_requirement_evaluations(id),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 UNIQUE(id,application_id,requirement_id), UNIQUE(id,application_id),
 CHECK(supersedes_id IS DISTINCT FROM id),
 CHECK((determination='waived')=(exception_id IS NOT NULL)),
 CHECK(valid_through IS NULL OR valid_through>evaluated_at)
);
CREATE UNIQUE INDEX qualification_one_initial_requirement_evaluation
 ON qualification_requirement_evaluations(application_id,requirement_id)
 WHERE supersedes_id IS NULL;
CREATE TABLE qualification_evaluation_evidence (
 evaluation_id uuid NOT NULL,
 application_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 evidence_submission_id uuid NOT NULL,
 evidence_review_decision_id uuid NOT NULL REFERENCES qualification_evidence_review_decisions(id),
 FOREIGN KEY(evaluation_id,application_id,requirement_id)
 REFERENCES qualification_requirement_evaluations(id,application_id,requirement_id),
 FOREIGN KEY(evidence_submission_id,application_id,requirement_id)
 REFERENCES qualification_evidence_submissions(id,application_id,requirement_id),
 PRIMARY KEY(evaluation_id,evidence_submission_id)
);
CREATE TABLE qualification_evaluation_answers (
 evaluation_id uuid NOT NULL,
 application_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 application_survey_submission_id uuid NOT NULL REFERENCES qualification_application_survey_submissions(id),
 question_mapping_id uuid NOT NULL, question_id uuid NOT NULL,
 survey_answer_id uuid NOT NULL REFERENCES survey_answers(id),
 FOREIGN KEY(evaluation_id,application_id,requirement_id)
 REFERENCES qualification_requirement_evaluations(id,application_id,requirement_id),
 FOREIGN KEY(question_mapping_id,requirement_id,question_id)
 REFERENCES qualification_question_mappings(id,requirement_id,question_id),
 PRIMARY KEY(evaluation_id,survey_answer_id)
);
CREATE TABLE qualification_evaluation_facility_verifications (
 evaluation_id uuid NOT NULL REFERENCES qualification_requirement_evaluations(id),
 verification_id uuid NOT NULL REFERENCES site_space_capability_verifications(id),
 PRIMARY KEY(evaluation_id,verification_id)
);
CREATE TABLE qualification_evaluation_control_verifications (
 evaluation_id uuid NOT NULL REFERENCES qualification_requirement_evaluations(id),
 control_evaluation_id uuid NOT NULL REFERENCES control_evaluations(id),
 PRIMARY KEY(evaluation_id,control_evaluation_id)
);
CREATE TABLE qualification_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 reviewer_authorization_id uuid NOT NULL REFERENCES qualification_reviewer_authorizations(id),
 decided_by_person_id uuid NOT NULL REFERENCES persons(id),
 decision_stage text NOT NULL CHECK(decision_stage IN ('screening','verified')),
 outcome text NOT NULL CHECK(outcome IN
 ('candidate','conditional_candidate','not_yet_qualified','qualified','qualified_with_conditions','not_qualified')),
 rationale text NOT NULL, decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 valid_from timestamptz NOT NULL DEFAULT clock_timestamp(), valid_through timestamptz,
 supersedes_id uuid UNIQUE REFERENCES qualification_decisions(id),
 decision_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 UNIQUE(id,application_id),
 CHECK((decision_stage='screening' AND outcome IN ('candidate','conditional_candidate','not_yet_qualified'))
 OR (decision_stage='verified' AND outcome IN ('qualified','qualified_with_conditions','not_qualified'))),
 CHECK(supersedes_id IS DISTINCT FROM id),
 CHECK(valid_through IS NULL OR valid_through>valid_from)
);
CREATE UNIQUE INDEX qualification_one_initial_decision
 ON qualification_decisions(application_id) WHERE supersedes_id IS NULL;
CREATE TABLE qualification_decision_requirements (
 decision_id uuid NOT NULL, application_id uuid NOT NULL,
 requirement_id uuid NOT NULL REFERENCES qualification_requirements(id),
 evaluation_id uuid NOT NULL,
 FOREIGN KEY(decision_id,application_id) REFERENCES qualification_decisions(id,application_id),
 FOREIGN KEY(evaluation_id,application_id,requirement_id)
 REFERENCES qualification_requirement_evaluations(id,application_id,requirement_id),
 PRIMARY KEY(decision_id,requirement_id), UNIQUE(decision_id,evaluation_id)
);
CREATE TABLE qualification_conditions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_id uuid NOT NULL REFERENCES qualification_decisions(id),
 requirement_id uuid NOT NULL REFERENCES qualification_requirements(id),
 condition_text text NOT NULL, due_at timestamptz,
 created_by_person_id uuid NOT NULL REFERENCES persons(id),
 reason_kind text NOT NULL DEFAULT 'missing_resource'
 CHECK(reason_kind IN ('missing_resource','verification_pending','corrective_action','administrative')),
 UNIQUE(decision_id,requirement_id)
);
CREATE TABLE qualification_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 evaluation_id uuid NOT NULL REFERENCES qualification_requirement_evaluations(id),
 finding_code text NOT NULL, description text NOT NULL,
 severity text NOT NULL CHECK(severity IN ('informational','moderate','critical')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(evaluation_id,finding_code)
);
ALTER TABLE improvement_plans
 ADD CONSTRAINT improvement_plans_qualification_finding_fk
 FOREIGN KEY(qualification_finding_id) REFERENCES qualification_findings(id);
CREATE TABLE qualification_improvement_action_links (
 finding_id uuid NOT NULL REFERENCES qualification_findings(id),
 improvement_action_id uuid NOT NULL REFERENCES improvement_actions(id),
 PRIMARY KEY(finding_id,improvement_action_id)
);
CREATE TABLE qualification_reassessment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 basis text NOT NULL CHECK(basis IN
 ('scheduled','evidence_expired','evidence_revoked','policy_changed','program_changed','incident','requested','finding')),
 trigger_evidence_submission_id uuid REFERENCES qualification_evidence_submissions(id),
 requested_by_person_id uuid REFERENCES persons(id),
 request_details text, requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','resolved','cancelled'))
);

-- 24. Optional, explicit qualification gates for future operational authorizations.
-- A candidate record never grants authority. A program must opt into an approved gate.
CREATE TABLE qualification_operational_gates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_id uuid NOT NULL REFERENCES program_deployments(id),
 definition_id uuid NOT NULL REFERENCES qualification_definitions(id),
 definition_version_id uuid NOT NULL,
 subject_kind text NOT NULL CHECK(subject_kind IN ('organization','site')),
 FOREIGN KEY(definition_version_id,definition_id) REFERENCES qualification_definition_versions(id,definition_id),
 stage_code text NOT NULL CHECK(stage_code IN
 ('register_noncredit','accept_applications','enroll','deliver','operate')),
 blocking boolean NOT NULL DEFAULT true,
 valid_from timestamptz NOT NULL, valid_through timestamptz,
 adopted_by_person_id uuid NOT NULL REFERENCES persons(id),
 adopting_organization_id uuid NOT NULL REFERENCES organizations(id),
 adoption_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 UNIQUE(deployment_id,definition_id,stage_code,subject_kind,valid_from)
);
CREATE INDEX qualification_application_subject_lookup ON qualification_applications(subject_id,submitted_at DESC);
CREATE INDEX qualification_template_review_lookup ON qualification_template_reviews(definition_version_id,review_kind,decision_order DESC);
CREATE INDEX qualification_evidence_review_lookup ON qualification_evidence_review_decisions(evidence_submission_id,decision_order DESC);
CREATE INDEX qualification_evaluation_lookup ON qualification_requirement_evaluations(application_id,requirement_id,decision_order DESC);
CREATE INDEX qualification_decision_lookup ON qualification_decisions(application_id,decision_order DESC);
CREATE INDEX qualification_reassessment_lookup ON qualification_reassessment_requests(application_id,requested_at DESC);

CREATE TABLE qualification_template_withdrawals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_version_id uuid NOT NULL REFERENCES qualification_definition_versions(id),
 withdrawn_by_person_id uuid NOT NULL REFERENCES persons(id),
 reviewer_authorization_id uuid NOT NULL REFERENCES qualification_reviewer_authorizations(id),
 reason text NOT NULL, evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 effective_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(definition_version_id,effective_at)
);

CREATE OR REPLACE FUNCTION v29_reject_update_delete() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Qualification evidence and decisions are append-only (%). Create a superseding record',TG_TABLE_NAME; END $$;

CREATE OR REPLACE FUNCTION v29_assert_reviewer_permission(
 auth_id uuid, def_id uuid, person_id uuid, needed_code text, as_of timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM qualification_reviewer_authorizations a
   JOIN qualification_definitions d ON d.id=a.definition_id
   WHERE a.id=auth_id AND a.definition_id=def_id AND a.reviewer_person_id=person_id
    AND a.permission_code=needed_code AND a.status='approved'
    AND a.authorizing_organization_id=d.owner_organization_id
    AND a.valid_from<=as_of AND (a.valid_through IS NULL OR a.valid_through>as_of)
 ) THEN RAISE EXCEPTION 'Reviewer lacks current, owner-issued qualification permission: %',needed_code; END IF;
END $$;

CREATE OR REPLACE FUNCTION v29_protect_template_children() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE old_version uuid; new_version uuid; lifecycle_value text;
BEGIN
 IF TG_TABLE_NAME IN ('qualification_requirements','qualification_questionnaire_bindings',
                       'qualification_question_mappings','qualification_evidence_requirements') THEN
    IF TG_OP<>'INSERT' THEN old_version:=OLD.definition_version_id; END IF;
    IF TG_OP<>'DELETE' THEN new_version:=NEW.definition_version_id; END IF;
 ELSIF TG_TABLE_NAME='qualification_requirement_conditions' THEN
    IF TG_OP<>'INSERT' THEN SELECT definition_version_id INTO old_version
       FROM qualification_requirements WHERE id=OLD.requirement_id; END IF;
    IF TG_OP<>'DELETE' THEN SELECT definition_version_id INTO new_version
       FROM qualification_requirements WHERE id=NEW.requirement_id; END IF;
 ELSE RAISE EXCEPTION 'Unrecognized qualification child table: %',TG_TABLE_NAME; END IF;
 IF old_version IS NOT NULL THEN
   SELECT lifecycle INTO lifecycle_value FROM qualification_definition_versions WHERE id=old_version;
   IF lifecycle_value='published' THEN RAISE EXCEPTION 'Published qualification definition is immutable'; END IF;
 END IF;
 IF new_version IS NOT NULL THEN
   SELECT lifecycle INTO lifecycle_value FROM qualification_definition_versions WHERE id=new_version;
   IF lifecycle_value='published' THEN RAISE EXCEPTION 'Published qualification definition is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_req_immutable BEFORE INSERT OR UPDATE OR DELETE ON qualification_requirements
 FOR EACH ROW EXECUTE FUNCTION v29_protect_template_children();
CREATE TRIGGER q_survey_binding_immutable BEFORE INSERT OR UPDATE OR DELETE ON qualification_questionnaire_bindings
 FOR EACH ROW EXECUTE FUNCTION v29_protect_template_children();
CREATE TRIGGER q_question_mapping_immutable BEFORE INSERT OR UPDATE OR DELETE ON qualification_question_mappings
 FOR EACH ROW EXECUTE FUNCTION v29_protect_template_children();
CREATE TRIGGER q_rule_immutable BEFORE INSERT OR UPDATE OR DELETE ON qualification_requirement_conditions
 FOR EACH ROW EXECUTE FUNCTION v29_protect_template_children();
CREATE TRIGGER q_evidence_spec_immutable BEFORE INSERT OR UPDATE OR DELETE ON qualification_evidence_requirements
 FOR EACH ROW EXECUTE FUNCTION v29_protect_template_children();

CREATE OR REPLACE FUNCTION v29_publish_definition() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE kind text; review record; needed int;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Qualification template versions are permanent'; END IF;
 IF OLD.lifecycle='published' THEN RAISE EXCEPTION 'Published qualification template cannot be changed'; END IF;
 IF NEW.lifecycle='published' THEN
  IF NEW.published_at IS NULL THEN NEW.published_at:=clock_timestamp(); END IF;
  IF NEW.published_at>clock_timestamp()+interval '5 seconds' THEN RAISE EXCEPTION 'Future publication time invalid'; END IF;
  SELECT count(*) INTO needed FROM qualification_requirements
   WHERE definition_version_id=NEW.id;
  IF needed=0 THEN RAISE EXCEPTION 'Qualification publication requires at least one requirement'; END IF;
  FOR kind IN SELECT unnest(CASE WHEN EXISTS(SELECT 1 FROM qualification_requirements q
      WHERE q.definition_version_id=NEW.id AND q.audience='minors')
   THEN ARRAY['governance','privacy','safeguarding']
   ELSE ARRAY['governance','privacy'] END) LOOP
    SELECT r.* INTO review FROM qualification_template_reviews r
     WHERE r.definition_version_id=NEW.id AND r.review_kind=kind
     ORDER BY r.decision_order DESC LIMIT 1;
    IF NOT FOUND OR review.decision IS DISTINCT FROM 'approved'
       OR review.reviewer_person_id=NEW.author_person_id THEN
       RAISE EXCEPTION 'Independent approved % review is missing',kind;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM qualification_questionnaire_bindings b
    JOIN survey_versions sv ON sv.id=b.survey_version_id
    WHERE b.definition_version_id=NEW.id AND sv.lifecycle<>'published') THEN
     RAISE EXCEPTION 'Qualification cannot publish with draft survey versions'; END IF;
  IF EXISTS(SELECT 1 FROM qualification_requirements q
    WHERE q.definition_version_id=NEW.id AND q.importance IN ('blocking','required')
    AND q.evidence_standard<>'self_report'
    AND NOT EXISTS(SELECT 1 FROM qualification_evidence_requirements e
      WHERE e.requirement_id=q.id AND e.mandatory)) THEN
       RAISE EXCEPTION 'Mandatory documented qualification requirement lacks an evidence specification'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_version_publish BEFORE UPDATE OR DELETE ON qualification_definition_versions
 FOR EACH ROW EXECUTE FUNCTION v29_publish_definition();

CREATE OR REPLACE FUNCTION v29_guard_subject() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.subject_kind='proposed_site' AND NOT EXISTS(
   SELECT 1 FROM qualification_proposed_sites s WHERE s.id=NEW.proposed_site_id
     AND s.proposing_organization_id=NEW.applicant_organization_id) THEN
   RAISE EXCEPTION 'Proposed site does not belong to qualification applicant'; END IF;
 IF NEW.subject_kind='site' AND NOT EXISTS(
   SELECT 1 FROM site_organization_roles r WHERE r.site_id=NEW.site_id
    AND r.organization_id=NEW.applicant_organization_id
    AND r.valid_from<=clock_timestamp() AND
      (r.valid_through IS NULL OR r.valid_through>clock_timestamp())) THEN
    RAISE EXCEPTION 'Applicant must have an active relationship to the site'; END IF;
 IF NEW.subject_kind='operation' AND NOT EXISTS(
   SELECT 1 FROM education_operation_organization_roles r
    WHERE r.operation_id=NEW.operation_id AND r.organization_id=NEW.applicant_organization_id
    AND r.status='approved' AND r.valid_from<=clock_timestamp()
    AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())) THEN
    RAISE EXCEPTION 'Applicant is not authorized for the educational operation'; END IF;
 IF NEW.subject_kind='deployment' AND NOT EXISTS(
   SELECT 1 FROM program_deployments d
   JOIN education_operation_organization_roles r ON r.operation_id=d.operation_id
   WHERE d.id=NEW.deployment_id AND r.organization_id=NEW.applicant_organization_id
    AND r.status='approved' AND r.valid_from<=clock_timestamp()
    AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())) THEN
     RAISE EXCEPTION 'Applicant is not a deployment operating partner'; END IF;
 IF NEW.subject_kind='equipment_asset' AND NOT EXISTS(
   SELECT 1 FROM equipment_assets e WHERE e.id=NEW.equipment_asset_id
    AND (e.inventory_organization_id=NEW.applicant_organization_id OR EXISTS(
      SELECT 1 FROM equipment_ownership_periods o WHERE o.asset_id=e.id
      AND o.owner_organization_id=NEW.applicant_organization_id
      AND o.owned_from<=clock_timestamp() AND
          (o.owned_through IS NULL OR o.owned_through>clock_timestamp())))) THEN
      RAISE EXCEPTION 'Equipment qualification applicant is not asset owner/custodian'; END IF;
 IF NEW.subject_kind='funding_application' AND NOT EXISTS(
   SELECT 1 FROM funding_applications f WHERE f.id=NEW.funding_application_id
      AND f.applicant_organization_id=NEW.applicant_organization_id) THEN
    RAISE EXCEPTION 'Funding application is not owned by applicant'; END IF;
 IF NEW.subject_kind='person' AND NOT EXISTS(
   SELECT 1 FROM qualification_person_consents g WHERE g.subject_person_id=NEW.person_id
    AND g.status='approved' AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT 1 FROM qualification_person_consent_withdrawals w WHERE w.consent_id=g.id)
     AND g.applicant_organization_id=NEW.applicant_organization_id
     AND g.status='approved' AND g.approved_at<=clock_timestamp()
     AND (g.expires_at IS NULL OR g.expires_at>clock_timestamp())) THEN
    RAISE EXCEPTION 'Personal qualification requires explicit valid purpose-scoped consent'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_subject_scope BEFORE INSERT OR UPDATE ON qualification_subjects
 FOR EACH ROW EXECUTE FUNCTION v29_guard_subject();

CREATE OR REPLACE FUNCTION v29_guard_application() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE d record;
BEGIN
 SELECT d.subject_kind,v.lifecycle INTO d
 FROM qualification_definition_versions v JOIN qualification_definitions d ON d.id=v.definition_id
 WHERE v.id=NEW.definition_version_id AND v.definition_id=NEW.definition_id;
 IF NEW.subject_kind IS DISTINCT FROM d.subject_kind THEN
   RAISE EXCEPTION 'Qualification subject type differs from template'; END IF;
 IF TG_OP='INSERT' AND NEW.status NOT IN ('draft','submitted') THEN
  RAISE EXCEPTION 'New qualification applications must begin as draft or submitted'; END IF;
 IF NEW.status IN ('submitted','closed') THEN
  IF d.lifecycle IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Qualification application requires a published definition'; END IF;
  IF EXISTS(SELECT 1 FROM qualification_template_withdrawals w
    WHERE w.definition_version_id=NEW.definition_version_id AND w.effective_at<=clock_timestamp()) THEN
    RAISE EXCEPTION 'Withdrawn qualification template cannot receive applications'; END IF;
  IF TG_OP='INSERT' THEN NEW.submitted_at:=clock_timestamp();
  ELSIF OLD.status='draft' AND NEW.status='submitted' THEN NEW.submitted_at:=clock_timestamp();
  END IF;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.applicant_organization_id,NEW.subject_id,NEW.subject_kind,
         NEW.definition_id,NEW.definition_version_id,NEW.contact_person_id,
         NEW.intended_population,NEW.intended_deployment_id,NEW.opened_at,NEW.predecessor_application_id)
    IS DISTINCT FROM
     ROW(OLD.applicant_organization_id,OLD.subject_id,OLD.subject_kind,
         OLD.definition_id,OLD.definition_version_id,OLD.contact_person_id,
         OLD.intended_population,OLD.intended_deployment_id,OLD.opened_at,OLD.predecessor_application_id) THEN
    RAISE EXCEPTION 'Qualification applicant and template identity cannot change'; END IF;
  IF OLD.status<>'draft' AND NEW.status='draft' THEN
    RAISE EXCEPTION 'Submitted qualification applications cannot return to draft'; END IF;
  IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at AND
      NOT (OLD.status='draft' AND NEW.status='submitted') THEN
    RAISE EXCEPTION 'Qualification submission time is immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_application_scope BEFORE INSERT OR UPDATE ON qualification_applications
 FOR EACH ROW EXECUTE FUNCTION v29_guard_application();

CREATE OR REPLACE FUNCTION v29_guard_survey_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE appl record; survey record;
BEGIN
 IF NEW.supersedes_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM qualification_application_survey_submissions old
    WHERE old.id=NEW.supersedes_id AND old.application_id=NEW.application_id
     AND old.questionnaire_binding_id=NEW.questionnaire_binding_id
     AND NOT EXISTS(SELECT 1 FROM qualification_application_survey_submissions later
       WHERE later.supersedes_id=old.id)) THEN
    RAISE EXCEPTION 'Resubmission must supersede the current questionnaire submission'; END IF;
 ELSIF EXISTS(SELECT 1 FROM qualification_application_survey_submissions old
   WHERE old.application_id=NEW.application_id
     AND old.questionnaire_binding_id=NEW.questionnaire_binding_id) THEN
   RAISE EXCEPTION 'Further survey submissions require explicit supersession';
 END IF;
 SELECT * INTO appl FROM qualification_applications WHERE id=NEW.application_id;
 SELECT r.respondent_mode,r.survey_version_id,r.invitation_id,i.invited_person_id
 INTO survey FROM survey_responses r LEFT JOIN survey_invitations i ON i.id=r.invitation_id
 WHERE r.id=NEW.survey_response_id;
 IF survey.respondent_mode IS DISTINCT FROM 'identified'
 OR survey.survey_version_id IS DISTINCT FROM NEW.survey_version_id
 OR survey.invited_person_id IS DISTINCT FROM NEW.submitted_by_person_id THEN
   RAISE EXCEPTION 'Qualification cannot rely on anonymous or mismatched questionnaire responses'; END IF;
 IF appl.contact_person_id<>NEW.submitted_by_person_id THEN
   RAISE EXCEPTION 'Qualification respondent must be the designated applicant contact'; END IF;
 IF NEW.definition_version_id<>appl.definition_version_id THEN
   RAISE EXCEPTION 'Questionnaire is not bound to application definition'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_survey_submission_scope BEFORE INSERT ON qualification_application_survey_submissions
 FOR EACH ROW EXECUTE FUNCTION v29_guard_survey_submission();

CREATE OR REPLACE FUNCTION v29_guard_reviewer_authorization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qualification_definitions d
    WHERE d.id=NEW.definition_id AND d.owner_organization_id=NEW.authorizing_organization_id) THEN
   RAISE EXCEPTION 'Qualification reviewer authorization must be granted by template owner'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_reviewer_authority_guard BEFORE INSERT OR UPDATE ON qualification_reviewer_authorizations
 FOR EACH ROW EXECUTE FUNCTION v29_guard_reviewer_authorization();
CREATE TRIGGER q_reviewer_auth_delete_block BEFORE DELETE ON qualification_reviewer_authorizations
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

CREATE OR REPLACE FUNCTION v29_guard_evidence_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM evidence_documents d
   WHERE d.id=NEW.evidence_document_id AND d.owning_organization_id=NEW.grantor_organization_id) THEN
   RAISE EXCEPTION 'Only the document owning organization can grant qualification evidence access'; END IF;
 IF NOT EXISTS(SELECT 1 FROM qualification_applications a
   JOIN qualification_definition_versions v ON v.id=a.definition_version_id
   JOIN qualification_definitions d ON d.id=v.definition_id
   WHERE a.id=NEW.application_id AND
     (NEW.grantee_organization_id=a.applicant_organization_id OR
      NEW.grantee_organization_id=d.owner_organization_id)) THEN
    RAISE EXCEPTION 'Evidence grant is unrelated to the qualification application'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_evidence_grant_scope BEFORE INSERT OR UPDATE ON qualification_evidence_access_grants
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evidence_grant();

CREATE OR REPLACE FUNCTION v29_guard_evidence_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE appl record; req record; doc record;
BEGIN
 SELECT * INTO appl FROM qualification_applications WHERE id=NEW.application_id;
 SELECT q.definition_version_id, s.evidence_type_code
 INTO req FROM qualification_requirements q
 JOIN qualification_evidence_requirements s ON s.requirement_id=q.id
 WHERE q.id=NEW.requirement_id AND s.id=NEW.evidence_requirement_id;
 IF req.definition_version_id IS DISTINCT FROM appl.definition_version_id THEN
   RAISE EXCEPTION 'Evidence requirement belongs to another qualification template'; END IF;
 SELECT d.id,d.owning_organization_id,d.kind_code,v.source_uri,v.storage_reference,v.sha256,v.mime_type
 INTO doc FROM evidence_document_versions v JOIN evidence_documents d ON d.id=v.document_id
 WHERE v.id=NEW.evidence_version_id;
 IF NOT EXISTS(SELECT 1 FROM qualification_evidence_requirements er
    JOIN qualification_evidence_types et ON et.code=er.evidence_type_code
    WHERE er.id=NEW.evidence_requirement_id
      AND (cardinality(et.permitted_mime_types)=0
        OR doc.mime_type=ANY(et.permitted_mime_types))) THEN
   RAISE EXCEPTION 'Evidence MIME type is missing or not permitted for this requirement'; END IF;
 IF doc.source_uri IS NULL AND doc.storage_reference IS NULL AND doc.sha256 IS NULL THEN
   RAISE EXCEPTION 'Evidence must reference a stored or externally verifiable artifact'; END IF;
 IF doc.owning_organization_id IS DISTINCT FROM appl.applicant_organization_id
 AND NOT EXISTS(SELECT 1 FROM qualification_evidence_access_grants g
  WHERE g.evidence_document_id=doc.id AND g.application_id=NEW.application_id
   AND g.grantee_organization_id=appl.applicant_organization_id
   AND g.status='approved' AND g.valid_from<=NEW.submitted_at
   AND (g.valid_through IS NULL OR g.valid_through>NEW.submitted_at)) THEN
    RAISE EXCEPTION 'Evidence document belongs to a different organization without a sharing grant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_evidence_submission_guard BEFORE INSERT ON qualification_evidence_submissions
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evidence_submission();

CREATE OR REPLACE FUNCTION v29_guard_evidence_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE sub record; auth record; owning_org uuid; independent_required boolean;
BEGIN
 NEW.reviewed_at:=clock_timestamp();
 SELECT s.submitted_by_person_id,a.applicant_organization_id,a.definition_id,
   q.evidence_standard
 INTO sub FROM qualification_evidence_submissions s
 JOIN qualification_applications a ON a.id=s.application_id
 JOIN qualification_requirements q ON q.id=s.requirement_id
 WHERE s.id=NEW.evidence_submission_id;
 PERFORM v29_assert_reviewer_permission(NEW.reviewer_authorization_id,
   sub.definition_id,NEW.reviewer_person_id,'review_evidence',NEW.reviewed_at);
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM qualification_evidence_review_decisions old
  WHERE old.id=NEW.supersedes_id AND old.evidence_submission_id=NEW.evidence_submission_id
  AND NOT EXISTS(SELECT 1 FROM qualification_evidence_review_decisions c WHERE c.supersedes_id=old.id)) THEN
    RAISE EXCEPTION 'Evidence re-review must supersede current review for this artifact'; END IF;
 IF NEW.supersedes_id IS NULL AND EXISTS(
   SELECT 1 FROM qualification_evidence_review_decisions r
   WHERE r.evidence_submission_id=NEW.evidence_submission_id) THEN
   RAISE EXCEPTION 'Repeated evidence reviews must explicitly supersede'; END IF;
 IF NEW.decision='accepted' THEN
   IF NEW.reviewer_person_id=sub.submitted_by_person_id THEN
    RAISE EXCEPTION 'Evidence submitter cannot independently accept their own evidence'; END IF;
   IF sub.evidence_standard='independent_verification' AND EXISTS(
    SELECT 1 FROM qualification_reviewer_authorizations auth
    WHERE auth.id=NEW.reviewer_authorization_id
      AND auth.reviewer_organization_id=sub.applicant_organization_id) THEN
    RAISE EXCEPTION 'Independent verification requires a reviewer authorized by another organization'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_evidence_review_guard BEFORE INSERT ON qualification_evidence_review_decisions
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evidence_review();

CREATE OR REPLACE FUNCTION v29_guard_evidence_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE app uuid; def uuid; contact uuid; old_requirement uuid; replacement_requirement uuid;
BEGIN
 SELECT s.application_id,s.requirement_id INTO app,old_requirement FROM qualification_evidence_submissions s WHERE s.id=NEW.evidence_submission_id;
 SELECT definition_id,contact_person_id INTO def,contact FROM qualification_applications WHERE id=app;
 NEW.effective_at:=clock_timestamp();
 IF NEW.recorded_by_person_id<>contact THEN
  PERFORM v29_assert_reviewer_permission(NEW.reviewer_authorization_id,def,NEW.recorded_by_person_id,'review_evidence',NEW.effective_at);
 END IF;
 IF NEW.replacement_submission_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM qualification_evidence_submissions s WHERE s.id=NEW.replacement_submission_id
   AND s.application_id=app AND s.requirement_id=old_requirement) THEN
    RAISE EXCEPTION 'Replacement evidence must belong to the same requirement and application'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_evidence_event_guard BEFORE INSERT ON qualification_evidence_events
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evidence_event();

CREATE OR REPLACE FUNCTION v29_check_evidence_current(submission_id uuid, as_of timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
 SELECT EXISTS(
   SELECT 1 FROM qualification_evidence_submissions s
   JOIN evidence_document_versions v ON v.id=s.evidence_version_id
   JOIN qualification_evidence_review_decisions r ON r.evidence_submission_id=s.id
   WHERE s.id=submission_id AND r.decision='accepted'
    AND r.reviewed_at<=as_of AND (r.valid_through IS NULL OR r.valid_through>as_of)
    AND (v.valid_from IS NULL OR v.valid_from<=as_of::date)
    AND (v.valid_through IS NULL OR v.valid_through>=as_of::date)
    AND NOT EXISTS(SELECT 1 FROM qualification_evidence_review_decisions later
       WHERE later.evidence_submission_id=s.id AND later.decision_order>r.decision_order
         AND later.reviewed_at<=as_of)
    AND NOT EXISTS(SELECT 1 FROM qualification_evidence_events x
       WHERE x.evidence_submission_id=s.id AND x.effective_at<=as_of)
 );
$$;

CREATE OR REPLACE FUNCTION v29_guard_exception() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE app record; req record;
BEGIN
 SELECT * INTO app FROM qualification_applications WHERE id=NEW.application_id;
 SELECT * INTO req FROM qualification_requirements WHERE id=NEW.requirement_id;
 IF req.definition_version_id<>app.definition_version_id OR NOT req.waiver_allowed THEN
   RAISE EXCEPTION 'Requirement cannot be waived for this application'; END IF;
 PERFORM v29_assert_reviewer_permission(NEW.reviewer_authorization_id,
  app.definition_id,NEW.approved_by_person_id,'approve_exception',NEW.decided_at);
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM qualification_requirement_exceptions old
  WHERE old.id=NEW.supersedes_id AND old.application_id=NEW.application_id
    AND old.requirement_id=NEW.requirement_id) THEN
   RAISE EXCEPTION 'Exception supersession must retain requirement and applicant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_exception_guard BEFORE INSERT ON qualification_requirement_exceptions
 FOR EACH ROW EXECUTE FUNCTION v29_guard_exception();

CREATE OR REPLACE FUNCTION v29_guard_evaluation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE app record; req record; exc record;
BEGIN
 NEW.evaluated_at:=clock_timestamp();
 SELECT * INTO app FROM qualification_applications WHERE id=NEW.application_id;
 SELECT * INTO req FROM qualification_requirements WHERE id=NEW.requirement_id;
 IF req.definition_version_id IS DISTINCT FROM app.definition_version_id THEN
  RAISE EXCEPTION 'Evaluation cannot reference a requirement from another qualification version'; END IF;
 PERFORM v29_assert_reviewer_permission(NEW.reviewer_authorization_id,
  app.definition_id,NEW.evaluated_by_person_id,'evaluate_requirement',NEW.evaluated_at);
 IF NEW.determination='satisfied' AND NEW.evaluated_by_person_id=app.contact_person_id THEN
  RAISE EXCEPTION 'Applicant cannot verify their own qualification requirement'; END IF;
 IF NEW.determination='waived' AND NOT EXISTS(
  SELECT 1 FROM qualification_requirement_exceptions x
  WHERE x.id=NEW.exception_id AND x.application_id=NEW.application_id
    AND x.requirement_id=NEW.requirement_id AND x.decision='approved'
    AND (x.valid_through IS NULL OR x.valid_through>NEW.evaluated_at)
    AND NOT EXISTS(SELECT 1 FROM qualification_requirement_exceptions newer
       WHERE newer.supersedes_id=x.id AND newer.decided_at<=NEW.evaluated_at)) THEN
  RAISE EXCEPTION 'Waiver requires approved current requirement-specific exception'; END IF;
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM qualification_requirement_evaluations old
   WHERE old.id=NEW.supersedes_id AND old.application_id=NEW.application_id
    AND old.requirement_id=NEW.requirement_id
    AND NOT EXISTS(SELECT 1 FROM qualification_requirement_evaluations newer
       WHERE newer.supersedes_id=old.id)) THEN
  RAISE EXCEPTION 'Requirement reevaluation must supersede latest matching evaluation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_requirement_evaluation_guard BEFORE INSERT ON qualification_requirement_evaluations
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evaluation();

CREATE OR REPLACE FUNCTION v29_guard_evaluation_answer() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE ev record; mapping record; response_id uuid; sub record;
BEGIN
 SELECT * INTO ev FROM qualification_requirement_evaluations WHERE id=NEW.evaluation_id;
 SELECT * INTO mapping FROM qualification_question_mappings WHERE id=NEW.question_mapping_id;
 SELECT * INTO sub FROM qualification_application_survey_submissions WHERE id=NEW.application_survey_submission_id;
 SELECT a.response_id INTO response_id FROM survey_answers a
  WHERE a.id=NEW.survey_answer_id AND a.question_id=NEW.question_id;
 IF ev.application_id IS DISTINCT FROM NEW.application_id
    OR ev.requirement_id IS DISTINCT FROM NEW.requirement_id
    OR mapping.requirement_id IS DISTINCT FROM NEW.requirement_id
    OR mapping.question_id IS DISTINCT FROM NEW.question_id
    OR sub.application_id IS DISTINCT FROM NEW.application_id
    OR sub.questionnaire_binding_id IS DISTINCT FROM mapping.questionnaire_binding_id
    OR sub.survey_response_id IS DISTINCT FROM response_id THEN
    RAISE EXCEPTION 'Qualification answer is outside the application, requirement or questionnaire'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_evaluation_answer_guard BEFORE INSERT ON qualification_evaluation_answers
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evaluation_answer();

CREATE OR REPLACE FUNCTION v29_guard_evaluation_evidence() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qualification_evidence_review_decisions r
  WHERE r.id=NEW.evidence_review_decision_id AND r.evidence_submission_id=NEW.evidence_submission_id) THEN
  RAISE EXCEPTION 'Linked evidence review does not belong to the linked artifact'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_evaluation_evidence_guard BEFORE INSERT ON qualification_evaluation_evidence
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evaluation_evidence();

CREATE OR REPLACE FUNCTION v29_requirement_applies(qid uuid, application_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE req record; app record; apply_count integer; matched_count integer; skipped boolean;
BEGIN
 SELECT audience INTO req FROM qualification_requirements WHERE id=qid;
 SELECT intended_population INTO app FROM qualification_applications WHERE id=application_id;
 IF req.audience='minors' AND app.intended_population='adults' THEN RETURN false; END IF;
 IF req.audience='adults' AND app.intended_population='minors' THEN RETURN false; END IF;
 -- On a conditional requirement, a selected option must be observable through an
 -- identified survey response explicitly bound to this applicant and template.
 SELECT count(*) FILTER(WHERE c.condition_kind='apply_if_selected'),
  count(*) FILTER(WHERE c.condition_kind='apply_if_selected' AND EXISTS(
    SELECT 1 FROM qualification_application_survey_submissions sub
    JOIN survey_answers ans ON ans.response_id=sub.survey_response_id AND ans.question_id=c.question_id
    JOIN survey_answer_choices choice ON choice.answer_id=ans.id AND choice.option_id=c.option_id
    WHERE sub.application_id=application_id
      AND NOT EXISTS(SELECT 1 FROM qualification_application_survey_submissions later
          WHERE later.supersedes_id=sub.id))),
  coalesce(bool_or(c.condition_kind='skip_if_selected' AND EXISTS(
    SELECT 1 FROM qualification_application_survey_submissions sub
    JOIN survey_answers ans ON ans.response_id=sub.survey_response_id AND ans.question_id=c.question_id
    JOIN survey_answer_choices choice ON choice.answer_id=ans.id AND choice.option_id=c.option_id
    WHERE sub.application_id=application_id
      AND NOT EXISTS(SELECT 1 FROM qualification_application_survey_submissions later
          WHERE later.supersedes_id=sub.id))),false)
 INTO apply_count,matched_count,skipped
 FROM qualification_requirement_conditions c WHERE c.requirement_id=qid;
 RETURN NOT skipped AND apply_count=matched_count;
END $$;

-- At commit, a satisfied requirement must actually cite specific answers or verified evidence.
-- The linked review must be the current accepted review and its document must be in date.
CREATE OR REPLACE FUNCTION v29_evaluation_evidence_gate() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE req record; app record; spec record; accepted_count integer; evidence_found boolean;
BEGIN
 IF NEW.determination<>'satisfied' THEN RETURN NULL; END IF;
 SELECT * INTO req FROM qualification_requirements WHERE id=NEW.requirement_id;
 SELECT * INTO app FROM qualification_applications WHERE id=NEW.application_id;
 IF NOT v29_requirement_applies(NEW.requirement_id,NEW.application_id) THEN
   RAISE EXCEPTION 'Inapplicable requirement cannot be marked satisfied'; END IF;
 SELECT EXISTS(SELECT 1 FROM qualification_evaluation_answers a
  WHERE a.evaluation_id=NEW.id) OR EXISTS(SELECT 1 FROM qualification_evaluation_evidence e
  WHERE e.evaluation_id=NEW.id) OR EXISTS(SELECT 1 FROM qualification_evaluation_facility_verifications f
  WHERE f.evaluation_id=NEW.id) OR EXISTS(SELECT 1 FROM qualification_evaluation_control_verifications c
  WHERE c.evaluation_id=NEW.id) INTO evidence_found;
 IF NOT evidence_found THEN
  RAISE EXCEPTION 'Satisfied qualification requirements must cite explicit supporting evidence or responses'; END IF;
 IF req.evidence_standard='self_report' THEN RETURN NULL; END IF;
 -- Every mandatory evidence type must have enough current, accepted, independently
 -- reviewed artifacts. Multiple files can be used to meet one requirement.
 FOR spec IN SELECT * FROM qualification_evidence_requirements
   WHERE requirement_id=req.id AND mandatory LOOP
  SELECT count(DISTINCT e.evidence_submission_id) INTO accepted_count
  FROM qualification_evaluation_evidence e
  JOIN qualification_evidence_submissions sub ON sub.id=e.evidence_submission_id
  JOIN qualification_evidence_review_decisions r ON r.id=e.evidence_review_decision_id
  JOIN evidence_document_versions dv ON dv.id=sub.evidence_version_id
  WHERE e.evaluation_id=NEW.id AND sub.evidence_requirement_id=spec.id
    AND r.decision='accepted' AND r.reviewed_at<=NEW.evaluated_at
    AND (spec.validity_days IS NULL OR sub.submitted_at>=NEW.evaluated_at-
           make_interval(days=>spec.validity_days))
    AND v29_check_evidence_current(sub.id,NEW.evaluated_at);
  IF accepted_count<spec.minimum_accepted_items THEN
   RAISE EXCEPTION 'Required document evidence is missing, expired or unverified for %',spec.evidence_type_code;
  END IF;
 END LOOP;
 IF req.evidence_standard='independent_verification' AND NOT EXISTS(
   SELECT 1 FROM qualification_evaluation_evidence e
   JOIN qualification_evidence_submissions s ON s.id=e.evidence_submission_id
   JOIN qualification_evidence_review_decisions r ON r.id=e.evidence_review_decision_id
   JOIN qualification_reviewer_authorizations a ON a.id=r.reviewer_authorization_id
   WHERE e.evaluation_id=NEW.id AND r.decision='accepted'
     AND a.reviewer_organization_id<>app.applicant_organization_id
     AND v29_check_evidence_current(s.id,NEW.evaluated_at)
 ) AND NOT EXISTS(
   SELECT 1 FROM qualification_evaluation_facility_verifications link
   JOIN site_space_capability_verifications verify ON verify.id=link.verification_id
   WHERE link.evaluation_id=NEW.id AND verify.result='verified'
     AND verify.verifier_person_id<>app.contact_person_id
     AND verify.verifier_organization_id<>app.applicant_organization_id
     AND (verify.expires_at IS NULL OR verify.expires_at>NEW.evaluated_at)
 ) THEN
   RAISE EXCEPTION 'Independent verification has not been established'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER q_evaluation_evidence_gate
 AFTER INSERT ON qualification_requirement_evaluations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v29_evaluation_evidence_gate();

CREATE OR REPLACE FUNCTION v29_guard_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE app record; def record;
BEGIN
 NEW.decided_at:=clock_timestamp();
 SELECT * INTO app FROM qualification_applications WHERE id=NEW.application_id;
 SELECT * INTO def FROM qualification_definition_versions WHERE id=app.definition_version_id;
 IF app.status IS DISTINCT FROM 'submitted' THEN
   RAISE EXCEPTION 'Qualification decision requires an actually submitted application'; END IF;
 IF def.lifecycle<>'published' THEN RAISE EXCEPTION 'Qualification decision needs published definition'; END IF;
 PERFORM v29_assert_reviewer_permission(NEW.reviewer_authorization_id,
   app.definition_id,NEW.decided_by_person_id,'decide_qualification',NEW.decided_at);
 IF app.contact_person_id=NEW.decided_by_person_id THEN
  RAISE EXCEPTION 'Applicant cannot approve their own qualification'; END IF;
 IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM qualification_decisions old WHERE old.id=NEW.supersedes_id
   AND old.application_id=NEW.application_id
   AND NOT EXISTS(SELECT 1 FROM qualification_decisions newer WHERE newer.supersedes_id=old.id)) THEN
    RAISE EXCEPTION 'Decision correction must supersede the latest decision for this application'; END IF;
 IF NEW.supersedes_id IS NULL AND EXISTS(
    SELECT 1 FROM qualification_decisions d WHERE d.application_id=NEW.application_id) THEN
    RAISE EXCEPTION 'Subsequent qualification decisions must supersede prior decision'; END IF;
 IF NEW.decision_stage='verified' AND def.validity_days IS NOT NULL
    AND (NEW.valid_through IS NULL OR NEW.valid_through>
        NEW.valid_from+make_interval(days=>def.validity_days)) THEN
     NEW.valid_through:=NEW.valid_from+make_interval(days=>def.validity_days);
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_decision_guard BEFORE INSERT ON qualification_decisions
 FOR EACH ROW EXECUTE FUNCTION v29_guard_decision();

CREATE OR REPLACE FUNCTION v29_decision_gate() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE app record; q record; ev record; snapshot record; conditions_count integer;
        satisfied_count integer; problem_count integer:=0; blocking_count integer:=0;
BEGIN
 IF NEW.decision_stage='screening' THEN
   -- Do not present a qualification as formally verified from self-report alone.
   IF NOT EXISTS(SELECT 1 FROM qualification_application_survey_submissions s
        WHERE s.application_id=NEW.application_id)
   AND NOT EXISTS(SELECT 1 FROM qualification_requirement_evaluations e
        WHERE e.application_id=NEW.application_id) THEN
     RAISE EXCEPTION 'Preliminary candidacy requires actual application assertions'; END IF;
   RETURN NULL;
 END IF;
 IF NEW.outcome='not_qualified' THEN RETURN NULL; END IF;
 SELECT * INTO app FROM qualification_applications WHERE id=NEW.application_id;
 IF EXISTS(SELECT 1 FROM qualification_template_withdrawals w
    WHERE w.definition_version_id=app.definition_version_id AND w.effective_at<=NEW.decided_at) THEN
    RAISE EXCEPTION 'Withdrawn qualification version cannot support new positive qualification'; END IF;
 FOR q IN SELECT * FROM qualification_requirements
   WHERE definition_version_id=app.definition_version_id AND importance IN ('blocking','required') LOOP
  IF NOT v29_requirement_applies(q.id,NEW.application_id) THEN CONTINUE; END IF;
  SELECT e.* INTO ev FROM qualification_requirement_evaluations e
   WHERE e.application_id=NEW.application_id AND e.requirement_id=q.id
    AND e.evaluated_at<=NEW.decided_at ORDER BY e.decision_order DESC LIMIT 1;
  SELECT * INTO snapshot FROM qualification_decision_requirements s
   WHERE s.decision_id=NEW.id AND s.requirement_id=q.id;
  IF NOT FOUND OR snapshot.evaluation_id IS DISTINCT FROM ev.id THEN
    RAISE EXCEPTION 'Final qualification must pin current evaluation for requirement %',q.requirement_code; END IF;
  IF ev.determination='satisfied' AND (ev.valid_through IS NULL OR ev.valid_through>NEW.decided_at)
   AND NOT EXISTS(SELECT 1 FROM qualification_evaluation_evidence ee
     WHERE ee.evaluation_id=ev.id AND NOT v29_check_evidence_current(ee.evidence_submission_id,NEW.decided_at)) THEN
   CONTINUE;
  ELSIF ev.determination='waived' AND q.waiver_allowed
   AND EXISTS(SELECT 1 FROM qualification_requirement_exceptions x
      WHERE x.id=ev.exception_id AND x.decision='approved'
       AND (x.valid_through IS NULL OR x.valid_through>NEW.decided_at)) THEN
    CONTINUE;
  ELSE
   IF q.importance='blocking' THEN blocking_count:=blocking_count+1;
   ELSE problem_count:=problem_count+1; END IF;
   IF NEW.outcome='qualified_with_conditions' AND q.importance='required'
      AND NOT EXISTS(SELECT 1 FROM qualification_conditions c
       WHERE c.decision_id=NEW.id AND c.requirement_id=q.id) THEN
     RAISE EXCEPTION 'Conditional qualification must state the unresolved requirement and remediation'; END IF;
  END IF;
 END LOOP;
 IF blocking_count>0 THEN
  RAISE EXCEPTION 'Blocking qualification requirements are not satisfied'; END IF;
 IF NEW.outcome='qualified' AND problem_count>0 THEN
  RAISE EXCEPTION 'Unmet required qualifications cannot receive unconditional approval'; END IF;
 IF NEW.outcome='qualified_with_conditions' AND problem_count=0 THEN
  RAISE EXCEPTION 'Conditional approval must have an identified outstanding requirement'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER q_decision_gate
 AFTER INSERT ON qualification_decisions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION v29_decision_gate();

-- Decision validity is computed, never inferred simply from a status string.
-- This function is for point-in-time operational preflight; the authoritative
-- decision and its exact reviewed evidence remain separate immutable records.
CREATE OR REPLACE FUNCTION v29_qualification_decision_is_current(did uuid, at_time timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE d record; appl record;
BEGIN
 SELECT * INTO d FROM qualification_decisions WHERE id=did;
 IF d.id IS NULL OR d.decision_stage<>'verified' OR d.outcome<>'qualified'
 OR d.valid_from>at_time OR (d.valid_through IS NOT NULL AND d.valid_through<=at_time) THEN
   RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM qualification_decisions successor
  WHERE successor.supersedes_id=d.id AND successor.decided_at<=at_time) THEN RETURN false; END IF;
 SELECT * INTO appl FROM qualification_applications WHERE id=d.application_id;
 IF appl.status IS NULL OR appl.status='withdrawn' THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM qualification_template_withdrawals w
    WHERE w.definition_version_id=appl.definition_version_id AND w.effective_at<=at_time) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM qualification_decision_requirements snapshot
  JOIN qualification_requirement_evaluations ev ON ev.id=snapshot.evaluation_id
  WHERE snapshot.decision_id=d.id
    AND ((ev.valid_through IS NOT NULL AND ev.valid_through<=at_time)
      OR EXISTS(SELECT 1 FROM qualification_requirement_evaluations newer
         WHERE newer.supersedes_id=ev.id AND newer.evaluated_at<=at_time)
      OR EXISTS(SELECT 1 FROM qualification_evaluation_evidence ee
         WHERE ee.evaluation_id=ev.id
          AND NOT v29_check_evidence_current(ee.evidence_submission_id,at_time)))) THEN RETURN false; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION v29_guard_operational_gate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE gate record; qualified_site uuid; checked_sites integer; expected_sites integer;
BEGIN
 IF NEW.decision<>'approved' THEN RETURN NEW; END IF;
 FOR gate IN SELECT g.*,d.operation_id AS gate_operation_id
  FROM qualification_operational_gates g
  JOIN program_deployments d ON d.id=g.deployment_id
  WHERE g.stage_code=NEW.stage_code AND g.blocking
    AND (g.deployment_id=NEW.deployment_id OR (NEW.operation_id IS NOT NULL
      AND d.operation_id=NEW.operation_id))
    AND g.valid_from<=NEW.decided_at
    AND (g.valid_through IS NULL OR g.valid_through>NEW.decided_at)
 LOOP
  IF gate.subject_kind='site' THEN
   SELECT count(DISTINCT ds.site_id) INTO expected_sites FROM deployment_sites ds
      WHERE ds.deployment_id=gate.deployment_id
        AND (NEW.site_id IS NULL OR ds.site_id=NEW.site_id);
   SELECT count(DISTINCT ds.site_id) INTO checked_sites FROM deployment_sites ds
    WHERE ds.deployment_id=gate.deployment_id
       AND (NEW.site_id IS NULL OR ds.site_id=NEW.site_id)
       AND EXISTS(SELECT 1 FROM qualification_decisions qd
        JOIN qualification_applications app ON app.id=qd.application_id
        JOIN qualification_subjects sub ON sub.id=app.subject_id
        LEFT JOIN qualification_proposed_sites p ON p.id=sub.proposed_site_id
        WHERE app.definition_id=gate.definition_id
          AND app.definition_version_id=gate.definition_version_id
          AND (sub.site_id=ds.site_id OR p.linked_site_id=ds.site_id)
          AND v29_qualification_decision_is_current(qd.id,NEW.decided_at));
   IF expected_sites=0 OR checked_sites<>expected_sites THEN
      RAISE EXCEPTION 'Verified site qualification missing for one or more deployment sites'; END IF;
  ELSE
   IF NOT EXISTS(SELECT 1 FROM qualification_decisions qd
     JOIN qualification_applications app ON app.id=qd.application_id
     JOIN qualification_subjects sub ON sub.id=app.subject_id
     WHERE app.definition_id=gate.definition_id
      AND app.definition_version_id=gate.definition_version_id
      AND sub.organization_id=NEW.authority_organization_id
      AND v29_qualification_decision_is_current(qd.id,NEW.decided_at)) THEN
     RAISE EXCEPTION 'Organization qualification missing for operational authorization'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER qualification_authorization_preflight
 BEFORE INSERT ON operational_authorization_decisions
 FOR EACH ROW EXECUTE FUNCTION v29_guard_operational_gate();

CREATE OR REPLACE FUNCTION v29_queue_qualification_reassessment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE app uuid;
BEGIN
 IF TG_TABLE_NAME='qualification_evidence_events' THEN
   SELECT application_id INTO app FROM qualification_evidence_submissions WHERE id=NEW.evidence_submission_id;
   INSERT INTO qualification_reassessment_requests(application_id,basis,trigger_evidence_submission_id,requested_by_person_id,request_details)
   VALUES(app,CASE WHEN NEW.event_kind='revoked' THEN 'evidence_revoked' ELSE 'requested' END,
          NEW.evidence_submission_id,NEW.recorded_by_person_id,NEW.reason);
 ELSIF TG_TABLE_NAME='qualification_evidence_review_decisions' THEN
   IF NEW.supersedes_id IS NOT NULL AND NEW.decision IN ('rejected','revoked') AND EXISTS(
     SELECT 1 FROM qualification_evidence_review_decisions old
     WHERE old.id=NEW.supersedes_id AND old.decision='accepted') THEN
      SELECT application_id INTO app FROM qualification_evidence_submissions
       WHERE id=NEW.evidence_submission_id;
      INSERT INTO qualification_reassessment_requests(application_id,basis,
        trigger_evidence_submission_id,requested_by_person_id,request_details)
      VALUES(app,'evidence_revoked',NEW.evidence_submission_id,
        NEW.reviewer_person_id,'Previously accepted evidence was reversed');
   END IF;
 ELSIF TG_TABLE_NAME='qualification_requirement_evaluations' THEN
   IF NEW.supersedes_id IS NOT NULL THEN
     INSERT INTO qualification_reassessment_requests(application_id,basis,requested_by_person_id,request_details)
     VALUES(NEW.application_id,'finding',NEW.evaluated_by_person_id,'Requirement reevaluated');
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_evidence_change_reassess AFTER INSERT ON qualification_evidence_events
 FOR EACH ROW EXECUTE FUNCTION v29_queue_qualification_reassessment();
CREATE TRIGGER q_evaluation_change_reassess AFTER INSERT ON qualification_requirement_evaluations
 FOR EACH ROW EXECUTE FUNCTION v29_queue_qualification_reassessment();

-- Decisions and evidence history are immutable; a correction always appends a new event.
CREATE TRIGGER q_review_append_only BEFORE UPDATE OR DELETE ON qualification_template_reviews
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_evidence_submissions_append_only BEFORE UPDATE OR DELETE ON qualification_evidence_submissions
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_evidence_reviews_append_only BEFORE UPDATE OR DELETE ON qualification_evidence_review_decisions
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_evidence_review_reassessment AFTER INSERT ON qualification_evidence_review_decisions
 FOR EACH ROW EXECUTE FUNCTION v29_queue_qualification_reassessment();
CREATE TRIGGER q_evidence_events_append_only BEFORE UPDATE OR DELETE ON qualification_evidence_events
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_requirement_evaluations_append_only BEFORE UPDATE OR DELETE ON qualification_requirement_evaluations
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_decisions_append_only BEFORE UPDATE OR DELETE ON qualification_decisions
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_requirement_exceptions_append_only BEFORE UPDATE OR DELETE ON qualification_requirement_exceptions
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_template_withdrawals_append_only BEFORE UPDATE OR DELETE ON qualification_template_withdrawals
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_survey_submission_append_only BEFORE UPDATE OR DELETE ON qualification_application_survey_submissions
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_decision_requirement_append_only BEFORE UPDATE OR DELETE ON qualification_decision_requirements
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_evaluation_evidence_append_only BEFORE UPDATE OR DELETE ON qualification_evaluation_evidence
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_conditions_append_only BEFORE UPDATE OR DELETE ON qualification_conditions
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_evaluation_answers_append_only BEFORE UPDATE OR DELETE ON qualification_evaluation_answers
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
CREATE TRIGGER q_evidence_types_append_only BEFORE UPDATE OR DELETE ON qualification_evidence_types
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

-- Qualification applications are private. No generic public or network-level access.
DO $v29_secure$
DECLARE item record;
BEGIN
 FOR item IN SELECT table_name FROM information_schema.tables
  WHERE table_schema='education_v30' AND table_type='BASE TABLE'
  AND table_name LIKE 'qualification_%' LOOP
  EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',item.table_name);
  EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',item.table_name);
 END LOOP;
END $v29_secure$;

CREATE POLICY qualification_applicant_read ON qualification_applications FOR SELECT
 USING (v28_role_can_access_org(applicant_organization_id,'qualification_application'));
CREATE POLICY qualification_applicant_subject_read ON qualification_subjects FOR SELECT
 USING (v28_role_can_access_org(applicant_organization_id,'qualification_application'));
CREATE POLICY qualification_applicant_requests_read ON qualification_evidence_requests FOR SELECT
 USING (EXISTS(SELECT 1 FROM qualification_applications a WHERE a.id=application_id
  AND v28_role_can_access_org(a.applicant_organization_id,'qualification_application')));
-- The above policies are only a narrow example. Authorized reviewer services,
-- answer-level document access, safeguarding and cross-tenant tests remain P0.

-- Add indexes for all NEW FKs, avoiding redundant existing prefixes.
DO $v29_fk_indexes$
DECLARE f record; cols text; idx text;
BEGIN
 FOR f IN SELECT c.oid,c.conrelid,c.conkey FROM pg_constraint c
 JOIN pg_namespace n ON n.oid=c.connamespace
 WHERE n.nspname IN ('education_v30','education_v30_secure') AND c.contype='f'
 LOOP
  IF EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=f.conrelid
   AND i.indisvalid AND i.indpred IS NULL AND i.indnkeyatts>=cardinality(f.conkey)
   AND (SELECT array_agg(i.indkey[x.i-1]::smallint ORDER BY x.i)
     FROM generate_series(1,cardinality(f.conkey)) x(i))=f.conkey) THEN CONTINUE; END IF;
  SELECT string_agg(quote_ident(a.attname),', ' ORDER BY x.ordinality) INTO cols
    FROM unnest(f.conkey) WITH ORDINALITY x(attnum,ordinality)
    JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=x.attnum;
  idx:=left('qfk_'||replace(f.conrelid::regclass::text,'education_v30.','')||'_'||f.oid::text,63);
  EXECUTE format('CREATE INDEX %I ON %s (%s)',idx,f.conrelid::regclass,cols);
 END LOOP;
END $v29_fk_indexes$;

COMMENT ON TABLE qualification_definitions IS 'Versioned configurable qualification definition. Site qualification is one seeded template, not hardcoded code.';
COMMENT ON TABLE qualification_question_mappings IS 'Maps existing published survey questions to independently evaluated requirements.';
COMMENT ON TABLE qualification_evidence_submissions IS 'A stored document version is submitted against a requirement; submission is not verification.';
COMMENT ON TABLE qualification_evidence_review_decisions IS 'Reviewer determines whether that specific artifact satisfies an evidence specification.';
COMMENT ON TABLE qualification_requirement_evaluations IS 'Append-only requirement-level academic or operational reviewer conclusion with source evidence.';
COMMENT ON TABLE qualification_decisions IS 'Qualification decision never independently grants operational authorization.';
COMMENT ON TABLE qualification_operational_gates IS 'Opt-in deployment gate that requires an effective verified qualification before a new operational stage authorization.';

-- 25. Final hardening: authorization scope, correct reviewer identity, and version-safe revocation.
CREATE OR REPLACE FUNCTION v29_guard_qualification_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE definition uuid;
BEGIN
 SELECT definition_id INTO definition FROM qualification_definition_versions
 WHERE id=NEW.definition_version_id AND lifecycle='published';
 IF definition IS NULL THEN RAISE EXCEPTION 'Only a published qualification version can be withdrawn'; END IF;
 NEW.effective_at:=clock_timestamp();
 PERFORM v29_assert_reviewer_permission(NEW.reviewer_authorization_id,definition,
   NEW.withdrawn_by_person_id,'decide_qualification',NEW.effective_at);
 RETURN NEW;
END $$;
CREATE TRIGGER qualification_withdrawal_scope BEFORE INSERT ON qualification_template_withdrawals
 FOR EACH ROW EXECUTE FUNCTION v29_guard_qualification_withdrawal();

CREATE OR REPLACE FUNCTION v29_guard_qualification_program_gate() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE operation uuid; actual_kind text;
BEGIN
 SELECT operation_id INTO operation FROM program_deployments WHERE id=NEW.deployment_id;
 SELECT subject_kind INTO actual_kind FROM qualification_definitions d WHERE d.id=NEW.definition_id;
 IF actual_kind IS DISTINCT FROM NEW.subject_kind THEN
    RAISE EXCEPTION 'Operational qualification gate subject differs from definition'; END IF;
 IF NOT EXISTS(SELECT 1 FROM education_operation_organization_roles o
   WHERE o.operation_id=operation AND o.organization_id=NEW.adopting_organization_id
     AND o.role_code='operator' AND o.status='approved' AND o.valid_from<=clock_timestamp()
     AND (o.valid_through IS NULL OR o.valid_through>clock_timestamp())) THEN
     RAISE EXCEPTION 'Only authorized operation owner can add a qualification gate'; END IF;
 IF NOT EXISTS(SELECT 1 FROM qualification_definition_versions v
   WHERE v.id=NEW.definition_version_id AND v.definition_id=NEW.definition_id AND v.lifecycle='published') THEN
   RAISE EXCEPTION 'Qualification gate must pin a published definition version'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER qualification_program_gate_scope BEFORE INSERT OR UPDATE ON qualification_operational_gates
 FOR EACH ROW EXECUTE FUNCTION v29_guard_qualification_program_gate();

CREATE OR REPLACE FUNCTION v29_guard_decision_condition() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE decision record; req record; app record;
BEGIN
 SELECT * INTO decision FROM qualification_decisions WHERE id=NEW.decision_id;
 SELECT * INTO req FROM qualification_requirements WHERE id=NEW.requirement_id;
 SELECT * INTO app FROM qualification_applications WHERE id=decision.application_id;
 IF decision.outcome<>'qualified_with_conditions' OR
   req.definition_version_id IS DISTINCT FROM app.definition_version_id OR
   NEW.created_by_person_id IS DISTINCT FROM decision.decided_by_person_id THEN
  RAISE EXCEPTION 'Conditions must belong to an authorized conditional qualification decision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_decision_condition_scope BEFORE INSERT ON qualification_conditions
 FOR EACH ROW EXECUTE FUNCTION v29_guard_decision_condition();

CREATE OR REPLACE FUNCTION v29_guard_evaluation_facility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE ev record; subject record; referenced_site uuid;
BEGIN
 SELECT * INTO ev FROM qualification_requirement_evaluations WHERE id=NEW.evaluation_id;
 SELECT s.* INTO subject FROM qualification_applications a
 JOIN qualification_subjects s ON s.id=a.subject_id WHERE a.id=ev.application_id;
 IF subject.site_id IS NOT NULL THEN referenced_site:=subject.site_id;
 ELSIF subject.proposed_site_id IS NOT NULL THEN
  SELECT linked_site_id INTO referenced_site FROM qualification_proposed_sites WHERE id=subject.proposed_site_id;
 ELSE RAISE EXCEPTION 'Facility verification is not linked to a site qualification'; END IF;
 IF referenced_site IS NULL OR NOT EXISTS(
  SELECT 1 FROM site_space_capability_verifications v
  JOIN site_space_capability_assertions assertion ON assertion.id=v.assertion_id
  JOIN site_spaces room ON room.id=assertion.space_id
  WHERE v.id=NEW.verification_id AND room.site_id=referenced_site AND v.result='verified') THEN
   RAISE EXCEPTION 'Facility evidence must be verified for the same physical site'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_eval_facility_scope BEFORE INSERT ON qualification_evaluation_facility_verifications
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evaluation_facility();

CREATE OR REPLACE FUNCTION v29_guard_evaluation_control() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE app record;
BEGIN
 SELECT a.* INTO app FROM qualification_requirement_evaluations ev
 JOIN qualification_applications a ON a.id=ev.application_id WHERE ev.id=NEW.evaluation_id;
 IF NOT EXISTS(SELECT 1 FROM control_evaluations e
  JOIN control_obligations o ON o.id=e.obligation_id
  WHERE e.id=NEW.control_evaluation_id AND e.determination='compliant'
     AND o.accountable_organization_id=app.applicant_organization_id) THEN
  RAISE EXCEPTION 'Qualification control evidence must be compliant and belong to the applicant'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_eval_control_scope BEFORE INSERT ON qualification_evaluation_control_verifications
 FOR EACH ROW EXECUTE FUNCTION v29_guard_evaluation_control();

CREATE TRIGGER qualification_person_consent_append_only BEFORE UPDATE OR DELETE ON qualification_person_consents
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();
-- A new consent row or separate withdrawal event replaces a prior consent.
CREATE INDEX qualification_req_by_version ON qualification_requirements(definition_version_id,importance);
CREATE INDEX qualification_evidence_by_version ON qualification_evidence_submissions(evidence_version_id,application_id);


-- 26. Preserved v2.9.1 answer guidance (survey/evidence system is unchanged).
CREATE TABLE qualification_answer_guidance_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 definition_version_id uuid NOT NULL,
 requirement_id uuid NOT NULL,
 question_mapping_id uuid NOT NULL,
 question_id uuid NOT NULL,
 option_id uuid NOT NULL,
 interpretation text NOT NULL CHECK (interpretation IN
  ('reported_sufficient','reported_gap','needs_confirmation','informational')),
 recommended_action text,
 resource_kind text,
 FOREIGN KEY(requirement_id,definition_version_id)
  REFERENCES qualification_requirements(id,definition_version_id),
 FOREIGN KEY(question_mapping_id,requirement_id,question_id)
  REFERENCES qualification_question_mappings(id,requirement_id,question_id),
 FOREIGN KEY(option_id,question_id) REFERENCES survey_question_options(id,question_id),
 UNIQUE(requirement_id,question_mapping_id,option_id)
);
-- Reuse the published-qualification immutability model; rules must be authored BEFORE publication.
CREATE OR REPLACE FUNCTION v291_guard_guidance_rules() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE version_id uuid;
BEGIN
 version_id:=CASE WHEN TG_OP='DELETE' THEN OLD.definition_version_id ELSE NEW.definition_version_id END;
 IF EXISTS(SELECT 1 FROM qualification_definition_versions WHERE id=version_id AND lifecycle='published') THEN
   RAISE EXCEPTION 'Published qualification guidance cannot change; publish a new definition version';
 END IF;
 IF TG_OP='UPDATE' AND OLD.definition_version_id<>NEW.definition_version_id THEN
  IF EXISTS(SELECT 1 FROM qualification_definition_versions WHERE id=OLD.definition_version_id AND lifecycle='published') THEN
   RAISE EXCEPTION 'Published qualification guidance cannot be moved'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER q_guidance_version_lock BEFORE INSERT OR UPDATE OR DELETE ON qualification_answer_guidance_rules
 FOR EACH ROW EXECUTE FUNCTION v291_guard_guidance_rules();

-- Derived from the applicant's actual submitted choices. No reviewer signoff is implied.
CREATE OR REPLACE FUNCTION v291_preliminary_guidance(target_application uuid)
RETURNS TABLE(requirement_id uuid, requirement_code text, question_id uuid, option_id uuid,
 interpretation text, recommended_action text, resource_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
 SELECT DISTINCT r.requirement_id, req.requirement_code, r.question_id, r.option_id,
        r.interpretation,r.recommended_action,r.resource_kind
 FROM qualification_applications a
 JOIN qualification_application_survey_submissions sub ON sub.application_id=a.id
 JOIN survey_answers ans ON ans.response_id=sub.survey_response_id
 JOIN survey_answer_choices choice ON choice.answer_id=ans.id
 JOIN qualification_answer_guidance_rules r ON r.definition_version_id=a.definition_version_id
   AND r.question_id=ans.question_id AND r.option_id=choice.option_id
 JOIN qualification_question_mappings map ON map.id=r.question_mapping_id
   AND map.question_id=ans.question_id AND map.questionnaire_binding_id=sub.questionnaire_binding_id
 JOIN qualification_requirements req ON req.id=r.requirement_id
 WHERE a.id=target_application AND a.status IN ('submitted','closed')
   AND (v28_role_can_access_org(a.applicant_organization_id,'qualification_application')
     OR v28_role_can_access_org(a.applicant_organization_id,'qualification_reviewer'))
 AND NOT EXISTS(SELECT 1 FROM qualification_application_survey_submissions later
   WHERE later.supersedes_id=sub.id);
$$;


-- Preserved cross-domain links to existing assurance and readiness models.
-- Explicit, permissioned connections to existing assurance, improvement and readiness domains.
-- Do NOT copy safety case contents into qualification or network reporting.
CREATE TABLE qualification_assurance_case_links (
 finding_id uuid NOT NULL REFERENCES qualification_findings(id),
 case_id uuid NOT NULL REFERENCES assurance_cases(id),
 linked_by_person_id uuid NOT NULL REFERENCES persons(id),
 link_reason text NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(finding_id,case_id)
);
CREATE TABLE qualification_readiness_review_links (
 application_id uuid NOT NULL REFERENCES qualification_applications(id),
 readiness_review_id uuid NOT NULL REFERENCES deployment_readiness_reviews(id),
 linked_by_person_id uuid NOT NULL REFERENCES persons(id),
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(application_id,readiness_review_id)
);
CREATE OR REPLACE FUNCTION v291_guard_readiness_link() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qualification_applications a
   JOIN deployment_readiness_reviews r ON r.id=NEW.readiness_review_id
   WHERE a.id=NEW.application_id AND a.intended_deployment_id=r.deployment_id) THEN
  RAISE EXCEPTION 'Qualification readiness link must concern its intended deployment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_readiness_link_scope BEFORE INSERT ON qualification_readiness_review_links
 FOR EACH ROW EXECUTE FUNCTION v291_guard_readiness_link();


CREATE INDEX q_guidance_definition_lookup ON qualification_answer_guidance_rules(definition_version_id,question_id,option_id);
CREATE INDEX q_assurance_case_lookup ON qualification_assurance_case_links(case_id);
CREATE INDEX q_readiness_review_lookup ON qualification_readiness_review_links(readiness_review_id);
DO $v292_retained_rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['qualification_answer_guidance_rules','qualification_assurance_case_links',
 'qualification_readiness_review_links'] LOOP
  EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $v292_retained_rls$;
COMMENT ON FUNCTION v291_preliminary_guidance(uuid) IS
 'Self-reported answer guidance only; no verified qualification and no operational authority.';
COMMENT ON TABLE qualification_assurance_case_links IS
 'Cross-domain reference without copying confidential assurance/safeguarding case contents.';

-- 27. Independent program-fit and program-catalog capabilities.


-- 27. v2.9.2 independent and versioned program-fit capability.
CREATE TABLE qualification_program_fit_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_organization_id uuid NOT NULL REFERENCES organizations(id),
 policy_code text NOT NULL, title text NOT NULL, description text,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','retired')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(owner_organization_id,policy_code), UNIQUE(id,owner_organization_id)
);

-- A policy is an independently versioned recipe, not a subsection of the site questionnaire.
CREATE TABLE qualification_program_fit_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_id uuid NOT NULL REFERENCES qualification_program_fit_policies(id),
 version_no integer NOT NULL CHECK(version_no>0),
 supersedes_id uuid UNIQUE REFERENCES qualification_program_fit_policy_versions(id),
 blueprint_component_id uuid REFERENCES blueprint_components(id),
 offering_version_id uuid REFERENCES offering_versions(id),
 intended_population text NOT NULL DEFAULT 'any' CHECK(intended_population IN ('any','adults','minors','mixed')),
 delivery_context text CHECK(delivery_context IN ('remote','onsite','hybrid')),
 created_by_person_id uuid NOT NULL REFERENCES persons(id),
 lifecycle text NOT NULL DEFAULT 'draft' CHECK(lifecycle IN ('draft','published')),
 published_at timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(blueprint_component_id,offering_version_id)=1),
 CHECK((lifecycle='published')=(published_at IS NOT NULL)),
 UNIQUE(policy_id,version_no), UNIQUE(id,policy_id),
 CHECK(supersedes_id IS DISTINCT FROM id)
);
CREATE TABLE qualification_program_fit_policy_version_withdrawals (
 policy_version_id uuid PRIMARY KEY REFERENCES qualification_program_fit_policy_versions(id),
 withdrawn_by_person_id uuid NOT NULL REFERENCES persons(id),
 reason text NOT NULL,
 evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 effective_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Each requirement can reuse ANOTHER qualification definition's requirement, a verified
-- facility capability, or a new program criterion. Nothing requires one survey version.
CREATE TABLE qualification_program_fit_policy_requirements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_version_id uuid NOT NULL REFERENCES qualification_program_fit_policy_versions(id),
 requirement_code text NOT NULL, title text NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN ('qualification_requirement','site_capability','program_criterion')),
 qualification_requirement_id uuid REFERENCES qualification_requirements(id),
 facility_capability_code text REFERENCES facility_capability_types(code),
 criterion_text text,
 importance text NOT NULL DEFAULT 'required' CHECK(importance IN ('blocking','required','advisory')),
 evidence_standard text NOT NULL DEFAULT 'self_report'
   CHECK(evidence_standard IN ('self_report','document_review','independent_verification')),
 audience text NOT NULL DEFAULT 'any' CHECK(audience IN ('any','adults','minors')),
 resource_kind text, minimum_quantity numeric(14,3) CHECK(minimum_quantity IS NULL OR minimum_quantity>=0),
 remediation_guidance text,
 CHECK((source_kind='qualification_requirement' AND qualification_requirement_id IS NOT NULL
        AND facility_capability_code IS NULL AND criterion_text IS NULL)
    OR (source_kind='site_capability' AND qualification_requirement_id IS NULL
        AND facility_capability_code IS NOT NULL AND criterion_text IS NULL)
    OR (source_kind='program_criterion' AND qualification_requirement_id IS NULL
        AND facility_capability_code IS NULL AND criterion_text IS NOT NULL)),
 UNIQUE(policy_version_id,requirement_code), UNIQUE(id,policy_version_id)
);

-- Controlled program-availability intelligence. This reports eligibility research,
-- NOT state licensure or an operational authorization. Missing rules = unknown.
CREATE TABLE qualification_program_availability_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_version_id uuid NOT NULL REFERENCES qualification_program_fit_policy_versions(id),
 geographic_area_id uuid REFERENCES geographic_areas(id),
 availability_basis text NOT NULL DEFAULT 'regulatory'
  CHECK(availability_basis IN ('provider_support','regulatory')),
 delivery_context text CHECK(delivery_context IN ('remote','onsite','hybrid')),
 availability text NOT NULL CHECK(availability IN ('possible','conditional','unavailable','requires_research')),
 reasoning text NOT NULL,
 source_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 reviewed_by_person_id uuid NOT NULL REFERENCES persons(id),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 valid_through timestamptz,
 CHECK(valid_through IS NULL OR valid_through>reviewed_at)
);
CREATE UNIQUE INDEX q_v292_availability_scope_unique ON qualification_program_availability_rules
 (policy_version_id,availability_basis,geographic_area_id,delivery_context) NULLS NOT DISTINCT;

CREATE OR REPLACE FUNCTION v292_guard_fit_template() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE vid uuid; prior_vid uuid;
BEGIN
 IF TG_TABLE_NAME='qualification_program_fit_policy_versions' THEN
  IF TG_OP='DELETE' THEN
    IF OLD.lifecycle='published' THEN RAISE EXCEPTION 'Published fit policy version is immutable'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
   IF OLD.lifecycle='published' THEN RAISE EXCEPTION 'Publish a new version instead of changing an approved fit policy'; END IF;
   IF ROW(OLD.policy_id,OLD.version_no,OLD.supersedes_id,OLD.blueprint_component_id,OLD.offering_version_id,
          OLD.intended_population,OLD.delivery_context,OLD.created_by_person_id)
      IS DISTINCT FROM ROW(NEW.policy_id,NEW.version_no,NEW.supersedes_id,NEW.blueprint_component_id,NEW.offering_version_id,
          NEW.intended_population,NEW.delivery_context,NEW.created_by_person_id) THEN
     RAISE EXCEPTION 'Version identity cannot change'; END IF;
  END IF;
  IF NEW.lifecycle='published' THEN
   IF EXISTS(SELECT 1 FROM qualification_program_fit_policies p
      WHERE p.id=NEW.policy_id AND p.status='retired') THEN
     RAISE EXCEPTION 'Cannot publish versions of retired policies'; END IF;
   IF NEW.supersedes_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM qualification_program_fit_policy_versions prior
      WHERE prior.id=NEW.supersedes_id AND prior.policy_id=NEW.policy_id
        AND prior.version_no<NEW.version_no AND prior.lifecycle='published') THEN
      RAISE EXCEPTION 'Superseded fit policy must be an earlier published version'; END IF;
   IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
     WHERE w.policy_version_id=NEW.id) THEN
      RAISE EXCEPTION 'Withdrawn fit policy cannot be republished'; END IF;
   IF NOT EXISTS(SELECT 1 FROM qualification_program_fit_policy_requirements
      WHERE policy_version_id=NEW.id AND importance IN ('required','blocking')) THEN
     RAISE EXCEPTION 'Published policy must contain a required or blocking criterion'; END IF;
   IF NOT EXISTS(SELECT 1 FROM qualification_program_availability_rules
      WHERE policy_version_id=NEW.id AND availability_basis='regulatory'
       AND (NEW.delivery_context IS NULL OR delivery_context IS NULL OR delivery_context=NEW.delivery_context))
     OR NOT EXISTS(SELECT 1 FROM qualification_program_availability_rules
      WHERE policy_version_id=NEW.id AND availability_basis='provider_support'
       AND (NEW.delivery_context IS NULL OR delivery_context IS NULL OR delivery_context=NEW.delivery_context)) THEN
     RAISE EXCEPTION 'Published policy must define reviewed geographic/delivery availability'; END IF;
   IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_requirements x
     JOIN qualification_requirements qr ON qr.id=x.qualification_requirement_id
     JOIN qualification_definition_versions dv ON dv.id=qr.definition_version_id
     WHERE x.policy_version_id=NEW.id AND x.source_kind='qualification_requirement'
       AND dv.lifecycle<>'published') THEN
     RAISE EXCEPTION 'A fit policy cannot depend on an unpublished qualification requirement'; END IF;
   IF NEW.offering_version_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM offering_versions WHERE id=NEW.offering_version_id AND lifecycle='published') THEN
     RAISE EXCEPTION 'Fit policy must reference a published offering version'; END IF;
   IF NEW.blueprint_component_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM blueprint_components c JOIN blueprint_versions v ON v.id=c.blueprint_version_id
      WHERE c.id=NEW.blueprint_component_id AND v.lifecycle='published') THEN
     RAISE EXCEPTION 'Fit policy must reference a published blueprint component'; END IF;
  END IF;
  RETURN NEW;
 END IF;
 vid:=CASE WHEN TG_OP='DELETE' THEN OLD.policy_version_id ELSE NEW.policy_version_id END;
 IF TG_OP='UPDATE' THEN
  prior_vid:=OLD.policy_version_id;
  IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_versions
      WHERE id=prior_vid AND lifecycle='published') THEN
    RAISE EXCEPTION 'Published program-fit policy contents are immutable'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_versions
      WHERE id=vid AND lifecycle='published') THEN
   RAISE EXCEPTION 'Published program-fit policy contents are immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER q_v292_version_guard BEFORE INSERT OR UPDATE OR DELETE ON qualification_program_fit_policy_versions
 FOR EACH ROW EXECUTE FUNCTION v292_guard_fit_template();
CREATE TRIGGER q_v292_requirement_guard BEFORE INSERT OR UPDATE OR DELETE ON qualification_program_fit_policy_requirements
 FOR EACH ROW EXECUTE FUNCTION v292_guard_fit_template();
CREATE TRIGGER q_v292_availability_guard BEFORE INSERT OR UPDATE OR DELETE ON qualification_program_availability_rules
 FOR EACH ROW EXECUTE FUNCTION v292_guard_fit_template();

CREATE OR REPLACE FUNCTION v30_guard_fit_policy_withdrawal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qualification_program_fit_policy_versions v
   JOIN qualification_program_fit_policies p ON p.id=v.policy_id
   JOIN evidence_documents e ON e.owning_organization_id=p.owner_organization_id
   JOIN evidence_document_versions ev ON ev.document_id=e.id
   WHERE v.id=NEW.policy_version_id AND v.lifecycle='published'
    AND ev.id=NEW.evidence_version_id) THEN
     RAISE EXCEPTION 'Fit policy withdrawal must cite evidence owned by the policy steward'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_v30_fit_withdrawal_guard BEFORE INSERT ON qualification_program_fit_policy_version_withdrawals
 FOR EACH ROW EXECUTE FUNCTION v30_guard_fit_policy_withdrawal();
CREATE TRIGGER q_v30_fit_withdrawal_immutable BEFORE UPDATE OR DELETE ON qualification_program_fit_policy_version_withdrawals
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

-- 27b. A facility application is one source of evidence, but a program assessment can
-- additionally reuse requirement evaluations from other applications for the SAME subject.
CREATE TABLE qualification_program_fit_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 subject_id uuid NOT NULL REFERENCES qualification_subjects(id),
 base_application_id uuid NOT NULL REFERENCES qualification_applications(id),
 policy_version_id uuid NOT NULL REFERENCES qualification_program_fit_policy_versions(id),
 deployment_id uuid REFERENCES program_deployments(id),
 geographic_area_id uuid REFERENCES geographic_areas(id),
 participant_population text NOT NULL DEFAULT 'unknown'
  CHECK(participant_population IN ('unknown','adults','minors','mixed')),
 population_evidence_version_id uuid REFERENCES evidence_document_versions(id),
 delivery_context text NOT NULL CHECK(delivery_context IN ('remote','onsite','hybrid')),
 expected_concurrent_learners integer CHECK(expected_concurrent_learners IS NULL OR expected_concurrent_learners>=0),
 created_by_person_id uuid NOT NULL REFERENCES persons(id),
 assessed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,policy_version_id), UNIQUE(id,subject_id)
);
CREATE OR REPLACE FUNCTION v292_guard_fit_assessment() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE v record; a record; s record; target_offering uuid; actual_geography uuid; target_operation uuid;
BEGIN
 SELECT * INTO v FROM qualification_program_fit_policy_versions WHERE id=NEW.policy_version_id;
 SELECT * INTO a FROM qualification_applications WHERE id=NEW.base_application_id;
 SELECT * INTO s FROM qualification_subjects WHERE id=NEW.subject_id;
 IF v.lifecycle<>'published' OR EXISTS(SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
    WHERE w.policy_version_id=v.id AND w.effective_at<=NEW.assessed_at)
  OR a.status NOT IN ('submitted','closed')
    OR a.subject_id IS DISTINCT FROM NEW.subject_id THEN
   RAISE EXCEPTION 'Fit assessment needs a published policy and submitted application for the same subject'; END IF;
 IF NEW.participant_population<>'unknown' AND NOT EXISTS(
   SELECT 1 FROM evidence_document_versions ev
   WHERE ev.id=NEW.population_evidence_version_id AND ev.verified_at IS NOT NULL
      AND ev.verified_by_person_id IS NOT NULL
      AND (ev.valid_through IS NULL OR ev.valid_through>=NEW.assessed_at::date)) THEN
   RAISE EXCEPTION 'Known participant population requires independently verified evidence'; END IF;
 IF v.intended_population<>'any' AND NEW.participant_population NOT IN ('unknown',v.intended_population) THEN
   RAISE EXCEPTION 'Participant population is not served by this published fit policy'; END IF;
 IF v.delivery_context IS NOT NULL AND v.delivery_context<>NEW.delivery_context THEN
   RAISE EXCEPTION 'Delivery context does not match fit policy'; END IF;
 IF v.intended_population<>'any' AND a.intended_population<>'any' AND a.intended_population<>v.intended_population
    AND NOT (v.intended_population='minors' AND a.intended_population='mixed')
    AND NOT (v.intended_population='adults' AND a.intended_population='mixed') THEN
   RAISE EXCEPTION 'Intended participant population is not covered by fit policy'; END IF;
 -- A live site's known geography cannot be misrepresented in a program-fit assessment.
 IF s.site_id IS NOT NULL THEN
   SELECT geographic_area_id INTO actual_geography FROM sites WHERE id=s.site_id;
   IF actual_geography IS NOT NULL AND NEW.geographic_area_id IS DISTINCT FROM actual_geography THEN
     RAISE EXCEPTION 'Fit assessment geography must match the established site'; END IF;
 END IF;
 IF NEW.deployment_id IS NOT NULL THEN
   SELECT offering_id,operation_id INTO target_offering,target_operation FROM program_deployments
     WHERE id=NEW.deployment_id;
   IF NOT EXISTS(SELECT 1 FROM education_operation_organization_roles role
     WHERE role.operation_id=target_operation AND role.organization_id=s.applicant_organization_id
       AND role.role_code IN ('operator','host','contract_holder','academic_provider')
       AND role.status='approved' AND role.valid_from<=NEW.assessed_at
       AND (role.valid_through IS NULL OR role.valid_through>NEW.assessed_at)) THEN
     RAISE EXCEPTION 'Assessed deployment is not under an authorized applicant operation role'; END IF;
   IF v.offering_version_id IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM offering_versions ov WHERE ov.id=v.offering_version_id AND ov.offering_id=target_offering) THEN
     RAISE EXCEPTION 'Selected deployment does not deliver the policy offering'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_v292_assessment_guard BEFORE INSERT ON qualification_program_fit_assessments
 FOR EACH ROW EXECUTE FUNCTION v292_guard_fit_assessment();
CREATE TRIGGER q_v292_assessment_immutable BEFORE UPDATE OR DELETE ON qualification_program_fit_assessments
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

-- Append-only, explicitly sourced requirement assessments. A verified site capability
-- must reference an actual space on the subject site, not a free-floating certificate.
CREATE TABLE qualification_program_fit_requirement_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL,
 policy_version_id uuid NOT NULL,
 policy_requirement_id uuid NOT NULL,
 determination text NOT NULL CHECK(determination IN ('satisfied','deficient','pending','not_applicable')),
 verification_level text NOT NULL CHECK(verification_level IN ('reported','verified')),
 source_qualification_evaluation_id uuid REFERENCES qualification_requirement_evaluations(id),
 source_facility_verification_id uuid REFERENCES site_space_capability_verifications(id),
 source_evidence_version_id uuid REFERENCES evidence_document_versions(id),
 evaluated_by_person_id uuid NOT NULL REFERENCES persons(id),
 rationale text NOT NULL,
 evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 supersedes_id uuid UNIQUE REFERENCES qualification_program_fit_requirement_results(id),
 result_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 FOREIGN KEY(assessment_id,policy_version_id)
  REFERENCES qualification_program_fit_assessments(id,policy_version_id),
 FOREIGN KEY(policy_requirement_id,policy_version_id)
  REFERENCES qualification_program_fit_policy_requirements(id,policy_version_id),
 UNIQUE(id,assessment_id,policy_requirement_id),
 CHECK(num_nonnulls(source_qualification_evaluation_id,source_facility_verification_id,
                    source_evidence_version_id)<=1),
 CHECK(supersedes_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX q_v292_one_initial_fit_result ON qualification_program_fit_requirement_results
 (assessment_id,policy_requirement_id) WHERE supersedes_id IS NULL;
CREATE OR REPLACE FUNCTION v292_guard_fit_requirement_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE r record; a record; src record; cap text; source_site uuid; a_site uuid; latest_id uuid;
BEGIN
 SELECT * INTO r FROM qualification_program_fit_policy_requirements WHERE id=NEW.policy_requirement_id;
 SELECT * INTO a FROM qualification_program_fit_assessments WHERE id=NEW.assessment_id;
 IF NEW.supersedes_id IS NOT NULL THEN
  SELECT id INTO latest_id FROM qualification_program_fit_requirement_results
   WHERE assessment_id=NEW.assessment_id AND policy_requirement_id=NEW.policy_requirement_id
   ORDER BY result_order DESC LIMIT 1;
  IF latest_id IS DISTINCT FROM NEW.supersedes_id THEN
   RAISE EXCEPTION 'Fit requirement result must supersede the current result'; END IF;
 ELSIF EXISTS(SELECT 1 FROM qualification_program_fit_requirement_results
    WHERE assessment_id=NEW.assessment_id AND policy_requirement_id=NEW.policy_requirement_id) THEN
   RAISE EXCEPTION 'Use supersession for additional fit findings'; END IF;
 IF NEW.determination='satisfied' AND num_nonnulls(NEW.source_qualification_evaluation_id,
   NEW.source_facility_verification_id,NEW.source_evidence_version_id)=0 THEN
   RAISE EXCEPTION 'Satisfied program-fit criterion requires a cited source'; END IF;
 IF r.source_kind='qualification_requirement' THEN
  IF NEW.determination='satisfied' AND NEW.source_qualification_evaluation_id IS NULL THEN
    RAISE EXCEPTION 'Qualification-backed satisfaction requires its exact evaluation'; END IF;
  IF NEW.source_qualification_evaluation_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM qualification_requirement_evaluations e
    JOIN qualification_applications qa ON qa.id=e.application_id
    WHERE e.id=NEW.source_qualification_evaluation_id
      AND qa.subject_id=a.subject_id AND qa.status IN ('submitted','closed')
      AND e.requirement_id=r.qualification_requirement_id
      AND (NEW.determination<>'satisfied' OR e.determination='satisfied')
      AND (e.valid_through IS NULL OR e.valid_through>NEW.evaluated_at)
      AND NOT EXISTS(SELECT 1 FROM qualification_evaluation_evidence ee
          WHERE ee.evaluation_id=e.id AND NOT v29_check_evidence_current(ee.evidence_submission_id,NEW.evaluated_at))
      AND NOT EXISTS(SELECT 1 FROM qualification_requirement_evaluations later WHERE later.supersedes_id=e.id)) THEN
    RAISE EXCEPTION 'Source qualification evaluation must be current, match subject and requirement'; END IF;
 ELSIF r.source_kind='site_capability' THEN
  IF NEW.determination='satisfied' AND NEW.source_facility_verification_id IS NULL THEN
    RAISE EXCEPTION 'Site-capability satisfaction requires independent facility verification'; END IF;
  IF NEW.source_facility_verification_id IS NOT NULL THEN
   SELECT a2.capability_code, ss.site_id INTO cap,source_site
   FROM site_space_capability_verifications v
   JOIN site_space_capability_assertions a2 ON a2.id=v.assertion_id
   JOIN site_spaces ss ON ss.id=a2.space_id WHERE v.id=NEW.source_facility_verification_id
    AND v.result='verified' AND (v.expires_at IS NULL OR v.expires_at>NEW.evaluated_at);
   SELECT COALESCE(qs.site_id,p.linked_site_id) INTO a_site FROM qualification_subjects qs
    LEFT JOIN qualification_proposed_sites p ON p.id=qs.proposed_site_id
    WHERE qs.id=a.subject_id;
   IF cap IS DISTINCT FROM r.facility_capability_code OR source_site IS DISTINCT FROM a_site THEN
    RAISE EXCEPTION 'Verified facility capability must belong to this subject site'; END IF;
  END IF;
 ELSE
  IF NEW.determination='satisfied' AND NEW.source_evidence_version_id IS NULL THEN
   RAISE EXCEPTION 'Program-specific criterion requires explicitly reviewed document evidence'; END IF;
 END IF;
 IF NEW.determination='satisfied' AND NEW.verification_level='verified'
   AND r.source_kind='program_criterion'
   AND NOT EXISTS(SELECT 1 FROM evidence_document_versions d
     WHERE d.id=NEW.source_evidence_version_id AND d.verified_at IS NOT NULL
       AND d.verified_by_person_id IS NOT NULL) THEN
     RAISE EXCEPTION 'Verified program criterion needs independently verified document'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_v292_fit_result_guard BEFORE INSERT ON qualification_program_fit_requirement_results
 FOR EACH ROW EXECUTE FUNCTION v292_guard_fit_requirement_result();
CREATE TRIGGER q_v292_fit_result_immutable BEFORE UPDATE OR DELETE ON qualification_program_fit_requirement_results
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

-- 27c. Quantified gaps connect to EXISTING improvement actions, equipment and funding.
CREATE TABLE qualification_resource_needs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES qualification_program_fit_assessments(id),
 policy_requirement_id uuid REFERENCES qualification_program_fit_policy_requirements(id),
 resource_code text NOT NULL, description text NOT NULL,
 unit_code text NOT NULL DEFAULT 'units',
 required_quantity numeric(14,3) NOT NULL CHECK(required_quantity>=0),
 available_quantity numeric(14,3) NOT NULL DEFAULT 0 CHECK(available_quantity>=0),
 estimated_unit_cost_cents bigint CHECK(estimated_unit_cost_cents IS NULL OR estimated_unit_cost_cents>=0),
 currency char(3) NOT NULL DEFAULT 'USD' CHECK(currency ~ '^[A-Z]{3}$'),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 recorded_by_person_id uuid NOT NULL REFERENCES persons(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'reported' CHECK(status IN ('reported','verified','fulfilled','cancelled')),
 UNIQUE(assessment_id,resource_code)
);
CREATE OR REPLACE FUNCTION v292_guard_resource_need() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.policy_requirement_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM qualification_program_fit_assessments a
  JOIN qualification_program_fit_policy_requirements r ON r.policy_version_id=a.policy_version_id
  WHERE a.id=NEW.assessment_id AND r.id=NEW.policy_requirement_id) THEN
  RAISE EXCEPTION 'Resource need must reference a criterion in the assessed policy'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_v292_resource_scope BEFORE INSERT OR UPDATE ON qualification_resource_needs
 FOR EACH ROW EXECUTE FUNCTION v292_guard_resource_need();
CREATE TABLE qualification_resource_action_links (
 resource_need_id uuid NOT NULL REFERENCES qualification_resource_needs(id),
 improvement_action_id uuid NOT NULL REFERENCES improvement_actions(id),
 PRIMARY KEY(resource_need_id,improvement_action_id)
);
CREATE TABLE qualification_resource_funding_links (
 resource_need_id uuid NOT NULL REFERENCES qualification_resource_needs(id),
 funding_application_id uuid NOT NULL REFERENCES funding_applications(id),
 proposed_amount_cents bigint NOT NULL CHECK(proposed_amount_cents>=0),
 allocation_status text NOT NULL DEFAULT 'proposed'
   CHECK(allocation_status IN ('proposed','approved','declined','withdrawn')),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 PRIMARY KEY(resource_need_id,funding_application_id)
);
CREATE TABLE qualification_resource_fulfillments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 resource_need_id uuid NOT NULL REFERENCES qualification_resource_needs(id),
 equipment_acquisition_id uuid REFERENCES equipment_acquisitions(id),
 quantity_delivered numeric(14,3) NOT NULL CHECK(quantity_delivered>0),
 quantity_verified numeric(14,3) NOT NULL DEFAULT 0
   CHECK(quantity_verified>=0 AND quantity_verified<=quantity_delivered),
 verification_evidence_id uuid REFERENCES evidence_document_versions(id),
 verified_by_person_id uuid REFERENCES persons(id),
 fulfilled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(quantity_verified=0 OR (verified_by_person_id IS NOT NULL AND verification_evidence_id IS NOT NULL))
);
CREATE VIEW qualification_resource_need_estimates WITH (security_invoker=true) AS
 SELECT n.id AS resource_need_id,n.assessment_id,n.resource_code,n.description,n.unit_code,
 n.required_quantity,n.available_quantity,
 GREATEST(0,n.required_quantity-n.available_quantity) AS shortage_quantity,
 n.estimated_unit_cost_cents,n.currency,
 CASE WHEN n.estimated_unit_cost_cents IS NULL THEN NULL
      ELSE ROUND(GREATEST(0,n.required_quantity-n.available_quantity)*n.estimated_unit_cost_cents)::bigint
 END AS shortfall_estimate_cents,
 COALESCE((SELECT sum(f.quantity_verified) FROM qualification_resource_fulfillments f
   WHERE f.resource_need_id=n.id),0) AS delivered_and_verified_quantity,
 GREATEST(0,n.required_quantity-n.available_quantity-
   COALESCE((SELECT sum(f.quantity_verified) FROM qualification_resource_fulfillments f
     WHERE f.resource_need_id=n.id),0)) AS remaining_unmet_quantity,
 CASE WHEN n.estimated_unit_cost_cents IS NULL THEN NULL
      ELSE ROUND(GREATEST(0,n.required_quantity-n.available_quantity-
         COALESCE((SELECT sum(f.quantity_verified) FROM qualification_resource_fulfillments f
           WHERE f.resource_need_id=n.id),0))*n.estimated_unit_cost_cents)::bigint
 END AS remaining_unmet_cost_cents
 FROM qualification_resource_needs n WHERE n.status<>'cancelled';


COMMENT ON COLUMN qualification_resource_needs.available_quantity IS
 'Baseline on-hand quantity before incremental verified fulfillments; do not include fulfillment rows twice.';
CREATE OR REPLACE FUNCTION v30_catalog_program_availability(target_geography uuid,target_delivery text)
RETURNS TABLE(policy_version_id uuid,provider_support text,regulatory_status text,
 catalog_status text,explanation text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE rec record; supported record; law record;
BEGIN
 -- Read-only catalog discovery and program-fit/activation evaluation share
 -- this advisory calculation. Only explicitly provisioned roles can execute it.
 IF NOT (v28_role_has_purpose('program_catalog')
   OR v28_role_has_purpose('program_fit')
   OR v28_role_has_purpose('qualification_reviewer')
   OR v28_role_has_purpose('program_activation')) THEN
  RAISE EXCEPTION 'Database role is not authorized for program availability'; END IF;
 IF target_delivery IS NULL OR target_delivery NOT IN ('remote','onsite','hybrid') THEN
  RAISE EXCEPTION 'Unknown delivery context'; END IF;
 FOR rec IN SELECT v.id,p.owner_organization_id
   FROM qualification_program_fit_policies p
   CROSS JOIN LATERAL (
     SELECT pv.* FROM qualification_program_fit_policy_versions pv
     WHERE pv.policy_id=p.id AND pv.lifecycle='published'
     ORDER BY pv.version_no DESC LIMIT 1) v
   WHERE p.status='active'
     AND (v.delivery_context IS NULL OR v.delivery_context=target_delivery)
     AND NOT EXISTS(SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
       WHERE w.policy_version_id=v.id AND w.effective_at<=CURRENT_TIMESTAMP)
 LOOP
  WITH RECURSIVE ancestors AS (
    SELECT g.id,g.parent_id,ARRAY[g.id] AS path,0 AS depth
    FROM geographic_areas g WHERE g.id=target_geography
    UNION ALL
    SELECT par.id,par.parent_id,anc.path||par.id,anc.depth+1 FROM geographic_areas par
    JOIN ancestors anc ON par.id=anc.parent_id
    WHERE NOT par.id=ANY(anc.path)
  )
  SELECT rule.* INTO supported FROM qualification_program_availability_rules rule
    LEFT JOIN ancestors a ON a.id=rule.geographic_area_id
    WHERE rule.policy_version_id=rec.id AND rule.availability_basis='provider_support'
      AND (rule.geographic_area_id IS NULL OR a.id IS NOT NULL)
      AND (rule.delivery_context IS NULL OR rule.delivery_context=target_delivery)
      AND (rule.valid_through IS NULL OR rule.valid_through>CURRENT_TIMESTAMP)
    ORDER BY (rule.geographic_area_id IS NOT NULL) DESC,a.depth ASC NULLS LAST,
     (rule.delivery_context IS NOT NULL) DESC,rule.reviewed_at DESC LIMIT 1;
  WITH RECURSIVE ancestors AS (
    SELECT g.id,g.parent_id,ARRAY[g.id] AS path,0 AS depth
    FROM geographic_areas g WHERE g.id=target_geography
    UNION ALL
    SELECT par.id,par.parent_id,anc.path||par.id,anc.depth+1 FROM geographic_areas par
    JOIN ancestors anc ON par.id=anc.parent_id
    WHERE NOT par.id=ANY(anc.path)
  )
  SELECT rule.* INTO law FROM qualification_program_availability_rules rule
    LEFT JOIN ancestors a ON a.id=rule.geographic_area_id
    WHERE rule.policy_version_id=rec.id AND rule.availability_basis='regulatory'
      AND (rule.geographic_area_id IS NULL OR a.id IS NOT NULL)
      AND (rule.delivery_context IS NULL OR rule.delivery_context=target_delivery)
      AND (rule.valid_through IS NULL OR rule.valid_through>CURRENT_TIMESTAMP)
    ORDER BY (rule.geographic_area_id IS NOT NULL) DESC,a.depth ASC NULLS LAST,
      (rule.delivery_context IS NOT NULL) DESC,rule.reviewed_at DESC LIMIT 1;
  policy_version_id:=rec.id;
  provider_support:=COALESCE(supported.availability,'requires_research');
  regulatory_status:=COALESCE(law.availability,'requires_research');
  IF provider_support='unavailable' OR regulatory_status='unavailable' THEN
    catalog_status:='unavailable';
  ELSIF target_geography IS NULL THEN catalog_status:='review_required';
  ELSIF provider_support='requires_research' OR regulatory_status='requires_research' THEN
    catalog_status:='review_required';
  ELSIF provider_support='conditional' OR regulatory_status='conditional' THEN
    catalog_status:='conditional';
  ELSE catalog_status:='supported'; END IF;
  explanation:=concat('CAN support: ',COALESCE(supported.reasoning,'not researched'),
      '; regulatory: ',COALESCE(law.reasoning,'not researched'));
  RETURN NEXT;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION v30_catalog_program_availability(uuid,text) FROM PUBLIC;
COMMENT ON FUNCTION v30_catalog_program_availability(uuid,text) IS
 'Published catalog advisory only, before qualification. CAN product support differs from legal availability; neither grants operational authority.';

-- 27e. Deterministic assessment outcome, independent of reviewer optimism.
-- Published regional rule remains advisory; separate operational_authorization_decisions grant authority.
CREATE OR REPLACE FUNCTION v292_program_fit_recommendation(target_assessment uuid)
RETURNS TABLE(recommended_outcome text, required_total integer, satisfied_count integer,
 deficiency_count integer, verification_count integer, availability text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; req record; r record; catalog record; source_version uuid;
        site_capacity integer; capacity_confirmed boolean := false;
        blocked boolean := false; resources boolean := false;
        outstanding boolean := false; relevant boolean; population_unknown boolean;
BEGIN
 SELECT * INTO a FROM qualification_program_fit_assessments WHERE id=target_assessment;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown program-fit assessment'; END IF;
 IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
    WHERE w.policy_version_id=a.policy_version_id AND w.effective_at<=CURRENT_TIMESTAMP) THEN
   recommended_outcome:='not_recommended';required_total:=0;satisfied_count:=0;
   deficiency_count:=0;verification_count:=0;availability:='unavailable';RETURN NEXT;RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_requirements p
     JOIN qualification_requirements q ON q.id=p.qualification_requirement_id
     JOIN qualification_template_withdrawals w ON w.definition_version_id=q.definition_version_id
     WHERE p.policy_version_id=a.policy_version_id AND p.source_kind='qualification_requirement'
       AND w.effective_at<=CURRENT_TIMESTAMP) THEN blocked:=true; END IF;
 SELECT * INTO catalog FROM v30_catalog_program_availability(a.geographic_area_id,a.delivery_context) c
  WHERE c.policy_version_id=a.policy_version_id LIMIT 1;
 availability:=CASE COALESCE(catalog.catalog_status,'review_required')
   WHEN 'supported' THEN 'possible' WHEN 'review_required' THEN 'requires_research'
   ELSE catalog.catalog_status END;
 required_total:=0;satisfied_count:=0;deficiency_count:=0;verification_count:=0;
 population_unknown:=a.participant_population='unknown' OR NOT EXISTS(
  SELECT 1 FROM evidence_document_versions ev
  WHERE ev.id=a.population_evidence_version_id AND ev.verified_at IS NOT NULL
   AND ev.verified_by_person_id IS NOT NULL
   AND (ev.valid_through IS NULL OR ev.valid_through>=CURRENT_DATE));
 IF population_unknown THEN outstanding:=true;verification_count:=verification_count+1; END IF;
 FOR req IN SELECT * FROM qualification_program_fit_policy_requirements p
   WHERE p.policy_version_id=a.policy_version_id AND p.importance IN ('blocking','required')
 LOOP
  relevant:=req.audience='any' OR population_unknown OR a.participant_population='mixed'
   OR (req.audience='minors' AND a.participant_population='minors')
   OR (req.audience='adults' AND a.participant_population='adults');
  IF NOT relevant THEN CONTINUE; END IF;
  required_total:=required_total+1;
  IF population_unknown AND req.audience<>'any' THEN
   outstanding:=true;verification_count:=verification_count+1;CONTINUE;
  END IF;
  SELECT * INTO r FROM qualification_program_fit_requirement_results result
    WHERE result.assessment_id=a.id AND result.policy_requirement_id=req.id
    ORDER BY result.result_order DESC LIMIT 1;
  IF req.minimum_quantity IS NOT NULL AND req.resource_kind IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM qualification_resource_needs need
      WHERE need.assessment_id=a.id AND need.policy_requirement_id=req.id
        AND need.required_quantity>=req.minimum_quantity AND need.status<>'cancelled') THEN
     outstanding:=true;verification_count:=verification_count+1;
  END IF;
  IF r.id IS NULL OR r.determination='pending' THEN
   outstanding:=true;verification_count:=verification_count+1;
  ELSIF r.determination='not_applicable' THEN
   IF req.importance='blocking' THEN blocked:=true;deficiency_count:=deficiency_count+1;
   ELSE outstanding:=true;verification_count:=verification_count+1; END IF;
  ELSIF r.determination='deficient' THEN
   deficiency_count:=deficiency_count+1;
   IF req.importance='blocking' THEN blocked:=true;
   ELSIF req.resource_kind IS NOT NULL THEN resources:=true;
   ELSE outstanding:=true; END IF;
  ELSIF r.determination='satisfied' THEN
   IF req.evidence_standard<>'self_report' AND r.verification_level<>'verified' THEN
    outstanding:=true;verification_count:=verification_count+1;
   ELSIF req.source_kind='qualification_requirement' AND NOT EXISTS(
      SELECT 1 FROM qualification_requirement_evaluations e
      JOIN qualification_applications qa ON qa.id=e.application_id
      WHERE e.id=r.source_qualification_evaluation_id AND qa.status IN ('submitted','closed')
       AND e.determination='satisfied' AND
       (e.valid_through IS NULL OR e.valid_through>CURRENT_TIMESTAMP)
       AND NOT EXISTS(SELECT 1 FROM qualification_requirement_evaluations later
         WHERE later.supersedes_id=e.id)) THEN
    outstanding:=true;verification_count:=verification_count+1;
   ELSIF req.source_kind='site_capability' AND NOT EXISTS(
      SELECT 1 FROM site_space_capability_verifications fv
      WHERE fv.id=r.source_facility_verification_id AND fv.result='verified'
       AND (fv.expires_at IS NULL OR fv.expires_at>CURRENT_TIMESTAMP)) THEN
    outstanding:=true;verification_count:=verification_count+1;
   ELSE satisfied_count:=satisfied_count+1;
   END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM qualification_resource_need_estimates n
   WHERE n.assessment_id=a.id AND n.remaining_unmet_quantity>0) THEN resources:=true; END IF;
 -- A remote-only course does not need a local room count or physical-facility review.
 IF a.delivery_context IN ('onsite','hybrid') THEN
  SELECT s.capacity,(s.capacity IS NOT NULL) INTO site_capacity,capacity_confirmed FROM qualification_subjects sub
  JOIN sites s ON s.id=sub.site_id WHERE sub.id=a.subject_id;
  IF NOT FOUND THEN
   SELECT p.verified_seating_capacity,(p.verified_seating_capacity IS NOT NULL) INTO site_capacity,capacity_confirmed
    FROM qualification_subjects sub JOIN qualification_proposed_sites p ON p.id=sub.proposed_site_id
    WHERE sub.id=a.subject_id;
   IF NOT FOUND OR NOT capacity_confirmed THEN outstanding:=true;verification_count:=verification_count+1; END IF;
  END IF;
  IF NOT capacity_confirmed THEN outstanding:=true;verification_count:=verification_count+1; END IF;
  IF a.expected_concurrent_learners IS NOT NULL AND site_capacity IS NOT NULL
    AND a.expected_concurrent_learners>site_capacity THEN resources:=true; END IF;
 END IF;
 IF availability='unavailable' OR blocked THEN recommended_outcome:='not_recommended';
 ELSIF availability IN ('requires_research','conditional','review_required') THEN
    recommended_outcome:='needs_verification';
 ELSIF outstanding THEN recommended_outcome:='needs_verification';
 ELSIF resources THEN recommended_outcome:='needs_resources';
 ELSE recommended_outcome:='candidate'; END IF;
 RETURN NEXT;
END $$;

CREATE TABLE qualification_program_fit_reviewer_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_id uuid NOT NULL REFERENCES qualification_program_fit_policies(id),
 authorizing_organization_id uuid NOT NULL REFERENCES organizations(id),
 reviewer_person_id uuid NOT NULL REFERENCES persons(id),
 permission_code text NOT NULL CHECK(permission_code IN ('evaluate_fit','override_fit')),
 valid_from timestamptz NOT NULL,valid_through timestamptz,
 approved_by_person_id uuid NOT NULL REFERENCES persons(id),
 authority_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 CHECK(valid_through IS NULL OR valid_through>valid_from)
);
CREATE TABLE qualification_program_fit_reviewer_revocations (
 authorization_id uuid PRIMARY KEY REFERENCES qualification_program_fit_reviewer_authorizations(id),
 revoked_by_person_id uuid NOT NULL REFERENCES persons(id),
 revocation_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);
CREATE OR REPLACE FUNCTION v292_guard_fit_reviewer_authorization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qualification_program_fit_policies
   WHERE id=NEW.policy_id AND owner_organization_id=NEW.authorizing_organization_id) THEN
  RAISE EXCEPTION 'Fit reviewer authority must be granted by policy owner'; END IF;
 IF NEW.reviewer_person_id=NEW.approved_by_person_id THEN
  RAISE EXCEPTION 'Reviewer cannot self-authorize'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_v292_fit_auth_guard BEFORE INSERT ON qualification_program_fit_reviewer_authorizations
 FOR EACH ROW EXECUTE FUNCTION v292_guard_fit_reviewer_authorization();
CREATE TRIGGER q_v292_fit_auth_immutable BEFORE UPDATE OR DELETE ON qualification_program_fit_reviewer_authorizations
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

CREATE TABLE qualification_program_fit_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 assessment_id uuid NOT NULL REFERENCES qualification_program_fit_assessments(id),
 reviewer_authorization_id uuid NOT NULL REFERENCES qualification_program_fit_reviewer_authorizations(id),
 reviewed_by_person_id uuid NOT NULL REFERENCES persons(id),
 review_outcome text NOT NULL CHECK(review_outcome IN
  ('candidate','needs_resources','needs_verification','not_recommended')),
 rationale text NOT NULL, override_justification text,
 override_evidence_version_id uuid REFERENCES evidence_document_versions(id),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 supersedes_id uuid UNIQUE REFERENCES qualification_program_fit_reviews(id),
 review_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 CHECK(supersedes_id IS DISTINCT FROM id),
 CHECK((override_justification IS NULL)=(override_evidence_version_id IS NULL))
);
CREATE UNIQUE INDEX q_v292_fit_review_root ON qualification_program_fit_reviews(assessment_id)
 WHERE supersedes_id IS NULL;
CREATE OR REPLACE FUNCTION v292_guard_fit_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; auth record; p record; calc record; latest_id uuid;
BEGIN
 SELECT * INTO a FROM qualification_program_fit_assessments WHERE id=NEW.assessment_id;
 SELECT * INTO p FROM qualification_program_fit_policy_versions WHERE id=a.policy_version_id;
 SELECT * INTO auth FROM qualification_program_fit_reviewer_authorizations
  WHERE id=NEW.reviewer_authorization_id;
 IF EXISTS(SELECT 1 FROM qualification_program_fit_reviewer_revocations revoked
  WHERE revoked.authorization_id=auth.id AND revoked.revoked_at<=NEW.reviewed_at) THEN
  RAISE EXCEPTION 'Revoked program-fit reviewer cannot issue decisions'; END IF;
 IF auth.policy_id IS DISTINCT FROM p.policy_id OR auth.reviewer_person_id IS DISTINCT FROM NEW.reviewed_by_person_id
  OR auth.valid_from>NEW.reviewed_at OR (auth.valid_through IS NOT NULL AND auth.valid_through<=NEW.reviewed_at) THEN
   RAISE EXCEPTION 'Reviewer is not authorized for this program-fit policy and time'; END IF;
 IF EXISTS(SELECT 1 FROM qualification_applications qa
    WHERE qa.id=a.base_application_id AND qa.contact_person_id=NEW.reviewed_by_person_id) THEN
    RAISE EXCEPTION 'Fit reviewer must be independent of applicant contact'; END IF;
 SELECT * INTO calc FROM v292_program_fit_recommendation(NEW.assessment_id);
 IF NEW.review_outcome<>calc.recommended_outcome THEN
  IF auth.permission_code<>'override_fit' OR NEW.override_justification IS NULL THEN
   RAISE EXCEPTION 'Outcome differs from requirements; documented override authority and evidence required'; END IF;
  -- An unavailable region cannot be made available by overriding a fit recommendation.
  IF calc.recommended_outcome<>'candidate' AND NEW.review_outcome='candidate' THEN
   RAISE EXCEPTION 'Review cannot override unresolved required, blocking, or unavailable conditions into candidate'; END IF;
 ELSE
  IF NEW.override_justification IS NOT NULL THEN
   RAISE EXCEPTION 'Override evidence is only valid for a genuinely different outcome'; END IF;
 END IF;
 IF NEW.supersedes_id IS NOT NULL THEN
  SELECT id INTO latest_id FROM qualification_program_fit_reviews
   WHERE assessment_id=NEW.assessment_id ORDER BY review_order DESC LIMIT 1;
  IF latest_id IS DISTINCT FROM NEW.supersedes_id THEN
   RAISE EXCEPTION 'Fit review must supersede the latest assessment review'; END IF;
 ELSIF EXISTS(SELECT 1 FROM qualification_program_fit_reviews WHERE assessment_id=NEW.assessment_id) THEN
   RAISE EXCEPTION 'Additional fit reviews must supersede the previous review'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_v292_fit_review_guard BEFORE INSERT ON qualification_program_fit_reviews
 FOR EACH ROW EXECUTE FUNCTION v292_guard_fit_review();
CREATE TRIGGER q_v292_fit_review_immutable BEFORE UPDATE OR DELETE ON qualification_program_fit_reviews
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

-- Exact source facts and publication versions supporting a decision; no generic loose entity IDs.
CREATE TABLE evaluation_bases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 program_fit_assessment_id uuid REFERENCES qualification_program_fit_assessments(id),
 qualification_decision_id uuid REFERENCES qualification_decisions(id),
 deployment_readiness_review_id uuid REFERENCES deployment_readiness_reviews(id),
 authorization_decision_id uuid REFERENCES operational_authorization_decisions(id),
 recorded_by_person_id uuid NOT NULL REFERENCES persons(id),
 evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'current' CHECK(status IN ('current','stale','superseded')),
 CHECK(num_nonnulls(program_fit_assessment_id,qualification_decision_id,
   deployment_readiness_review_id,authorization_decision_id)=1)
);
CREATE TABLE evaluation_basis_dependencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 basis_id uuid NOT NULL REFERENCES evaluation_bases(id),
 site_id uuid REFERENCES sites(id),
 evidence_version_id uuid REFERENCES evidence_document_versions(id),
 fit_policy_version_id uuid REFERENCES qualification_program_fit_policy_versions(id),
 qualification_definition_version_id uuid REFERENCES qualification_definition_versions(id),
 screening_decision_id uuid REFERENCES professional_screening_decisions(id),
 facility_verification_id uuid REFERENCES site_space_capability_verifications(id),
 resource_need_id uuid REFERENCES qualification_resource_needs(id),
 source_fingerprint text NOT NULL DEFAULT '' CHECK(source_fingerprint ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(num_nonnulls(site_id,evidence_version_id,fit_policy_version_id,
   qualification_definition_version_id,screening_decision_id,
   facility_verification_id,resource_need_id)=1)
);
CREATE TABLE evaluation_basis_invalidations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 basis_id uuid NOT NULL REFERENCES evaluation_bases(id),
 dependency_id uuid REFERENCES evaluation_basis_dependencies(id),
 reason text NOT NULL,
 detected_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 detected_by_person_id uuid REFERENCES persons(id),
 UNIQUE(basis_id,dependency_id,reason)
);
CREATE OR REPLACE FUNCTION v30_dependency_current_fingerprint(d evaluation_basis_dependencies)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE payload text;
BEGIN
 IF d.site_id IS NOT NULL THEN
  SELECT to_jsonb(s)::text INTO payload FROM sites s WHERE s.id=d.site_id;
 ELSIF d.evidence_version_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM evidence_document_versions v WHERE v.id=d.evidence_version_id;
 ELSIF d.fit_policy_version_id IS NOT NULL THEN
  SELECT concat(to_jsonb(v)::text,'|',coalesce(to_jsonb(w)::text,'')) INTO payload
  FROM qualification_program_fit_policy_versions v
  LEFT JOIN qualification_program_fit_policy_version_withdrawals w ON w.policy_version_id=v.id
  WHERE v.id=d.fit_policy_version_id;
 ELSIF d.qualification_definition_version_id IS NOT NULL THEN
  SELECT concat(to_jsonb(v)::text,'|',coalesce((SELECT string_agg(to_jsonb(w)::text,';')
    FROM qualification_template_withdrawals w WHERE w.definition_version_id=v.id),'')) INTO payload
  FROM qualification_definition_versions v WHERE v.id=d.qualification_definition_version_id;
 ELSIF d.screening_decision_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM professional_screening_decisions v WHERE v.id=d.screening_decision_id;
 ELSIF d.facility_verification_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM site_space_capability_verifications v WHERE v.id=d.facility_verification_id;
 ELSIF d.resource_need_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM qualification_resource_need_estimates v WHERE v.resource_need_id=d.resource_need_id;
 END IF;
 IF payload IS NULL THEN RETURN NULL; END IF;
 RETURN encode(public.digest(payload,'sha256'),'hex');
END $$;
CREATE OR REPLACE FUNCTION v30_evaluation_basis_is_current(target_basis uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE d evaluation_basis_dependencies%ROWTYPE;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM evaluation_bases WHERE id=target_basis AND status='current') THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM evaluation_basis_invalidations WHERE basis_id=target_basis) THEN RETURN false; END IF;
 IF NOT EXISTS(SELECT 1 FROM evaluation_basis_dependencies WHERE basis_id=target_basis) THEN RETURN false; END IF;
 FOR d IN SELECT * FROM evaluation_basis_dependencies WHERE basis_id=target_basis LOOP
  IF v30_dependency_current_fingerprint(d) IS DISTINCT FROM d.source_fingerprint THEN RETURN false; END IF;
  IF d.evidence_version_id IS NOT NULL AND EXISTS(SELECT 1 FROM evidence_document_versions ev
    WHERE ev.id=d.evidence_version_id AND ev.valid_through IS NOT NULL
      AND ev.valid_through<CURRENT_DATE) THEN RETURN false; END IF;
  IF d.screening_decision_id IS NOT NULL AND EXISTS(SELECT 1 FROM professional_screening_decisions sc
    WHERE sc.id=d.screening_decision_id AND (sc.decision<>'cleared' OR
      (sc.effective_through IS NOT NULL AND sc.effective_through<=CURRENT_TIMESTAMP))) THEN RETURN false; END IF;
  IF d.facility_verification_id IS NOT NULL AND EXISTS(SELECT 1 FROM site_space_capability_verifications fv
    WHERE fv.id=d.facility_verification_id AND (fv.result<>'verified' OR
      (fv.expires_at IS NOT NULL AND fv.expires_at<=CURRENT_TIMESTAMP))) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION v30_dependency_current_fingerprint(evaluation_basis_dependencies) FROM PUBLIC;
REVOKE ALL ON FUNCTION v30_evaluation_basis_is_current(uuid) FROM PUBLIC;
CREATE OR REPLACE FUNCTION v30_guard_evaluation_dependency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NEW.source_fingerprint='' THEN
   NEW.source_fingerprint:=v30_dependency_current_fingerprint(NEW); END IF;
 IF v30_dependency_current_fingerprint(NEW) IS DISTINCT FROM NEW.source_fingerprint THEN
  RAISE EXCEPTION 'Evaluation dependency must capture the current source fingerprint'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER evaluation_dependency_snapshot_guard BEFORE INSERT ON evaluation_basis_dependencies
 FOR EACH ROW EXECUTE FUNCTION v30_guard_evaluation_dependency();
CREATE OR REPLACE FUNCTION v30_program_fit_basis_is_current(target_assessment uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
 SELECT COALESCE((SELECT v30_evaluation_basis_is_current(b.id)
     FROM evaluation_bases b WHERE b.program_fit_assessment_id=target_assessment
     ORDER BY b.evaluated_at DESC,b.id DESC LIMIT 1),false);
$$;
REVOKE ALL ON FUNCTION v30_program_fit_basis_is_current(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION v30_guard_fit_reviewer_revocation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM qualification_program_fit_reviewer_authorizations a
  JOIN qualification_program_fit_policies p ON p.id=a.policy_id
  JOIN evidence_document_versions v ON v.id=NEW.revocation_evidence_version_id
  JOIN evidence_documents d ON d.id=v.document_id
  WHERE a.id=NEW.authorization_id
    AND d.owning_organization_id=p.owner_organization_id
    AND NEW.revoked_by_person_id<>a.reviewer_person_id) THEN
   RAISE EXCEPTION 'Fit reviewer authority can only be revoked by its policy steward'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fit_reviewer_revocation_guard BEFORE INSERT ON qualification_program_fit_reviewer_revocations
 FOR EACH ROW EXECUTE FUNCTION v30_guard_fit_reviewer_revocation();
CREATE TRIGGER fit_reviewer_revocation_immutable BEFORE UPDATE OR DELETE ON qualification_program_fit_reviewer_revocations
 FOR EACH ROW EXECUTE FUNCTION v29_reject_update_delete();

CREATE OR REPLACE FUNCTION v30_scoped_program_fit_recommendation(target_assessment uuid)
RETURNS TABLE(recommended_outcome text, required_total integer, satisfied_count integer,
 deficiency_count integer, verification_count integer, availability text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE org uuid;
BEGIN
 SELECT qa.applicant_organization_id INTO org FROM qualification_program_fit_assessments a
 JOIN qualification_applications qa ON qa.id=a.base_application_id
 WHERE a.id=target_assessment;
 IF org IS NULL OR NOT (v28_role_can_access_org(org,'program_fit')
    OR v28_role_can_access_org(org,'qualification_reviewer')) THEN
  RAISE EXCEPTION 'Authenticated role lacks program-fit access'; END IF;
 RETURN QUERY SELECT * FROM v292_program_fit_recommendation(target_assessment);
END $$;
REVOKE ALL ON FUNCTION v30_scoped_program_fit_recommendation(uuid) FROM PUBLIC;

-- 27f. Preliminary guidance summary uses the EXISTING survey-answer engine and
-- filters out requirements that are not applicable to this applicant population.
CREATE OR REPLACE FUNCTION v292_preliminary_site_profile(target_application uuid)
RETURNS TABLE(requirements_with_guidance integer,reported_sufficient integer,
 reported_gaps integer,needs_confirmation integer,informational integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
 SELECT count(*)::integer,
   count(*) FILTER(WHERE guidance.interpretation='reported_sufficient')::integer,
   count(*) FILTER(WHERE guidance.interpretation='reported_gap')::integer,
   count(*) FILTER(WHERE guidance.interpretation='needs_confirmation')::integer,
   count(*) FILTER(WHERE guidance.interpretation='informational')::integer
 FROM v291_preliminary_guidance(target_application) guidance
 WHERE v29_requirement_applies(guidance.requirement_id,target_application);
$$;

-- 27g. Network analytics are OPT-IN and aggregated. No inherited permission to view
-- a church's questionnaire answers, private evidence or safeguarding cases.
CREATE TABLE qualification_network_reporting_grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 network_id uuid NOT NULL REFERENCES education_networks(id),
 participating_organization_id uuid NOT NULL REFERENCES organizations(id),
 approved_by_person_id uuid NOT NULL REFERENCES persons(id),
 approving_organization_role_id uuid REFERENCES education_operation_organization_roles(id),
 approving_person_role_assignment_id uuid NOT NULL REFERENCES professional_role_assignments(id),
 authorization_evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
 valid_from timestamptz NOT NULL,valid_through timestamptz,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','ended')),
 CHECK(valid_through IS NULL OR valid_through>valid_from),
 UNIQUE(network_id,participating_organization_id,valid_from)
);
-- SECURITY INVOKER: caller still needs row access. Suppress aggregates with <10 sites.
-- No free-text, case details or participant records are returned.
CREATE OR REPLACE FUNCTION v292_network_qualification_summary(target_network uuid)
RETURNS TABLE(assessed_sites bigint,candidate_program_assessments bigint,
 reported_resource_shortfall numeric,estimated_resource_cost_cents numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
 WITH eligible_orgs AS (
   SELECT DISTINCT participating_organization_id org_id
   FROM qualification_network_reporting_grants g
   WHERE g.network_id=target_network AND g.status='active'
    AND g.valid_from<=CURRENT_TIMESTAMP AND (g.valid_through IS NULL OR g.valid_through>CURRENT_TIMESTAMP)
    AND EXISTS(SELECT 1 FROM professional_role_assignments ar
      WHERE ar.id=g.approving_person_role_assignment_id
      AND ar.person_id=g.approved_by_person_id
      AND ar.organization_id=g.participating_organization_id
      AND ar.state='approved' AND ar.begins_at<=CURRENT_TIMESTAMP
      AND (ar.ends_at IS NULL OR ar.ends_at>CURRENT_TIMESTAMP))
 ), assessed AS (
   SELECT DISTINCT a.subject_id,a.id,a.applicant_organization_id
   FROM qualification_applications a JOIN eligible_orgs o ON o.org_id=a.applicant_organization_id
   JOIN qualification_subjects s ON s.id=a.subject_id
   WHERE s.subject_kind IN ('site','proposed_site') AND a.status IN ('submitted','closed')
 ), assessments AS (
   SELECT DISTINCT f.id, f.subject_id FROM qualification_program_fit_assessments f
    JOIN assessed a ON a.subject_id=f.subject_id
 ), candidate AS (
   SELECT count(*) AS n FROM qualification_program_fit_reviews r
    JOIN assessments f ON f.id=r.assessment_id
    WHERE r.review_outcome='candidate'
      AND NOT EXISTS(SELECT 1 FROM qualification_program_fit_reviews newer WHERE newer.supersedes_id=r.id)
 ), needs_per_site AS (
   -- A single site's device gap can support several programs; do not count it repeatedly.
   SELECT f.subject_id, e.resource_code,
     MAX(GREATEST(0,e.shortage_quantity-e.delivered_and_verified_quantity)) shortage,
     MAX(e.estimated_unit_cost_cents) estimated_unit_cost_cents
   FROM qualification_resource_need_estimates e JOIN assessments f ON f.id=e.assessment_id
   GROUP BY f.subject_id,e.resource_code
 ), needs AS (
   SELECT SUM(shortage) n, SUM(ROUND(shortage*estimated_unit_cost_cents)) cost
   FROM needs_per_site
 )
 SELECT count(DISTINCT assessed.subject_id)::bigint, candidate.n::bigint,
   COALESCE(needs.n,0), COALESCE(needs.cost,0)
 FROM assessed CROSS JOIN candidate CROSS JOIN needs
 GROUP BY candidate.n,needs.n,needs.cost
 HAVING count(DISTINCT assessed.subject_id)>=10
   AND EXISTS(SELECT 1 FROM education_networks n WHERE n.id=target_network
    AND v28_role_can_access_org(n.steward_organization_id,'network_reporting'));
$$;

-- Read-only application preflight. Never grants rights: only an explicit, current,
-- deployment-scoped operational_authorization_decision can establish stage approval.
CREATE OR REPLACE FUNCTION v292_program_activation_preflight(target_assessment uuid,target_stage text)
RETURNS TABLE(fit_recommendation text,reviewed_fit_outcome text,
 stage_authorization_decision text,readiness_outcome text,preflight_ready boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; ctx record; readiness_kind text; required_review boolean;
        basis_current boolean; source_org uuid;
BEGIN
 IF target_stage NOT IN ('accept_applications','enroll','register_noncredit','deliver','operate') THEN
  RAISE EXCEPTION 'Unsupported program activation stage'; END IF;
 SELECT f.*,qa.applicant_organization_id INTO a FROM qualification_program_fit_assessments f
 JOIN qualification_applications qa ON qa.id=f.base_application_id WHERE f.id=target_assessment;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown program fit assessment'; END IF;
 IF NOT v28_role_can_access_org(a.applicant_organization_id,'program_activation')
    AND NOT v28_role_can_access_org(a.applicant_organization_id,'qualification_reviewer') THEN
    RAISE EXCEPTION 'No scoped authorization to evaluate this program activation'; END IF;
 SELECT recommended_outcome INTO fit_recommendation
   FROM v292_program_fit_recommendation(target_assessment);
 SELECT review_outcome INTO reviewed_fit_outcome FROM qualification_program_fit_reviews r
  WHERE r.assessment_id=target_assessment ORDER BY review_order DESC LIMIT 1;
 basis_current:=v30_program_fit_basis_is_current(target_assessment);
 IF EXISTS(SELECT 1 FROM qualification_applications app
    WHERE app.id=a.base_application_id AND app.status='withdrawn') THEN
   basis_current:=false; END IF;
 IF a.deployment_id IS NULL THEN
  stage_authorization_decision:=NULL; readiness_outcome:=NULL;preflight_ready:=false;RETURN NEXT;RETURN;
 END IF;
 SELECT decision INTO stage_authorization_decision FROM operational_authorization_decisions d
 WHERE d.deployment_id=a.deployment_id AND d.stage_code=target_stage
  AND d.decided_at<=CURRENT_TIMESTAMP AND d.valid_from<=CURRENT_TIMESTAMP
  AND (d.valid_through IS NULL OR d.valid_through>CURRENT_TIMESTAMP)
 ORDER BY d.decision_order DESC LIMIT 1;
 SELECT * INTO ctx FROM deployment_operating_contexts WHERE deployment_id=a.deployment_id;
 -- Adult remote delivery may proceed without a physical-facility readiness review;
 -- minors, onsite delivery, academic enrollment and explicit operating scopes require it.
 required_review:=target_stage IN ('enroll','operate')
  OR (target_stage='deliver' AND
     (a.delivery_context<>'remote' OR a.participant_population IN ('minors','mixed','unknown')))
  OR (target_stage='register_noncredit' AND
     a.participant_population IN ('minors','mixed','unknown'))
  OR (target_stage='accept_applications' AND a.participant_population IN ('minors','mixed','unknown'));
 IF ctx.deployment_id IS NOT NULL THEN
  required_review:=required_review OR ctx.safeguarding_required
    OR (ctx.delivery_context<>'remote' AND target_stage IN ('deliver','register_noncredit','operate'));
 END IF;
 readiness_kind:=CASE target_stage
  WHEN 'accept_applications' THEN 'registration'
  WHEN 'enroll' THEN 'registration'
  WHEN 'register_noncredit' THEN 'registration'
  WHEN 'deliver' THEN 'delivery' ELSE 'operating' END;
 IF required_review THEN
   SELECT outcome INTO readiness_outcome FROM deployment_readiness_reviews r
   WHERE r.deployment_id=a.deployment_id AND r.review_kind=readiness_kind
    AND (r.expires_at IS NULL OR r.expires_at>CURRENT_TIMESTAMP)
   ORDER BY r.evaluated_at DESC LIMIT 1;
 ELSE readiness_outcome:='not_required'; END IF;
 preflight_ready:=COALESCE(basis_current AND fit_recommendation='candidate'
    AND reviewed_fit_outcome='candidate' AND stage_authorization_decision='approved'
    AND readiness_outcome IN ('ready','not_required'),false);
 RETURN NEXT;
END $$;

-- Unified service-facing evaluation contract. A catalog result can be obtained
-- without an application; eligibility for activation cannot.
CREATE OR REPLACE FUNCTION v301_policy_evaluation(
  target_policy_version uuid, target_geography uuid, target_delivery text,
  target_assessment uuid DEFAULT NULL, target_stage text DEFAULT 'deliver')
RETURNS TABLE (
 policy_version_id uuid, offering_version_id uuid, catalog_status text,
 provider_support text, regulatory_status text, qualification_status text,
 fit_recommendation text, reviewed_fit_outcome text,
 stage_authorization_decision text, readiness_outcome text,
 required_action_items jsonb, activation_eligible boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
DECLARE pv record; cat record; assessed record; pre record; applicant uuid;
BEGIN
 SELECT * INTO pv FROM qualification_program_fit_policy_versions v
   WHERE v.id=target_policy_version AND v.lifecycle='published';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown/unpublished policy version'; END IF;
 IF target_stage NOT IN ('accept_applications','enroll','register_noncredit','deliver','operate') THEN
   RAISE EXCEPTION 'Unsupported activation stage'; END IF;
 SELECT * INTO cat FROM v30_catalog_program_availability(target_geography,target_delivery) c
    WHERE c.policy_version_id=target_policy_version LIMIT 1;
 policy_version_id:=target_policy_version;
 offering_version_id:=pv.offering_version_id;
 catalog_status:=COALESCE(cat.catalog_status,'review_required');
 IF EXISTS (SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
   WHERE w.policy_version_id=target_policy_version AND w.effective_at<=CURRENT_TIMESTAMP) THEN
   catalog_status:='unavailable';
 END IF;
 provider_support:=COALESCE(cat.provider_support,'requires_research');
 regulatory_status:=COALESCE(cat.regulatory_status,'requires_research');
 required_action_items:='[]'::jsonb;
 activation_eligible:=false;
 IF target_assessment IS NULL THEN
   qualification_status:='not_started';fit_recommendation:='not_assessed';
   reviewed_fit_outcome:='not_reviewed';stage_authorization_decision:=NULL;
   readiness_outcome:=NULL;
   RETURN NEXT;RETURN;
 END IF;
 SELECT a.*, qa.applicant_organization_id,qa.status AS base_status
 INTO assessed FROM qualification_program_fit_assessments a
 JOIN qualification_applications qa ON qa.id=a.base_application_id
 WHERE a.id=target_assessment AND a.policy_version_id=target_policy_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'Assessment does not belong to selected policy version'; END IF;
 applicant:=assessed.applicant_organization_id;
 IF NOT (v28_role_can_access_org(applicant,'program_fit') OR
         v28_role_can_access_org(applicant,'qualification_reviewer') OR
         v28_role_can_access_org(applicant,'program_activation')) THEN
   RAISE EXCEPTION 'Role lacks program-fit evaluation scope'; END IF;
 IF assessed.geographic_area_id IS DISTINCT FROM target_geography
    OR assessed.delivery_context IS DISTINCT FROM target_delivery THEN
   RAISE EXCEPTION 'Selected site context differs from the assessed context'; END IF;
 qualification_status:=assessed.base_status;
 IF v28_role_can_access_org(applicant,'program_activation')
    OR v28_role_can_access_org(applicant,'qualification_reviewer') THEN
   SELECT * INTO pre FROM v292_program_activation_preflight(target_assessment,target_stage);
   fit_recommendation:=pre.fit_recommendation;
   reviewed_fit_outcome:=COALESCE(pre.reviewed_fit_outcome,'not_reviewed');
   stage_authorization_decision:=pre.stage_authorization_decision;
   readiness_outcome:=pre.readiness_outcome;
 ELSE
   -- A site qualification planner may inspect fit but not infer operational permission.
   SELECT calc.recommended_outcome INTO fit_recommendation
     FROM v292_program_fit_recommendation(target_assessment) calc;
   SELECT r.review_outcome INTO reviewed_fit_outcome FROM qualification_program_fit_reviews r
     WHERE r.assessment_id=target_assessment ORDER BY r.review_order DESC LIMIT 1;
   reviewed_fit_outcome:=COALESCE(reviewed_fit_outcome,'not_reviewed');
   stage_authorization_decision:=NULL;
   readiness_outcome:=NULL;
 END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'requirement_id',q.id,'code',q.requirement_code,'importance',q.importance,
   'status',COALESCE(result.determination,'missing'),'remediation',q.remediation_guidance)
   ORDER BY q.requirement_code),'[]'::jsonb) INTO required_action_items
 FROM qualification_program_fit_policy_requirements q
 LEFT JOIN LATERAL (
   SELECT r.determination,r.verification_level FROM qualification_program_fit_requirement_results r
   WHERE r.assessment_id=target_assessment AND r.policy_requirement_id=q.id
   ORDER BY r.result_order DESC LIMIT 1) result ON true
 WHERE q.policy_version_id=target_policy_version AND q.importance IN ('blocking','required')
   AND (q.audience='any' OR assessed.participant_population IN ('unknown','mixed')
       OR (q.audience='minors' AND assessed.participant_population='minors')
       OR (q.audience='adults' AND assessed.participant_population='adults'))
   AND (result.determination IS DISTINCT FROM 'satisfied' OR
       (q.evidence_standard<>'self_report' AND result.verification_level IS DISTINCT FROM 'verified'));
 activation_eligible:=COALESCE(pre.preflight_ready,false) AND catalog_status='supported';
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION v301_policy_evaluation(uuid,uuid,text,uuid,text) FROM PUBLIC;
COMMENT ON FUNCTION v301_policy_evaluation(uuid,uuid,text,uuid,text) IS
 'Single read-only availability/qualification/fit/authorization contract. Not itself a grant. Detailed assessment access requires database role to organization bindings.';

CREATE INDEX q_v292_policy_version_lookup ON qualification_program_fit_policy_versions(policy_id,version_no DESC);
CREATE INDEX q_v292_policy_requirement_lookup ON qualification_program_fit_policy_requirements(policy_version_id,importance);
CREATE INDEX q_v292_assessment_subject_lookup ON qualification_program_fit_assessments(subject_id,assessed_at DESC);
CREATE INDEX q_v292_fit_result_lookup ON qualification_program_fit_requirement_results(assessment_id,policy_requirement_id,result_order DESC);
CREATE INDEX q_v292_fit_review_lookup ON qualification_program_fit_reviews(assessment_id,review_order DESC);
CREATE INDEX q_v292_resource_need_lookup ON qualification_resource_needs(assessment_id,resource_code);
CREATE INDEX q_v292_network_grants_lookup ON qualification_network_reporting_grants(network_id,participating_organization_id);
CREATE OR REPLACE FUNCTION v292_guard_network_reporting_grant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM evidence_document_versions v
   JOIN evidence_documents d ON d.id=v.document_id
   WHERE v.id=NEW.authorization_evidence_version_id
    AND d.owning_organization_id=NEW.participating_organization_id) THEN
   RAISE EXCEPTION 'Network reporting requires evidence owned by the participating organization'; END IF;
 IF NEW.approving_organization_role_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM education_operation_organization_roles r
   WHERE r.id=NEW.approving_organization_role_id
    AND r.organization_id=NEW.participating_organization_id
    AND r.role_code IN ('operator','contract_holder','fund_recipient')
    AND r.status='approved' AND r.valid_from<=NEW.valid_from
    AND (r.valid_through IS NULL OR r.valid_through>NEW.valid_from)) THEN
   RAISE EXCEPTION 'Reporting consent organization role is not current'; END IF;
 IF NOT EXISTS(SELECT 1 FROM professional_role_assignments p
   WHERE p.id=NEW.approving_person_role_assignment_id
     AND p.person_id=NEW.approved_by_person_id
     AND p.organization_id=NEW.participating_organization_id
     AND p.appointing_organization_id=NEW.participating_organization_id
     AND p.role_code IN ('organization_signatory','executive','data_steward')
     AND p.state='approved' AND p.begins_at<=NEW.valid_from
     AND (p.ends_at IS NULL OR p.ends_at>NEW.valid_from)
     AND p.authority_evidence_id IS NOT NULL) THEN
   RAISE EXCEPTION 'Reporting grant requires a currently authorized person signatory'; END IF;
 IF NEW.approved_by_person_id IS NULL THEN
   RAISE EXCEPTION 'Network release requires an approving person'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER q_v292_reporting_grant_scope BEFORE INSERT OR UPDATE ON qualification_network_reporting_grants
 FOR EACH ROW EXECUTE FUNCTION v292_guard_network_reporting_grant();
CREATE INDEX q_v292_improvement_source_lookup ON improvement_plans(qualification_finding_id)
 WHERE qualification_finding_id IS NOT NULL;

-- Default deny on all new sensitive, operational and finance-adjacent tables.
DO $v292_rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
 'qualification_program_fit_policies','qualification_program_fit_policy_versions',
 'qualification_program_fit_policy_requirements','qualification_program_availability_rules',
 'qualification_program_fit_assessments','qualification_program_fit_requirement_results',
 'qualification_resource_needs','qualification_resource_action_links','qualification_resource_funding_links',
 'qualification_resource_fulfillments','qualification_program_fit_reviewer_authorizations',
 'qualification_program_fit_reviews','qualification_network_reporting_grants'] LOOP
  EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $v292_rls$;

REVOKE ALL ON FUNCTION v292_program_fit_recommendation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v292_program_activation_preflight(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION v292_preliminary_site_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v292_network_qualification_summary(uuid) FROM PUBLIC;
COMMENT ON FUNCTION v292_program_activation_preflight(uuid,text) IS
 'Read-only stage-specific preflight; requires current evaluation basis, reviewed candidate fit and active stage authorization. Authoritative services must still enforce legal and operational gates.';
COMMENT ON FUNCTION v292_program_fit_recommendation(uuid) IS
 'Advisory recommendation calculated from scoped evidence and reviewed availability. NEVER grants legal or operational authorization.';
COMMENT ON FUNCTION v292_network_qualification_summary(uuid) IS
 'Opt-in aggregation of consented site qualification data, 10-site suppression, scoped service permissions. No raw answers or safeguarding information.';
COMMENT ON TABLE qualification_program_fit_policy_requirements IS
 'Reusable qualification requirements, independently verified site capabilities and new program-specific criteria coexist without survey-version coupling.';
COMMENT ON TABLE qualification_resource_needs IS
 'Quantified, itemized resource need; linked separately to improvements, prospective funding and verified delivery.';


-- Immutable action/dependency history and key financial + eligibility inputs are protected by RLS.
DO $v30_rls_new_domain$
DECLARE item text;
BEGIN
 FOREACH item IN ARRAY ARRAY[
 'education_operation_classifications','shared_resource_pools','shared_resource_allocations',
 'qualification_person_consent_withdrawals',
 'qualification_program_fit_policy_version_withdrawals',
 'qualification_program_fit_reviewer_revocations',
 'database_role_organization_bindings','sites','site_organization_roles',
 'canonical_accounts','canonical_account_grants','canonical_sessions',
 'geographic_areas','offerings','offering_versions',
 'qualification_program_fit_policies','qualification_program_fit_policy_versions',
 'blueprint_reference_items','blueprint_reference_item_versions',
 'blueprint_configurations','blueprint_configuration_versions',
 'blueprint_configuration_components','blueprint_configuration_local_experiences',
 'blueprint_configuration_component_references',
 'blueprint_configuration_offering_intents','audit_events','domain_events',
 'configuration_reviews','blueprint_outputs',
 'evaluation_bases','evaluation_basis_dependencies','evaluation_basis_invalidations',
 'initiative_metric_definition_versions','initiative_metric_observation_sources'
 ] LOOP
   EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',item);
   EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',item);
 END LOOP;
END $v30_rls_new_domain$;

-- The native Blueprint service uses narrow roles, never the schema owner.
-- Enable these additional reference/evidence rows before the owner policy
-- pass so all FORCE-RLS data remains usable by trusted definer functions.
DO $v301_blueprint_rls$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'blueprints','blueprint_versions','blueprint_components',
  'religious_affiliation_options','evidence_documents','evidence_document_versions',
  'blueprint_component_approval_decisions',
  'blueprint_execution_batches','education_operations',
  'education_operation_organization_roles','education_operation_sites',
  'program_deployments','deployment_offering_adoptions'
 ] LOOP
  EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',t);
 END LOOP;
END $v301_blueprint_rls$;

-- Recorded-instructor learner data: grant by trusted PostgreSQL login binding only.
-- No caller-provided person ID, request GUC or shared application role establishes scope.
CREATE TABLE instructional_learner_login_bindings (
  db_login name NOT NULL,
  course_attempt_id uuid NOT NULL REFERENCES learner_course_attempts(id),
  status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','revoked')),
  valid_from timestamptz NOT NULL,
  valid_through timestamptz,
  PRIMARY KEY(db_login,course_attempt_id),
  CHECK(valid_through IS NULL OR valid_through>valid_from)
);
ALTER TABLE instructional_learner_login_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE instructional_learner_login_bindings FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION v301_instructional_login_can_read_attempt(p_attempt_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $v301_instructional_scope$
 SELECT EXISTS(
   SELECT 1 FROM instructional_learner_login_bindings b
   JOIN pg_roles r ON r.rolname=b.db_login
   WHERE b.db_login=session_user::name
     AND b.course_attempt_id=p_attempt_id
     AND b.status='approved'
     AND b.valid_from<=clock_timestamp()
     AND (b.valid_through IS NULL OR b.valid_through>clock_timestamp())
     AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls
     AND NOT r.rolcreatedb AND NOT r.rolcreaterole
     AND NOT pg_has_role(r.oid,
       (SELECT nspowner FROM pg_namespace WHERE nspname='education_v30'),
       'MEMBER')
     AND current_setting('role',true)='can_v301_recorded_instruction_reader'
 );
$v301_instructional_scope$;

CREATE OR REPLACE FUNCTION v301_instructional_login_can_read_course(p_course_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $v301_instructional_scope$
 SELECT EXISTS(SELECT 1 FROM learner_course_attempts ca
   WHERE ca.course_version_id=p_course_version_id
     AND v301_instructional_login_can_read_attempt(ca.id));
$v301_instructional_scope$;

CREATE OR REPLACE FUNCTION v301_instructional_login_can_read_practice(p_practice_attempt_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $v301_instructional_scope$
 SELECT EXISTS(SELECT 1 FROM formative_practice_attempts p
   WHERE p.id=p_practice_attempt_id
     AND v301_instructional_login_can_read_attempt(p.course_attempt_id));
$v301_instructional_scope$;

CREATE POLICY instructional_learner_attempt_read ON learner_course_attempts FOR SELECT
  USING (v301_instructional_login_can_read_attempt(id));
CREATE POLICY instructional_learner_selection_read ON learner_track_selections FOR SELECT
  USING (v301_instructional_login_can_read_attempt(course_attempt_id));
CREATE POLICY instructional_learner_lesson_progress_read ON learner_lesson_progress FOR SELECT
  USING (v301_instructional_login_can_read_attempt(course_attempt_id));
CREATE POLICY instructional_learner_practice_read ON formative_practice_attempts FOR SELECT
  USING (v301_instructional_login_can_read_attempt(course_attempt_id));
CREATE POLICY instructional_learner_track_version_read ON instructional_track_versions FOR SELECT
  USING (v301_instructional_login_can_read_course(course_version_id));
CREATE POLICY instructional_learner_policy_version_read ON instructional_track_policy_versions FOR SELECT
  USING (v301_instructional_login_can_read_course(course_version_id));
CREATE POLICY instructional_learner_response_read
 ON education_v30_secure.formative_practice_responses FOR SELECT
  USING (v301_instructional_login_can_read_practice(practice_attempt_id));

REVOKE ALL ON FUNCTION v301_instructional_login_can_read_attempt(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_instructional_login_can_read_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v301_instructional_login_can_read_practice(uuid) FROM PUBLIC;

-- Single canonical RLS owner policy pass, after all tables are created.
-- Only the trusted schema-owning database role can read/write protected rows inside
-- SECURITY DEFINER implementations; app roles still need their own scoped policies.
DO $v30_trusted_owner_rls$
DECLARE rec record; trusted_owner name := current_user;
BEGIN
 FOR rec IN SELECT n.nspname,c.relname FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('education_v30','education_v30_secure')
    AND c.relkind IN ('r','p') AND c.relrowsecurity AND c.relforcerowsecurity
 LOOP
  EXECUTE format('CREATE POLICY %I ON %I.%I FOR ALL TO %I USING (true) WITH CHECK (true)',
    'can_v30_trusted_owner_access',rec.nspname,rec.relname,trusted_owner);
 END LOOP;
END $v30_trusted_owner_rls$;

-- Native Blueprint roles: each purpose is explicitly bound to exactly one
-- Organization through database_role_organization_bindings. This cannot be
-- bypassed by an application-supplied Organization or Site identifier.
-- Reading the shared recipe catalog never creates operating authority.
CREATE POLICY blueprint_recipes_read ON blueprints FOR SELECT USING (
 status='active'
 AND (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer')));
CREATE POLICY blueprint_recipe_versions_read ON blueprint_versions FOR SELECT USING (
 lifecycle='published'
 AND (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer')));
CREATE POLICY blueprint_recipe_components_read ON blueprint_components FOR SELECT USING (
 (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer'))
 AND EXISTS(SELECT 1 FROM blueprint_versions bv
   WHERE bv.id=blueprint_components.blueprint_version_id AND bv.lifecycle='published'));
CREATE POLICY blueprint_affiliations_read ON religious_affiliation_options FOR SELECT USING (
 active AND (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer')));

CREATE POLICY blueprint_site_operators_read ON site_organization_roles FOR SELECT USING (
 role_code='operator' AND valid_from<=clock_timestamp()
 AND (valid_through IS NULL OR valid_through>clock_timestamp())
 AND v28_role_can_access_org(organization_id,'blueprint_author'));
CREATE POLICY blueprint_sites_read ON sites FOR SELECT USING (
 status<>'closed' AND EXISTS (
  SELECT 1 FROM site_organization_roles sor WHERE sor.site_id=sites.id
    AND sor.role_code='operator' AND sor.valid_from<=clock_timestamp()
    AND (sor.valid_through IS NULL OR sor.valid_through>clock_timestamp())
    AND v28_role_can_access_org(sor.organization_id,'blueprint_author')));

CREATE POLICY blueprint_catalog_references_read ON blueprint_reference_items FOR SELECT USING (
 status='active' AND (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer')));
CREATE POLICY blueprint_catalog_reference_versions_read ON blueprint_reference_item_versions
 FOR SELECT USING (lifecycle='published'
 AND (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer'))
 AND EXISTS (SELECT 1 FROM blueprint_reference_items i
   WHERE i.id=blueprint_reference_item_versions.item_id AND i.status='active'));
CREATE POLICY blueprint_offerings_read ON offerings FOR SELECT USING (
 status='active' AND (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer')));
CREATE POLICY blueprint_offering_versions_read ON offering_versions FOR SELECT USING (
 lifecycle='published' AND (v28_role_has_purpose('blueprint_author')
   OR v28_role_has_purpose('blueprint_reviewer')));

CREATE POLICY blueprint_configurations_read ON blueprint_configurations FOR SELECT USING (
 owning_organization_id IS NOT NULL
 AND (v28_role_can_access_org(owning_organization_id,'blueprint_author')
   OR v28_role_can_access_org(owning_organization_id,'blueprint_reviewer')));
CREATE POLICY blueprint_configurations_insert ON blueprint_configurations FOR INSERT WITH CHECK (
 owning_organization_id IS NOT NULL
 AND v28_role_can_access_org(owning_organization_id,'blueprint_author'));
CREATE POLICY blueprint_configuration_versions_read ON blueprint_configuration_versions
 FOR SELECT USING (EXISTS (
  SELECT 1 FROM blueprint_configurations bc
  WHERE bc.id=blueprint_configuration_versions.configuration_id
    AND (v28_role_can_access_org(bc.owning_organization_id,'blueprint_author')
      OR v28_role_can_access_org(bc.owning_organization_id,'blueprint_reviewer'))));
CREATE POLICY blueprint_configuration_versions_insert ON blueprint_configuration_versions
 FOR INSERT WITH CHECK (lifecycle='draft' AND EXISTS (
  SELECT 1 FROM blueprint_configurations bc
  WHERE bc.id=blueprint_configuration_versions.configuration_id
    AND v28_role_can_access_org(bc.owning_organization_id,'blueprint_author')));
CREATE POLICY blueprint_configuration_versions_freeze ON blueprint_configuration_versions
 FOR UPDATE
 USING (lifecycle='draft' AND EXISTS (
  SELECT 1 FROM blueprint_configurations bc
  WHERE bc.id=blueprint_configuration_versions.configuration_id
    AND v28_role_can_access_org(bc.owning_organization_id,'blueprint_author')))
 WITH CHECK (lifecycle='frozen' AND frozen_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM blueprint_configurations bc
  WHERE bc.id=blueprint_configuration_versions.configuration_id
    AND v28_role_can_access_org(bc.owning_organization_id,'blueprint_author')));

-- Child records are visible only under a configuration belonging to the
-- caller's bound Organization, and are written only by its Blueprint author.
DO $v301_blueprint_children$
DECLARE rec record;
BEGIN
 FOR rec IN SELECT unnest(ARRAY[
  'blueprint_configuration_components',
  'blueprint_configuration_component_references',
  'blueprint_configuration_offering_intents',
  'blueprint_configuration_local_experiences']) AS table_name
 LOOP
  EXECUTE format(
   'CREATE POLICY blueprint_child_read ON education_v30.%I FOR SELECT USING (
    EXISTS (SELECT 1 FROM education_v30.blueprint_configuration_versions v
     JOIN education_v30.blueprint_configurations bc ON bc.id=v.configuration_id
     WHERE v.id=configuration_version_id AND (
       education_v30.v28_role_can_access_org(bc.owning_organization_id,''blueprint_author'')
       OR education_v30.v28_role_can_access_org(bc.owning_organization_id,''blueprint_reviewer''))))',
    rec.table_name);
  EXECUTE format(
   'CREATE POLICY blueprint_child_insert ON education_v30.%I FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM education_v30.blueprint_configuration_versions v
     JOIN education_v30.blueprint_configurations bc ON bc.id=v.configuration_id
     WHERE v.id=configuration_version_id AND v.lifecycle=''draft''
       AND education_v30.v28_role_can_access_org(bc.owning_organization_id,''blueprint_author'')))',
   rec.table_name);
 END LOOP;
END $v301_blueprint_children$;

CREATE POLICY blueprint_reviews_read ON configuration_reviews FOR SELECT USING (
 EXISTS (SELECT 1 FROM blueprint_configuration_versions v
  JOIN blueprint_configurations bc ON bc.id=v.configuration_id
  WHERE v.id=configuration_reviews.configuration_version_id
    AND (v28_role_can_access_org(bc.owning_organization_id,'blueprint_author')
      OR v28_role_can_access_org(bc.owning_organization_id,'blueprint_reviewer'))));
CREATE POLICY blueprint_reviews_insert ON configuration_reviews FOR INSERT WITH CHECK (
 EXISTS (SELECT 1 FROM blueprint_configuration_versions v
  JOIN blueprint_configurations bc ON bc.id=v.configuration_id
  WHERE v.id=configuration_reviews.configuration_version_id
    AND v.lifecycle='frozen'
    AND v28_role_can_access_org(bc.owning_organization_id,'blueprint_reviewer')));
CREATE POLICY blueprint_component_decisions_read ON blueprint_component_approval_decisions
 FOR SELECT USING (
 EXISTS (SELECT 1 FROM blueprint_configuration_versions v
  JOIN blueprint_configurations bc ON bc.id=v.configuration_id
  WHERE v.id=blueprint_component_approval_decisions.configuration_version_id
    AND (v28_role_can_access_org(bc.owning_organization_id,'blueprint_author')
      OR v28_role_can_access_org(bc.owning_organization_id,'blueprint_reviewer'))));
CREATE POLICY blueprint_component_decisions_insert ON blueprint_component_approval_decisions
 FOR INSERT WITH CHECK (
 v28_role_can_access_org(authority_organization_id,'blueprint_reviewer')
 AND EXISTS (SELECT 1 FROM blueprint_configuration_versions v
  JOIN blueprint_configurations bc ON bc.id=v.configuration_id
  WHERE v.id=blueprint_component_approval_decisions.configuration_version_id
    AND v.lifecycle='frozen'
    AND bc.owning_organization_id=authority_organization_id));

CREATE POLICY blueprint_review_evidence_read ON evidence_documents FOR SELECT USING (
 v28_role_can_access_org(owning_organization_id,'blueprint_reviewer'));
CREATE POLICY blueprint_review_evidence_versions_read ON evidence_document_versions
 FOR SELECT USING (
 verified_at IS NOT NULL AND (valid_from IS NULL OR valid_from<=CURRENT_DATE)
 AND (valid_through IS NULL OR valid_through>=CURRENT_DATE)
 AND EXISTS (SELECT 1 FROM evidence_documents d
  WHERE d.id=evidence_document_versions.document_id
    AND v28_role_can_access_org(d.owning_organization_id,'blueprint_reviewer')));

CREATE POLICY blueprint_audit_read ON audit_events FOR SELECT USING (
 entity_kind='blueprint_configuration'
 AND owning_organization_id IS NOT NULL
 AND (v28_role_can_access_org(owning_organization_id,'blueprint_author')
   OR v28_role_can_access_org(owning_organization_id,'blueprint_reviewer')));
CREATE POLICY blueprint_audit_insert ON audit_events FOR INSERT WITH CHECK (
 entity_kind='blueprint_configuration'
 AND event_code IN ('blueprint.configuration.created','blueprint.configuration.saved',
   'blueprint.configuration.submitted','blueprint.configuration.reviewed')
 AND owning_organization_id IS NOT NULL
 AND (v28_role_can_access_org(owning_organization_id,'blueprint_author')
   OR v28_role_can_access_org(owning_organization_id,'blueprint_reviewer'))
 AND EXISTS (SELECT 1 FROM blueprint_configurations bc
  WHERE bc.id=audit_events.entity_id
    AND bc.owning_organization_id=audit_events.owning_organization_id));
CREATE POLICY blueprint_domain_event_insert ON domain_events FOR INSERT WITH CHECK (
 aggregate_type='blueprint_configuration'
 AND event_type IN ('BlueprintConfigurationCreated','BlueprintConfigurationSaved',
   'BlueprintConfigurationSubmitted','BlueprintConfigurationReviewed')
 AND EXISTS (SELECT 1 FROM blueprint_configurations bc
  WHERE bc.id=domain_events.aggregate_id
    AND (v28_role_can_access_org(bc.owning_organization_id,'blueprint_author')
      OR v28_role_can_access_org(bc.owning_organization_id,'blueprint_reviewer'))));

-- Approved Blueprint execution can create a *planning* Deployment, not
-- operating authority. The executing Organization must operate the Operation.
CREATE POLICY blueprint_operation_roles_read ON education_operation_organization_roles
 FOR SELECT USING (
  role_code='operator' AND status='approved'
  AND valid_from<=clock_timestamp()
  AND (valid_through IS NULL OR valid_through>clock_timestamp())
  AND v28_role_can_access_org(organization_id,'blueprint_author'));
CREATE POLICY blueprint_operations_read ON education_operations FOR SELECT USING (
 status<>'closed' AND EXISTS(
  SELECT 1 FROM education_operation_organization_roles r
  WHERE r.operation_id=education_operations.id AND r.role_code='operator'
    AND r.status='approved' AND r.valid_from<=clock_timestamp()
    AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
    AND v28_role_can_access_org(r.organization_id,'blueprint_author')));

-- Author access to Operation/Site links is confined to current authorized
-- operators. The purpose-specific SELECT grant must never expose other tenants.
CREATE POLICY blueprint_operation_sites_read ON education_operation_sites FOR SELECT USING (
 valid_from<=clock_timestamp()
 AND (valid_through IS NULL OR valid_through>clock_timestamp())
 AND EXISTS (SELECT 1 FROM education_operation_organization_roles r
   WHERE r.operation_id=education_operation_sites.operation_id
     AND r.role_code='operator' AND r.status='approved'
     AND r.valid_from<=clock_timestamp()
     AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
     AND v28_role_can_access_org(r.organization_id,'blueprint_author'))
 AND EXISTS (SELECT 1 FROM site_organization_roles s
   JOIN education_operation_organization_roles r
     ON r.organization_id=s.organization_id
   WHERE s.site_id=education_operation_sites.site_id
     AND s.role_code='operator'
     AND s.valid_from<=clock_timestamp()
     AND (s.valid_through IS NULL OR s.valid_through>clock_timestamp())
     AND r.operation_id=education_operation_sites.operation_id
     AND r.role_code='operator' AND r.status='approved'
     AND r.valid_from<=clock_timestamp()
     AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
     AND v28_role_can_access_org(r.organization_id,'blueprint_author')));

CREATE POLICY blueprint_batches_read ON blueprint_execution_batches FOR SELECT USING (
 v28_role_can_access_org(executing_organization_id,'blueprint_author'));
CREATE POLICY blueprint_batches_insert ON blueprint_execution_batches FOR INSERT WITH CHECK (
 execution_status='proposed'
 AND v28_role_can_access_org(executing_organization_id,'blueprint_author')
 AND EXISTS (SELECT 1 FROM blueprint_configuration_versions v
  JOIN blueprint_configurations bc ON bc.id=v.configuration_id
  WHERE v.id=blueprint_execution_batches.configuration_version_id
    AND v.lifecycle='frozen'
    AND bc.owning_organization_id=blueprint_execution_batches.executing_organization_id));
CREATE POLICY blueprint_batches_execute ON blueprint_execution_batches FOR UPDATE
 USING (execution_status='proposed'
  AND v28_role_can_access_org(executing_organization_id,'blueprint_author'))
 WITH CHECK (execution_status='executed' AND executed_by_person_id IS NOT NULL
  AND executed_at IS NOT NULL
  AND v28_role_can_access_org(executing_organization_id,'blueprint_author'));

CREATE POLICY blueprint_deployments_read ON program_deployments FOR SELECT USING (
 status='planning'
 AND EXISTS(SELECT 1 FROM education_operation_organization_roles r
  WHERE r.operation_id=program_deployments.operation_id AND r.role_code='operator'
    AND r.status='approved' AND r.valid_from<=clock_timestamp()
    AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
    AND v28_role_can_access_org(r.organization_id,'blueprint_author')));
CREATE POLICY blueprint_deployments_insert ON program_deployments FOR INSERT WITH CHECK (
 status='planning'
 AND EXISTS(SELECT 1 FROM education_operation_organization_roles r
  WHERE r.operation_id=program_deployments.operation_id AND r.role_code='operator'
    AND r.status='approved' AND r.valid_from<=clock_timestamp()
    AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
    AND v28_role_can_access_org(r.organization_id,'blueprint_author')));
CREATE POLICY blueprint_adoptions_read ON deployment_offering_adoptions FOR SELECT USING (
 EXISTS(SELECT 1 FROM program_deployments p
  WHERE p.id=deployment_offering_adoptions.deployment_id AND p.status='planning'));
CREATE POLICY blueprint_adoptions_insert ON deployment_offering_adoptions FOR INSERT WITH CHECK (
 approval_status='proposed'
 AND EXISTS(SELECT 1 FROM program_deployments p
  WHERE p.id=deployment_offering_adoptions.deployment_id AND p.status='planning'));
CREATE POLICY blueprint_outputs_read ON blueprint_outputs FOR SELECT USING (
 EXISTS(SELECT 1 FROM blueprint_execution_batches b
  WHERE b.id=blueprint_outputs.execution_batch_id
    AND v28_role_can_access_org(b.executing_organization_id,'blueprint_author')));
CREATE POLICY blueprint_outputs_insert ON blueprint_outputs FOR INSERT WITH CHECK (
 EXISTS(SELECT 1 FROM blueprint_execution_batches b
  WHERE b.id=blueprint_outputs.execution_batch_id AND b.execution_status='executed'
    AND v28_role_can_access_org(b.executing_organization_id,'blueprint_author')));

CREATE POLICY blueprint_execution_audit_insert ON audit_events FOR INSERT WITH CHECK (
 entity_kind='blueprint_execution_batch' AND event_code='blueprint.configuration.executed'
 AND v28_role_can_access_org(owning_organization_id,'blueprint_author')
 AND EXISTS (SELECT 1 FROM blueprint_execution_batches b
  WHERE b.id=audit_events.entity_id AND b.executing_organization_id=owning_organization_id));
CREATE POLICY blueprint_execution_domain_event_insert ON domain_events FOR INSERT WITH CHECK (
 aggregate_type='BlueprintExecutionBatch' AND event_type='BlueprintConfigurationExecuted'
 AND EXISTS (SELECT 1 FROM blueprint_execution_batches b
  WHERE b.id=domain_events.aggregate_id
    AND v28_role_can_access_org(b.executing_organization_id,'blueprint_author')));

-- Read-only bearer session projection; scoped authority is verified server-side.
CREATE OR REPLACE FUNCTION v301_canonical_session_context(p_secret_hash text)
RETURNS TABLE (
 account_id uuid, session_id uuid, grant_id uuid, person_id uuid,
 role_code text, organization_id uuid, site_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=education_v30,pg_catalog AS $v301_auth$
 SELECT a.id, s.id, g.id, g.person_id, g.role_code, g.organization_id, g.site_id
 FROM canonical_sessions s
 JOIN canonical_accounts a ON a.id=s.account_id
 JOIN canonical_account_grants g ON g.id=s.active_grant_id AND g.account_id=a.id
 JOIN organizations o ON o.id=g.organization_id
 WHERE s.secret_hash=p_secret_hash
   AND a.email_verified_at IS NOT NULL AND a.disabled_at IS NULL
   AND g.active AND g.revoked_at IS NULL
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND s.last_activity_at>clock_timestamp()-interval '30 minutes'
   AND o.status='active'
   AND (
     (g.role_code IN ('blueprint_reviewer','learner') AND g.site_id IS NULL)
     OR (g.role_code IN ('site_admin','registrar') AND EXISTS (
       SELECT 1 FROM site_organization_roles sor
       JOIN sites st ON st.id=sor.site_id
       WHERE sor.site_id=g.site_id AND sor.organization_id=g.organization_id
         AND sor.role_code='operator' AND sor.valid_from<=clock_timestamp()
         AND (sor.valid_through IS NULL OR sor.valid_through>clock_timestamp())
         AND st.status<>'closed'
     ))
   )
$v301_auth$;
REVOKE ALL ON FUNCTION v301_canonical_session_context(text) FROM PUBLIC;

-- Authenticated operators may read the published program catalog only through
-- an Organization/purpose-bound PostgreSQL role. No anonymous catalog access.
CREATE POLICY program_catalog_geographic_areas_read ON geographic_areas FOR SELECT
 USING (v28_role_has_purpose('program_catalog'));
CREATE POLICY program_catalog_site_operators_read ON site_organization_roles FOR SELECT
 USING (role_code='operator'
   AND valid_from<=clock_timestamp()
   AND (valid_through IS NULL OR valid_through>clock_timestamp())
   AND v28_role_can_access_org(organization_id,'program_catalog'));
CREATE POLICY program_catalog_sites_read ON sites FOR SELECT
 USING (EXISTS(SELECT 1 FROM site_organization_roles r
   WHERE r.site_id=sites.id AND r.role_code='operator'
     AND r.valid_from<=clock_timestamp()
     AND (r.valid_through IS NULL OR r.valid_through>clock_timestamp())
     AND v28_role_can_access_org(r.organization_id,'program_catalog')));
-- Curated Blueprint library is reference-only. Expose published, active
-- catalog records to a purpose-bound reader without any Blueprint write authority.
CREATE POLICY program_catalog_blueprint_reference_items_read
 ON blueprint_reference_items FOR SELECT
 USING (status='active' AND v28_role_has_purpose('program_catalog'));
CREATE POLICY program_catalog_blueprint_reference_versions_read
 ON blueprint_reference_item_versions FOR SELECT
 USING (lifecycle='published'
   AND v28_role_has_purpose('program_catalog')
   AND EXISTS (SELECT 1 FROM blueprint_reference_items i
     WHERE i.id=blueprint_reference_item_versions.item_id AND i.status='active'));
CREATE POLICY program_catalog_offerings_read ON offerings FOR SELECT
 USING (status='active' AND v28_role_has_purpose('program_catalog'));
CREATE POLICY program_catalog_offering_versions_read ON offering_versions FOR SELECT
 USING (lifecycle='published' AND v28_role_has_purpose('program_catalog'));
CREATE POLICY program_catalog_fit_policies_read ON qualification_program_fit_policies FOR SELECT
 USING (status='active' AND v28_role_has_purpose('program_catalog'));
CREATE POLICY program_catalog_fit_policy_versions_read
 ON qualification_program_fit_policy_versions FOR SELECT
 USING (lifecycle='published' AND offering_version_id IS NOT NULL
   AND v28_role_has_purpose('program_catalog')
   AND EXISTS(SELECT 1 FROM qualification_program_fit_policies p
     WHERE p.id=qualification_program_fit_policy_versions.policy_id AND p.status='active')
   AND NOT EXISTS(SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
     WHERE w.policy_version_id=qualification_program_fit_policy_versions.id
       AND w.effective_at<=clock_timestamp()));
CREATE POLICY program_catalog_fit_policy_withdrawals_read
 ON qualification_program_fit_policy_version_withdrawals FOR SELECT
 USING (v28_role_has_purpose('program_catalog'));

-- Execution grants are intentionally NOT issued to unknown runtime roles in a DDL target.
-- Grant EXECUTE on service functions only to explicitly provisioned, authenticated roles.
REVOKE ALL ON FUNCTION v30_catalog_program_availability(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION v28_role_can_access_org(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION v28_role_has_purpose(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION v30_evaluation_basis_is_current(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v30_program_fit_basis_is_current(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION v29_assert_reviewer_permission(uuid,uuid,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION v291_preliminary_guidance(uuid) FROM PUBLIC;

-- Preserve PR279's curated material as reference-only Blueprint inputs.
-- No reference row creates a Program, Offering, Deployment, enrollment, or authority.
WITH seed AS (
  SELECT x.code,CASE x.kind WHEN 'program' THEN 'program_model' ELSE x.kind END AS reference_kind,
    x.category,x.name,x.summary,x.sort_order,x.metadata
  FROM jsonb_to_recordset($catalog$[{"code":"can.program.middle_school_6_8","kind":"program","category":"core","name":"Middle School Academy · Grades 6–8","summary":"A complete middle-grade academy with shared instruction, local learning support, and a community experience.","sort_order":1,"metadata":{"grade_range":{"min":"6","max":"8"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"08:00","end":"14:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.high_school_9_12","kind":"program","category":"core","name":"High School Academy · Grades 9–12","summary":"A four-year secondary pathway with centrally delivered academics and local support; credits and diplomas require independent authorization.","sort_order":2,"metadata":{"grade_range":{"min":"9","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"08:00","end":"14:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization","credit_issuer","graduation_policy"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.combined_6_12","kind":"program","category":"core","name":"Combined Academy · Grades 6–12","summary":"One site serving middle and high school students through distinct age-appropriate cohorts and authorized programs.","sort_order":3,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"08:00","end":"14:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.k8_extension","kind":"program","category":"extension","name":"K–8 Continuation Program","summary":"An existing elementary or K–8 school explores a continuation into approved secondary grades.","sort_order":4,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"08:00","end":"14:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization","academic_provider"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.high_school_extension","kind":"program","category":"extension","name":"High School Extension","summary":"A high-school pathway hosted by an existing school or community organization with a verified academic provider.","sort_order":5,"metadata":{"grade_range":{"min":"9","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"08:00","end":"14:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization","credit_issuer"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.after_school","kind":"program","category":"extended","name":"After-School Enrichment","summary":"Supervised tutoring, clubs, projects, and recreation outside the core instructional day.","sort_order":6,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"14:30","end":"17:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.summer_enrichment","kind":"program","category":"extended","name":"Summer Enrichment","summary":"Noncredit summer workshops, creativity, service, and recreation with defined seasonal staffing.","sort_order":7,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"15:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.summer_academic","kind":"program","category":"extended","name":"Summer Academic Support","summary":"Structured summer academic instruction or credit recovery under an appropriate academic provider.","sort_order":8,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"15:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization","academic_provider","credit_policy"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.saturday_academy","kind":"program","category":"extended","name":"Saturday Academy","summary":"Optional Saturday tutoring, clubs, language study, and community seminars.","sort_order":9,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["sat"],"start":"08:00","end":"12:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.homeschool_cohort","kind":"program","category":"alternative","name":"Homeschool Learning Cohort","summary":"A local space for homeschool families to pursue selected curriculum and shared social experiences.","sort_order":10,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"09:00","end":"13:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.hybrid_academy","kind":"program","category":"alternative","name":"Hybrid Learning Academy","summary":"A planned combination of onsite support, asynchronous learning, and home-based work.","sort_order":11,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["mon","wed","fri"],"start":"09:00","end":"14:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.stem_immersion","kind":"program","category":"extended","name":"STEM Immersion Program","summary":"A seasonal science, technology, engineering and mathematics enrichment program.","sort_order":12,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"09:00","end":"15:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization","equipment_safety"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.literacy_bridge","kind":"program","category":"extended","name":"Literacy & Learning Bridge","summary":"Targeted reading, writing, and academic readiness support before or after the school day.","sort_order":13,"metadata":{"grade_range":{"min":"6","max":"10"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"14:30","end":"17:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.program.college_career_bridge","kind":"program","category":"extended","name":"College & Career Bridge","summary":"Career discovery, college readiness, advising, and portfolio-building opportunities.","sort_order":14,"metadata":{"grade_range":{"min":"9","max":"12"},"schedule_suggestion":{"days":["mon","tue","wed","thu","fri"],"start":"14:30","end":"17:00"},"requirements":["site_capacity","onsite_staffing","safeguarding","authorization"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.chess","kind":"club","category":"academics","name":"Chess Club","summary":"Weekly strategy, friendly matches and optional tournaments.","sort_order":15,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.debate","kind":"club","category":"academics","name":"Debate Society","summary":"Evidence-based argumentation, public speaking and respectful dialogue.","sort_order":16,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.robotics","kind":"club","category":"stem","name":"Robotics Club","summary":"Team engineering, coding, prototyping and optional competitions.","sort_order":17,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.coding","kind":"club","category":"stem","name":"Coding Club","summary":"Student-led software and creative programming projects.","sort_order":18,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.math_team","kind":"club","category":"stem","name":"Math Team","summary":"Math challenges, collaborative problem solving and academic competitions.","sort_order":19,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.choir","kind":"club","category":"arts","name":"Student Choir","summary":"Vocal ensemble, musicianship and optional performances.","sort_order":20,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.instrumental_music","kind":"club","category":"arts","name":"Instrumental Music Club","summary":"Instrument practice, ensemble collaboration and performance opportunities.","sort_order":21,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.music_production","kind":"club","category":"arts","name":"Music Production Studio","summary":"Composition, audio recording and digital music skills.","sort_order":22,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.visual_arts","kind":"club","category":"arts","name":"Visual Arts Collective","summary":"Drawing, painting, exhibition and portfolio work.","sort_order":23,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.theatre","kind":"club","category":"arts","name":"Theatre Guild","summary":"Acting, stagecraft and student performances.","sort_order":24,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.photography","kind":"club","category":"arts","name":"Photography Club","summary":"Visual storytelling, photo essays and student exhibitions.","sort_order":25,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.creative_writing","kind":"club","category":"humanities","name":"Creative Writing Circle","summary":"Writing workshops, peer review and publication.","sort_order":26,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.student_journalism","kind":"club","category":"humanities","name":"Student Newspaper","summary":"News writing, editing, reporting and media literacy.","sort_order":27,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.student_government","kind":"club","category":"leadership","name":"Student Government","summary":"Student voice, representation and responsible service.","sort_order":28,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.service_corps","kind":"club","category":"leadership","name":"Student Service Corps","summary":"Student-organized service opportunities and reflection.","sort_order":29,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.entrepreneurship","kind":"club","category":"innovation","name":"Entrepreneurship Club","summary":"Small ventures, budgeting and pitch practice.","sort_order":30,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.heritage_languages","kind":"club","category":"culture","name":"Heritage Language Circle","summary":"Voluntary language practice and cultural exchange.","sort_order":31,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.garden_club","kind":"club","category":"environment","name":"Garden Club","summary":"School gardening, ecology and stewardship.","sort_order":32,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.club.wellness_club","kind":"club","category":"wellness","name":"Wellness & Movement Club","summary":"Safe movement, healthy habits and peer encouragement.","sort_order":33,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["wed"],"start":"15:00","end":"16:00"},"requirements":["advisor","space","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.soccer","kind":"activity","category":"athletics","name":"Soccer","summary":"Seasonal soccer training, fitness and optional competitive matches.","sort_order":34,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.football","kind":"activity","category":"athletics","name":"Football","summary":"Football planning reference; contact play requires special staffing, governing rules and concussion safeguards.","sort_order":35,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.flag_football","kind":"activity","category":"athletics","name":"Flag Football","summary":"Noncontact team football skill-building and recreational play.","sort_order":36,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.basketball","kind":"activity","category":"athletics","name":"Basketball","summary":"Skills, team play and seasonal basketball opportunities.","sort_order":37,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.volleyball","kind":"activity","category":"athletics","name":"Volleyball","summary":"Teamwork, technique and intramural volleyball.","sort_order":38,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.track_field","kind":"activity","category":"athletics","name":"Track & Field","summary":"Running, throwing and jumping with appropriate facilities and oversight.","sort_order":39,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.cross_country","kind":"activity","category":"athletics","name":"Cross-Country Running","summary":"Supervised distance-running program with documented route and heat safety.","sort_order":40,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.tennis","kind":"activity","category":"athletics","name":"Tennis","summary":"Recreational tennis instruction and friendly matches.","sort_order":41,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.dance","kind":"activity","category":"wellness","name":"Dance & Movement","summary":"Age-appropriate dance, choreography and performance.","sort_order":42,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.fitness","kind":"activity","category":"wellness","name":"Fitness & Conditioning","summary":"Inclusive strength, conditioning and healthy movement.","sort_order":43,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.activity.outdoor_exploration","kind":"activity","category":"recreation","name":"Outdoor Exploration","summary":"Supervised hikes and outdoor learning with site-specific safety plans.","sort_order":44,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{"days":["tue","thu"],"start":"15:00","end":"16:30"},"requirements":["coach_or_facilitator","facility","risk_review","safeguarding","guardian_permission"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.food_pantry","kind":"community","category":"service","name":"Food Pantry Service","summary":"Organize approved volunteer support for local food distribution and family food security.","sort_order":45,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.neighborhood_cleanup","kind":"community","category":"service","name":"Neighborhood Cleanup","summary":"Plan a safe, supervised neighborhood cleanup and reflection.","sort_order":46,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.senior_visits","kind":"community","category":"service","name":"Senior Community Visits","summary":"Build intergenerational relationships through supervised visits or correspondence.","sort_order":47,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.community_garden","kind":"community","category":"service","name":"Community Garden","summary":"Grow a community garden with shared stewardship and seasonal harvest activities.","sort_order":48,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.literacy_buddies","kind":"community","category":"service","name":"Literacy Buddies","summary":"Peer reading mentorship and community literacy engagement.","sort_order":49,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.family_fellowship","kind":"community","category":"families","name":"Family Fellowship Nights","summary":"School-wide family meals, conversation and community celebrations.","sort_order":50,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.parent_learning","kind":"community","category":"families","name":"Parent Learning Workshops","summary":"Practical workshops on learning, communication and family support.","sort_order":51,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.family_mentor_circle","kind":"community","category":"families","name":"Family Mentor Circle","summary":"Opt-in peer support among families and school community mentors.","sort_order":52,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.cultural_showcase","kind":"community","category":"culture","name":"Cultural Heritage Showcase","summary":"Community-led heritage, language, food and storytelling celebrations.","sort_order":53,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.oral_history_exchange","kind":"community","category":"culture","name":"Local Oral History Exchange","summary":"Document community memories and shared history with consent.","sort_order":54,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.student_leadership","kind":"community","category":"leadership","name":"Student Leadership Forums","summary":"Student discussions, service planning and leadership practice.","sort_order":55,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.community_dialogue","kind":"community","category":"civic","name":"Community Listening Forums","summary":"Structured, respectful conversations with local community partners.","sort_order":56,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.community.interfaith_service","kind":"community","category":"service","name":"Cross-Community Service Day","summary":"Optional shared service across community organizations; no assumed religious participation.","sort_order":57,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["community_partner","safeguarding","participant_consent"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.robotics_design_lab","kind":"experience","category":"stem","name":"Robotics & Design Lab","summary":"A guided engineering experience with prototypes, testing and student reflection.","sort_order":58,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.state_capitol_visit","kind":"experience","category":"civic","name":"State Capitol Visit","summary":"A supervised civics experience at a state capitol or legislative venue.","sort_order":59,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["adult_supervision","approved_location","transportation","guardian_permission","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.capstone_research","kind":"experience","category":"academic","name":"Capstone Research Studio","summary":"A multiweek inquiry project culminating in a documented student presentation.","sort_order":60,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.entrepreneurship_market","kind":"experience","category":"enterprise","name":"Entrepreneurship Market Day","summary":"Student ventures explore product, pricing, marketing and responsible enterprise.","sort_order":61,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.college_exposure","kind":"experience","category":"college","name":"College Exposure Visit","summary":"Campus exposure and college readiness conversations with verified partners.","sort_order":62,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.museum_studies","kind":"experience","category":"humanities","name":"Museum Studies Visit","summary":"Connect history, science, or art coursework with a local museum experience.","sort_order":63,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.science_fieldwork","kind":"experience","category":"stem","name":"Science Fieldwork","summary":"Collect and analyze real-world observations using an approved field protocol.","sort_order":64,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["adult_supervision","approved_location","transportation","guardian_permission","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.student_maker_fair","kind":"experience","category":"stem","name":"Student Maker Fair","summary":"Showcase inventions, design work and student-created solutions.","sort_order":65,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.local_history_project","kind":"experience","category":"humanities","name":"Local History Project","summary":"Research and present local history using primary sources and community interviews.","sort_order":66,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.community_impact","kind":"experience","category":"service","name":"Community Impact Capstone","summary":"Design and evaluate a measurable local service or improvement project.","sort_order":67,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.career_shadowing","kind":"experience","category":"career","name":"Career Exploration Day","summary":"Meet professionals through a structured, safeguarded career exposure program.","sort_order":68,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["adult_supervision","approved_location","transportation","guardian_permission","safeguarding"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.arts_showcase","kind":"experience","category":"arts","name":"Student Arts Showcase","summary":"Curate a public exhibition or performance of approved student work.","sort_order":69,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.model_un","kind":"experience","category":"civic","name":"Model United Nations","summary":"Explore diplomacy, research and cooperative decision-making.","sort_order":70,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.code_hackathon","kind":"experience","category":"stem","name":"Student Coding Challenge","summary":"A time-bounded collaborative programming event focused on accessible problems.","sort_order":71,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.watershed_inquiry","kind":"experience","category":"environment","name":"Local Watershed Inquiry","summary":"Investigate a nearby environmental question with supervised field observations.","sort_order":72,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.literary_festival","kind":"experience","category":"literature","name":"Student Literary Festival","summary":"Student readings, writing workshops and original publications.","sort_order":73,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}},{"code":"can.experience.civic_leadership_forum","kind":"experience","category":"leadership","name":"Civic Leadership Forum","summary":"Practice public speaking, listening and evidence-based civic participation.","sort_order":74,"metadata":{"grade_range":{"min":"6","max":"12"},"schedule_suggestion":{},"requirements":["learning_objectives","staffing","safety_review","student_deliverables"],"reference_only":true,"publication":"planning_only","curriculum_rights":"separately_verified"}}]$catalog$::jsonb) AS x(
    code text,kind text,category text,name text,summary text,sort_order integer,metadata jsonb)
), catalog_items AS (
  INSERT INTO blueprint_reference_items(code,reference_kind,category,sort_order)
  SELECT code,reference_kind,category,sort_order FROM seed
  ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code
  RETURNING id,code
)
INSERT INTO blueprint_reference_item_versions(
  item_id,version_no,title,summary,description,grade_range,schedule_suggestion,
  configuration_guidance,metadata,lifecycle,published_at)
SELECT i.id,1,s.name,s.summary,s.summary,
  COALESCE(s.metadata->'grade_range','{}'::jsonb),
  COALESCE(s.metadata->'schedule_suggestion','{}'::jsonb),
  s.metadata,s.metadata,'published',clock_timestamp()
FROM seed s JOIN catalog_items i USING(code)
ON CONFLICT(item_id,version_no) DO NOTHING;

-- Re-apply the assessment result gate now that noncredit tables exist.
-- Never relax human review for official or school assessments.
CREATE OR REPLACE FUNCTION validate_assessment_result() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE a record; expected numeric(12,4); earned numeric(12,4); n_items integer; n_scored integer; prior record;
BEGIN
 SELECT state INTO a FROM assessment_attempts WHERE id=NEW.attempt_id;
 IF a.state NOT IN ('submitted','scored','finalized') THEN
    RAISE EXCEPTION 'Result cannot be recorded before assessment submission'; END IF;
 IF NEW.result_revision=1 AND NEW.supersedes_id IS NOT NULL THEN
   RAISE EXCEPTION 'First assessment result cannot supersede a prior result'; END IF;
 IF NEW.result_revision>1 THEN
   SELECT attempt_id,result_revision INTO prior FROM assessment_attempt_results WHERE id=NEW.supersedes_id;
   IF prior.attempt_id IS DISTINCT FROM NEW.attempt_id OR prior.result_revision<>NEW.result_revision-1 THEN
     RAISE EXCEPTION 'Assessment result correction must supersede previous revision on same attempt'; END IF;
 END IF;
 IF NEW.result_status IN ('reviewed','finalized') THEN
   -- Only a published, noncredit, objective check can be finalized automatically.
   -- School, official, credential and human-scored assessments retain reviewer gates.
   IF NEW.reviewed_by_person_id IS NULL AND NOT (
     NEW.result_status='finalized'
     AND NEW.result_evidence->>'noncreditAutoFinalized'='v1'
     AND EXISTS (
       SELECT 1
       FROM assessment_attempts attempt
       JOIN assessment_access_grants access ON access.id=attempt.access_grant_id
       JOIN learner_course_attempts course ON course.id=access.course_attempt_id
       JOIN noncredit_registrations registration ON registration.id=course.noncredit_registration_id
       JOIN noncredit_training_versions training ON training.id=registration.training_version_id
       JOIN assessment_administrations administration ON administration.id=attempt.administration_id
       JOIN assessment_versions version ON version.id=administration.assessment_version_id
       JOIN assessment_definitions definition ON definition.id=version.assessment_id
       WHERE attempt.id=NEW.attempt_id
         AND attempt.state='scored'
         AND access.access_status='approved'
         AND access.learner_id=attempt.learner_id
         AND registration.learner_id=attempt.learner_id
         AND course.status='active' AND course.enrollment_id IS NULL
         AND course.section_id IS NULL
         AND registration.status IN ('registered','active')
         AND registration.deployment_id=course.deployment_id
         AND training.state='published'
         AND training.assessment_version_id=administration.assessment_version_id
         AND administration.deployment_id=course.deployment_id
         AND administration.course_version_id=course.course_version_id
         AND administration.administering_organization_id=training.provider_organization_id
         AND administration.proctor_policy='none'
         AND administration.status='open'
         AND version.lifecycle='published'
         AND definition.purpose IN ('formative','practice','readiness','mastery')
         AND NOT EXISTS (
           SELECT 1 FROM assessment_attempt_items ai
           JOIN assessment_item_versions item ON item.id=ai.item_version_id
           WHERE ai.attempt_id=attempt.id
             AND (
               item.response_kind NOT IN ('single_select','multi_select','true_false')
               OR NOT EXISTS (
                 SELECT 1 FROM assessment_item_scoring_decisions scoring
                 WHERE scoring.attempt_item_id=ai.id
                   AND scoring.scoring_kind='automated'
                   AND scoring.scoring_engine_version='can-noncredit-objective-v1'
                   AND NOT EXISTS (
                     SELECT 1 FROM assessment_item_scoring_decisions newer
                     WHERE newer.attempt_item_id=ai.id
                       AND newer.decision_order>scoring.decision_order
                   )
               )
             )
         )
     )
   ) THEN
     RAISE EXCEPTION 'Reviewed/final result requires an accountable reviewer'; END IF;
   SELECT count(*),sum(points_available) INTO n_items,expected
     FROM assessment_attempt_items WHERE attempt_id=NEW.attempt_id;
   IF n_items=0 THEN RAISE EXCEPTION 'Result cannot finalize an empty assessment'; END IF;
   SELECT count(*),coalesce(sum(score),0) INTO n_scored,earned FROM (
     SELECT DISTINCT ON (ai.id) ai.id, sd.score
     FROM assessment_attempt_items ai
     JOIN assessment_item_scoring_decisions sd ON sd.attempt_item_id=ai.id
     WHERE ai.attempt_id=NEW.attempt_id
     ORDER BY ai.id,sd.decision_order DESC
   ) scored;
   IF n_items<>n_scored OR NEW.points_possible<>expected OR NEW.points_earned<>earned THEN
     RAISE EXCEPTION 'Assessment result must equal complete item-level scoring'; END IF;
 END IF;
 RETURN NEW;
END $$;


-- 58. Learning achievement awards: noncredit certificates and digital badges.
-- Aligned with patch-achievement-credentials.sql; existing academic credential
-- tables remain authoritative and unchanged. No runtime role grants.
CREATE TABLE learning_award_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_organization_id uuid NOT NULL REFERENCES organizations(id),
  code text NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 80),
  kind text NOT NULL CHECK (kind IN ('completion_certificate','digital_badge')),
  source_kind text NOT NULL CHECK (source_kind IN ('noncredit_completion','verified_activity')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuer_organization_id,code)
);
CREATE TABLE learning_award_definition_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES learning_award_definitions(id),
  version_no integer NOT NULL CHECK (version_no>0),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '',
  minimum_verified_minutes integer NOT NULL DEFAULT 0 CHECK (minimum_verified_minutes>=0),
  lifecycle text NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','published','retired')),
  created_by_person_id uuid NOT NULL REFERENCES persons(id),
  approved_by_person_id uuid REFERENCES persons(id),
  published_at timestamptz,
  UNIQUE (definition_id,version_no),
  CHECK (lifecycle<>'published' OR (
    approved_by_person_id IS NOT NULL AND published_at IS NOT NULL
    AND approved_by_person_id<>created_by_person_id
  ))
);
CREATE TABLE learner_achievement_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_definition_version_id uuid NOT NULL REFERENCES learning_award_definition_versions(id),
  recipient_person_id uuid NOT NULL REFERENCES persons(id),
  noncredit_completion_decision_id uuid REFERENCES noncredit_completion_decisions(id),
  activity_evidence_version_id uuid REFERENCES evidence_document_versions(id),
  decided_by_person_id uuid NOT NULL REFERENCES persons(id),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK (num_nonnulls(noncredit_completion_decision_id,activity_evidence_version_id)=1),
  CHECK (decided_by_person_id<>recipient_person_id)
);
CREATE UNIQUE INDEX achievement_noncredit_once ON learner_achievement_decisions
  (credential_definition_version_id,noncredit_completion_decision_id)
  WHERE noncredit_completion_decision_id IS NOT NULL;
CREATE UNIQUE INDEX achievement_activity_once ON learner_achievement_decisions
  (credential_definition_version_id,recipient_person_id,activity_evidence_version_id)
  WHERE activity_evidence_version_id IS NOT NULL;

-- A noncredit completion certificate still originates in the v3.0.1
-- noncredit_completion_certificates table. The generic registry points to it;
-- it does not silently create a second independent certificate.
CREATE TABLE learning_award_issuances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_decision_id uuid NOT NULL UNIQUE REFERENCES learner_achievement_decisions(id),
  issuer_organization_id uuid NOT NULL REFERENCES organizations(id),
  legacy_noncredit_certificate_id uuid UNIQUE REFERENCES noncredit_completion_certificates(id),
  credential_reference text NOT NULL UNIQUE CHECK (length(btrim(credential_reference)) BETWEEN 12 AND 160),
  issued_by_person_id uuid NOT NULL REFERENCES persons(id),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz,
  CHECK (expires_at IS NULL OR expires_at>issued_at)
);
CREATE INDEX learning_award_issuances_issuer_idx ON learning_award_issuances (issuer_organization_id,issued_at);
CREATE TABLE learning_award_issuance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES learning_award_issuances(id),
  event_kind text NOT NULL CHECK (event_kind IN ('revoked')),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  evidence_version_id uuid NOT NULL REFERENCES evidence_document_versions(id),
  decided_by_person_id uuid NOT NULL REFERENCES persons(id),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE UNIQUE INDEX credential_revoked_once ON learning_award_issuance_events (issuance_id)
  WHERE event_kind='revoked';
CREATE TABLE learning_award_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuance_id uuid NOT NULL REFERENCES learning_award_issuances(id),
  format text NOT NULL CHECK (format IN ('pdf','badge_json','png')),
  artifact_version integer NOT NULL CHECK (artifact_version>0),
  storage_reference text NOT NULL CHECK (length(btrim(storage_reference))>0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuance_id,format,artifact_version)
);
CREATE INDEX learning_award_artifacts_issuance_idx ON learning_award_artifacts (issuance_id);

-- Published definitions are identities, not mutable display labels. Use a
-- new definition/version for a new interpretation or future recognition mode.
CREATE FUNCTION v301_guard_credential_definition() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Credential definition identity is immutable';
END $$;
CREATE TRIGGER credential_definition_immutable BEFORE UPDATE OR DELETE ON learning_award_definitions
  FOR EACH ROW EXECUTE FUNCTION v301_guard_credential_definition();

CREATE FUNCTION v301_guard_credential_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
  IF TG_OP='DELETE' OR OLD.lifecycle<>'draft'
    THEN RAISE EXCEPTION 'Published or retired credential versions are immutable'; END IF;
  IF (NEW.definition_id,NEW.version_no,NEW.created_by_person_id)
       IS DISTINCT FROM (OLD.definition_id,OLD.version_no,OLD.created_by_person_id)
    THEN RAISE EXCEPTION 'Credential version identity cannot change'; END IF;
  IF NEW.lifecycle='published' THEN
    IF (NEW.title,NEW.description,NEW.minimum_verified_minutes)
         IS DISTINCT FROM (OLD.title,OLD.description,OLD.minimum_verified_minutes)
      THEN RAISE EXCEPTION 'Freeze credential definition before publishing'; END IF;
    IF NEW.approved_by_person_id IS NULL OR NEW.published_at IS NULL
      OR NEW.approved_by_person_id=NEW.created_by_person_id
      THEN RAISE EXCEPTION 'Independent approval required for published credential'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_version_approval_guard BEFORE UPDATE OR DELETE ON learning_award_definition_versions
  FOR EACH ROW EXECUTE FUNCTION v301_guard_credential_version();

CREATE FUNCTION v301_validate_achievement_award() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE definition record; source_record record; v record;
BEGIN
  SELECT d.kind,d.source_kind,d.issuer_organization_id,version.lifecycle,
         version.minimum_verified_minutes INTO definition
    FROM learning_award_definition_versions version
    JOIN learning_award_definitions d ON d.id=version.definition_id
    WHERE version.id=NEW.credential_definition_version_id;
  IF definition.lifecycle IS DISTINCT FROM 'published'
    THEN RAISE EXCEPTION 'Credential definition is not published'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM canonical_account_grants grant_row
    WHERE grant_row.person_id=NEW.decided_by_person_id
      AND grant_row.organization_id=definition.issuer_organization_id
      AND grant_row.role_code IN ('registrar','site_admin')
      AND grant_row.active AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Award decision requires active issuer staff grant'; END IF;
  IF NEW.noncredit_completion_decision_id IS NOT NULL THEN
    IF definition.source_kind<>'noncredit_completion'
      THEN RAISE EXCEPTION 'Credential source kind mismatch'; END IF;
    SELECT completion.outcome,reg.participant_person_id,
      training.provider_organization_id INTO source_record
      FROM noncredit_completion_decisions completion
      JOIN noncredit_registrations reg ON reg.id=completion.registration_id
      JOIN noncredit_training_versions training ON training.id=reg.training_version_id
      WHERE completion.id=NEW.noncredit_completion_decision_id
        AND NOT EXISTS (SELECT 1 FROM noncredit_completion_decisions later
          WHERE later.supersedes_id=completion.id);
    IF source_record.outcome IS DISTINCT FROM 'completed'
      OR source_record.participant_person_id IS DISTINCT FROM NEW.recipient_person_id
      OR source_record.provider_organization_id IS DISTINCT FROM definition.issuer_organization_id
      THEN RAISE EXCEPTION 'Award requires current provider-owned completion'; END IF;
  ELSE
    IF definition.source_kind<>'verified_activity'
      THEN RAISE EXCEPTION 'Credential source kind mismatch'; END IF;
    -- The canonical Activity/registration integration is still pending.
    -- A document alone does not attest to a child's registration or attendance.
    -- Disallow activity award inserts until verified session evidence is wired.
    RAISE EXCEPTION 'Verified activity award source is not yet enabled';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_achievement_evidence BEFORE INSERT ON learner_achievement_decisions
  FOR EACH ROW EXECUTE FUNCTION v301_validate_achievement_award();

CREATE FUNCTION v301_validate_credential_issuance() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE award record; legacy record;
BEGIN
  SELECT a.noncredit_completion_decision_id,a.recipient_person_id,d.kind,d.source_kind,
         d.issuer_organization_id INTO award
   FROM learner_achievement_decisions a
   JOIN learning_award_definition_versions v ON v.id=a.credential_definition_version_id
   JOIN learning_award_definitions d ON d.id=v.definition_id
   WHERE a.id=NEW.achievement_decision_id FOR SHARE OF a;
  IF award.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
    THEN RAISE EXCEPTION 'Credential issuer mismatch'; END IF;
  IF NEW.issued_by_person_id=award.recipient_person_id OR NOT EXISTS (
    SELECT 1 FROM canonical_account_grants grant_row
    WHERE grant_row.person_id=NEW.issued_by_person_id
      AND grant_row.organization_id=NEW.issuer_organization_id
      AND grant_row.role_code IN ('registrar','site_admin')
      AND grant_row.active AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Issuance requires active, independent issuer staff'; END IF;
  IF award.source_kind='noncredit_completion' AND award.kind='completion_certificate' THEN
    SELECT decision_id,issuer_organization_id,status INTO legacy
    FROM noncredit_completion_certificates WHERE id=NEW.legacy_noncredit_certificate_id;
    IF legacy.decision_id IS DISTINCT FROM award.noncredit_completion_decision_id
      OR legacy.issuer_organization_id IS DISTINCT FROM NEW.issuer_organization_id
      OR legacy.status IS DISTINCT FROM 'issued'
      THEN RAISE EXCEPTION 'Noncredit certificate must reuse its canonical certificate'; END IF;
  ELSIF NEW.legacy_noncredit_certificate_id IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy certificate is only valid for noncredit completion certificates';
  END IF;
  IF award.noncredit_completion_decision_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM noncredit_completion_decisions newer
    WHERE newer.supersedes_id=award.noncredit_completion_decision_id)
    THEN RAISE EXCEPTION 'Award evidence has been superseded'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_issuance_evidence BEFORE INSERT ON learning_award_issuances
 FOR EACH ROW EXECUTE FUNCTION v301_validate_credential_issuance();

-- Revocations require independently verified evidence belonging to the issuer.
CREATE FUNCTION v301_validate_credential_revocation() RETURNS trigger
LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE issuer uuid; evidence record;
BEGIN
  SELECT issuer_organization_id INTO issuer FROM learning_award_issuances
    WHERE id=NEW.issuance_id FOR SHARE;
  IF issuer IS NULL THEN RAISE EXCEPTION 'Unknown credential issuer'; END IF;
  SELECT version.verified_at,version.verified_by_person_id,
         document.owning_organization_id INTO evidence
    FROM evidence_document_versions version
    JOIN evidence_documents document ON document.id=version.document_id
    WHERE version.id=NEW.evidence_version_id;
  IF evidence.verified_at IS NULL OR evidence.verified_by_person_id IS NULL
    OR evidence.owning_organization_id IS DISTINCT FROM issuer
    THEN RAISE EXCEPTION 'Revocation requires verified issuer-owned evidence'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM canonical_account_grants grant_row
    WHERE grant_row.person_id=NEW.decided_by_person_id
      AND grant_row.organization_id=issuer
      AND grant_row.role_code IN ('registrar','site_admin')
      AND grant_row.active AND grant_row.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'Only current issuer staff can revoke'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER credential_revocation_provenance BEFORE INSERT ON learning_award_issuance_events
  FOR EACH ROW EXECUTE FUNCTION v301_validate_credential_revocation();

-- A point-in-time PDF is never authoritative. Re-evaluate source freshness,
-- legacy certificate state, expiry and append-only revocation on each read.
CREATE FUNCTION v301_credential_is_current(p_issuance_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=education_v30,pg_catalog AS $$
 SELECT EXISTS (
   SELECT 1 FROM learning_award_issuances issuance
   JOIN learner_achievement_decisions decision
     ON decision.id=issuance.achievement_decision_id
   LEFT JOIN noncredit_completion_decisions completion
     ON completion.id=decision.noncredit_completion_decision_id
   LEFT JOIN noncredit_completion_certificates legacy
     ON legacy.id=issuance.legacy_noncredit_certificate_id
   WHERE issuance.id=p_issuance_id
     AND (issuance.expires_at IS NULL OR issuance.expires_at>now())
     AND NOT EXISTS (SELECT 1 FROM learning_award_issuance_events revocation
       WHERE revocation.issuance_id=issuance.id AND revocation.event_kind='revoked')
     AND (issuance.legacy_noncredit_certificate_id IS NULL OR legacy.status='issued')
     AND (decision.noncredit_completion_decision_id IS NULL
       OR (completion.outcome='completed'
         AND NOT EXISTS (SELECT 1 FROM noncredit_completion_decisions newer
           WHERE newer.supersedes_id=completion.id)))
 );
$$;

-- Award evidence and issued artifacts are append-only; a revocation is an event.
CREATE TRIGGER achievement_decisions_immutable BEFORE UPDATE OR DELETE ON learner_achievement_decisions
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER learning_award_issuances_immutable BEFORE UPDATE OR DELETE ON learning_award_issuances
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER learning_award_issuance_events_immutable BEFORE UPDATE OR DELETE ON learning_award_issuance_events
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();
CREATE TRIGGER learning_award_artifacts_immutable BEFORE UPDATE OR DELETE ON learning_award_artifacts
 FOR EACH ROW EXECUTE FUNCTION v27_reject_update_delete();

-- Fail closed: only the applying schema owner can inspect or mutate these
-- new relations. A dedicated scoped issuer role/RLS policy must be audited
-- before wiring application issuance.
DO $policies$
DECLARE table_name text; schema_owner name := current_user;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'learning_award_definitions','learning_award_definition_versions',
    'learner_achievement_decisions','learning_award_issuances',
    'learning_award_issuance_events','learning_award_artifacts'
  ] LOOP
    EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY credential_owner_only ON education_v30.%I TO %I USING (true) WITH CHECK (true)',table_name,schema_owner);
  END LOOP;
END $policies$;

COMMIT;
