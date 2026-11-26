-- Domain classification is independent of credentials, membership and grants.
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS domain text;
--> statement-breakpoint
-- Explicit domain assignments for known demonstration organizations only.
UPDATE public.organizations o SET domain = v.domain
FROM (VALUES
 ('ca270000-0000-4000-8000-000000000001'::uuid,'community.can.demo'),
 ('3340246a-4e2d-46cf-aa79-0adaa9feb2c8'::uuid,'publisher.can.demo'),
 ('82031573-22a2-4ff7-90fe-1849e1ae372f'::uuid,'teaching.can.demo')
) AS v(id,domain) WHERE o.id=v.id AND o.domain IS NULL;
--> statement-breakpoint
-- Backfill Person domains from their own email, not their employer or school.
UPDATE public.people SET domain=lower(split_part(btrim(email),'@',2))
WHERE domain IS NULL AND btrim(email) ~ '^[^@[:space:]]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?([.][a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$';
--> statement-breakpoint
-- A single active account bound to the same Person supplies contact evidence.
UPDATE public.people p SET domain=a.domain
FROM (SELECT person_id,min(lower(split_part(email_normalized,'@',2))) AS domain
 FROM public.access_accounts WHERE NOT disabled AND person_id IS NOT NULL
 AND email_normalized ~ '^[^@[:space:]]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?([.][a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$'
 GROUP BY person_id HAVING count(DISTINCT lower(split_part(email_normalized,'@',2)))=1) a
WHERE p.id=a.person_id AND p.domain IS NULL;
--> statement-breakpoint
ALTER TABLE public.people ADD CONSTRAINT people_domain_normalized_chk
CHECK (domain IS NULL OR (domain=lower(btrim(domain)) AND length(domain)<=253
 AND domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS people_domain_idx ON public.people(domain);
