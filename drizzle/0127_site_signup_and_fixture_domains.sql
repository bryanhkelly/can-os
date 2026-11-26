-- Store a separately declared organization domain throughout pending signup.
ALTER TABLE public.school_setup_signups ADD COLUMN IF NOT EXISTS organization_domain text;
--> statement-breakpoint
ALTER TABLE public.school_setup_signups ADD CONSTRAINT school_setup_signup_domain_normalized_chk
CHECK (organization_domain IS NULL OR (organization_domain=lower(btrim(organization_domain))
 AND length(organization_domain)<=253
 AND organization_domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'));
--> statement-breakpoint
-- Exact IDs observed in Neon main and corroborated by the GF25 integration
-- fixture generator. Never classify an arbitrary organization by its name.
UPDATE public.organizations o SET domain=v.domain
FROM (VALUES
 ('299adfd2-8b11-4ea2-8eca-4fc5ecf9d22d'::uuid,'issuer.2fdea6ca.gf25.demo'),
 ('409979c5-a8d2-4e49-b048-0a95d4b9d6dc'::uuid,'issuer.66975f5e.gf25.demo'),
 ('a75252f0-9415-456f-bc04-bfa7ee03a627'::uuid,'issuer.9409c4f2.gf25.demo'),
 ('2b8795bb-aa29-4cee-8fc6-3d3cc1842c90'::uuid,'issuer.e9b7b5db.gf25.demo'),
 ('d163a13e-893c-48f4-a00e-e89e3a499a98'::uuid,'issuer.f098f921.gf25.demo'),
 ('92ccee52-a9cd-460d-bb25-e809ca605fa5'::uuid,'issuer.ff759d54.gf25.demo'),
 ('4215aab0-48de-4deb-9a21-695f8ca2208d'::uuid,'school.2fdea6ca.gf25.demo'),
 ('a0af6b70-1640-43d5-b251-44f93180ae9f'::uuid,'school.66975f5e.gf25.demo'),
 ('447498f3-231f-4285-a2b8-8d31fce9d7cb'::uuid,'school.9409c4f2.gf25.demo'),
 ('03cde622-f6a2-4ac4-8865-d8962120f0f7'::uuid,'school.e9b7b5db.gf25.demo'),
 ('edb3bcec-bb84-4f66-8878-d1efec2c7e0b'::uuid,'school.f098f921.gf25.demo'),
 ('54633a42-5ee6-4a51-b74e-9e5c9f04e516'::uuid,'school.ff759d54.gf25.demo')
) AS v(id,domain) WHERE o.id=v.id AND o.domain IS NULL;
