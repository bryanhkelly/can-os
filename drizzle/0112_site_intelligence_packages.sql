-- Site Intelligence snapshots and immutable generated content. Server-only data.
CREATE TABLE public.site_intelligence_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 revision integer NOT NULL, input_digest text NOT NULL, input jsonb NOT NULL, options jsonb NOT NULL, source_revisions jsonb NOT NULL,
 requested_by_person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE RESTRICT,
 status text NOT NULL, attempts integer NOT NULL, lease_token uuid, lease_until timestamptz, error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT site_intelligence_digest_ck CHECK (input_digest ~ '^[a-f0-9]{64}$'),
 CONSTRAINT site_intelligence_revision_ck CHECK (revision>0 AND attempts BETWEEN 1 AND 3),
 CONSTRAINT site_intelligence_state_ck CHECK ((status='processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL AND error_code IS NULL) OR (status='failed' AND lease_token IS NULL AND lease_until IS NULL AND error_code IS NOT NULL) OR (status='ready' AND lease_token IS NULL AND lease_until IS NULL AND error_code IS NULL))
);
CREATE UNIQUE INDEX site_intelligence_scope_id_uq ON public.site_intelligence_versions(organization_id,site_id,id);
CREATE UNIQUE INDEX site_intelligence_revision_uq ON public.site_intelligence_versions(organization_id,site_id,revision);
CREATE UNIQUE INDEX site_intelligence_digest_uq ON public.site_intelligence_versions(organization_id,site_id,input_digest);
CREATE INDEX site_intelligence_status_idx ON public.site_intelligence_versions(organization_id,site_id,status,revision);
--> statement-breakpoint
CREATE TABLE public.site_generated_content_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 intelligence_version_id uuid NOT NULL,
 content jsonb NOT NULL,output_digest text NOT NULL,provider text NOT NULL,model text NOT NULL,provider_response_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT site_generated_content_scope_fk FOREIGN KEY(organization_id,site_id,intelligence_version_id) REFERENCES public.site_intelligence_versions(organization_id,site_id,id) ON DELETE RESTRICT,
 CONSTRAINT site_generated_content_digest_ck CHECK(output_digest ~ '^[a-f0-9]{64}$' AND provider='gloo')
);
CREATE UNIQUE INDEX site_generated_content_input_uq ON public.site_generated_content_versions(intelligence_version_id);
CREATE INDEX site_generated_content_scope_idx ON public.site_generated_content_versions(organization_id,site_id,created_at);
--> statement-breakpoint
ALTER TABLE public.site_intelligence_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_intelligence_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_intelligence_versions FROM PUBLIC, anonymous, authenticated;
ALTER TABLE public.site_generated_content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_generated_content_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_generated_content_versions FROM PUBLIC, anonymous, authenticated;
