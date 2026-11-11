-- 0084: Immutable School Blueprint review baselines, item decisions and planning prospectuses.
-- CAN approval is not legal licensure, accreditation or school-opening authorization.
CREATE TABLE site_blueprint_review_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
 source_revision integer NOT NULL CHECK(source_revision>0),proposal_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewed','withdrawn')),
 submitted_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,submitted_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT site_blueprint_review_revision_uq UNIQUE(site_id,source_revision));
--> statement-breakpoint
CREATE INDEX site_blueprint_review_site_idx ON site_blueprint_review_requests(site_id,status);
--> statement-breakpoint
CREATE TABLE site_blueprint_approved_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
 version integer NOT NULL CHECK(version>0),review_request_id uuid NOT NULL REFERENCES site_blueprint_review_requests(id) ON DELETE RESTRICT,
 source_revision integer NOT NULL CHECK(source_revision>0),approved_snapshot jsonb NOT NULL,
 school_scope_statement text NOT NULL,reviewed_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 reviewed_at timestamptz NOT NULL DEFAULT now(),effective_from date,
 CONSTRAINT site_blueprint_approved_version_uq UNIQUE(site_id,version));
--> statement-breakpoint
CREATE INDEX site_blueprint_approved_site_idx ON site_blueprint_approved_versions(site_id,reviewed_at);
--> statement-breakpoint
CREATE TABLE site_blueprint_approval_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),approval_version_id uuid NOT NULL REFERENCES site_blueprint_approved_versions(id) ON DELETE RESTRICT,
 subject_kind text NOT NULL CHECK(subject_kind IN ('program','item')),subject_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN ('approved','changes_required','future','declined')),
 conditions jsonb NOT NULL DEFAULT '{}'::jsonb,evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 required_for_opening boolean NOT NULL DEFAULT false,
 public_visibility text NOT NULL DEFAULT 'hidden' CHECK(public_visibility IN ('confirmed','under_review','future','hidden')),
 public_summary text,effective_from date,effective_through date,
 CONSTRAINT site_blueprint_decision_subject_uq UNIQUE(approval_version_id,subject_kind,subject_id),
 CONSTRAINT site_blueprint_decision_no_false_claim_ck CHECK(public_visibility<>'confirmed' OR decision='approved'),
 CONSTRAINT site_blueprint_decision_dates_ck CHECK(effective_through IS NULL OR effective_from IS NULL OR effective_through>=effective_from));
--> statement-breakpoint
CREATE INDEX site_blueprint_decision_lookup_idx ON site_blueprint_approval_decisions(subject_kind,subject_id);
--> statement-breakpoint
CREATE TABLE site_concept_item_interests(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES sites(id) ON DELETE RESTRICT,
 contact_id uuid NOT NULL,program_plan_id uuid,blueprint_item_id uuid,expressed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT site_concept_item_program_uq UNIQUE(contact_id,program_plan_id),
 CONSTRAINT site_concept_item_blueprint_uq UNIQUE(contact_id,blueprint_item_id),
 CONSTRAINT site_concept_item_exactly_one_ck CHECK((program_plan_id IS NOT NULL) <> (blueprint_item_id IS NOT NULL)),
 CONSTRAINT site_concept_item_contact_fk FOREIGN KEY(contact_id,site_id) REFERENCES site_concept_contacts(id,site_id),
 CONSTRAINT site_concept_item_program_fk FOREIGN KEY(program_plan_id,site_id) REFERENCES site_program_plans(id,site_id),
 CONSTRAINT site_concept_item_blueprint_fk FOREIGN KEY(blueprint_item_id,site_id) REFERENCES site_blueprint_items(id,site_id));
--> statement-breakpoint
CREATE INDEX site_concept_item_site_idx ON site_concept_item_interests(site_id);
--> statement-breakpoint
ALTER TABLE site_publication_releases ADD COLUMN mode text NOT NULL DEFAULT 'operational';
--> statement-breakpoint
ALTER TABLE site_publication_releases ADD CONSTRAINT site_publication_release_mode_ck
 CHECK(mode IN ('planning_prospectus','operational'));
--> statement-breakpoint
CREATE INDEX site_publication_release_mode_idx ON site_publication_releases(site_id,mode,status,published_at DESC);
