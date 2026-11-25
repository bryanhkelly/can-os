-- Canonical Organization domain is classification only, never grant authority.
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS domain text;
--> statement-breakpoint
-- Existing registry is authoritative evidence of the historical demo domain.
-- Do not overwrite an explicitly recorded Organization domain.
UPDATE public.organizations o SET domain = lower(btrim(t.domain))
FROM public.demo_school_tenants t
WHERE t.organization_id = o.id AND o.domain IS NULL
  AND lower(btrim(t.domain)) ~ '^[a-z0-9.-]+[.]demo$';
--> statement-breakpoint
-- Original Valor fixture predates the registry. This is a one-time data repair,
-- not a runtime identity exception.
UPDATE public.organizations
SET domain = 'valorschool.demo'
WHERE id = 'f1000000-0000-4000-8000-000000000002'::uuid AND domain IS NULL;
--> statement-breakpoint
-- Keep unknown historical domains null instead of guessing from participants.
ALTER TABLE public.organizations ADD CONSTRAINT organization_domain_normalized_chk
CHECK (domain IS NULL OR (domain = lower(btrim(domain)) AND
  domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS organization_domain_idx ON public.organizations(domain);
