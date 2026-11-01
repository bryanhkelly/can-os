-- Disposable PostgreSQL fixture for the pre-0056 graduation policy schema.
-- Run ONLY against the ephemeral PostgreSQL Actions service.
CREATE TABLE public.graduation_requirement_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuing_organization_id uuid NOT NULL,
  academic_year text NOT NULL,
  version text NOT NULL,
  requirements jsonb NOT NULL,
  approved_by_person_id uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX graduation_requirements_issuer_year_version_uq
  ON public.graduation_requirement_sets (issuing_organization_id, academic_year, version);
INSERT INTO public.graduation_requirement_sets
(id, issuing_organization_id, academic_year, version, requirements, approved_by_person_id)
VALUES ('00000000-0000-0000-0000-000000000123',
        '00000000-0000-0000-0000-000000000010',
        '2025', 'existing', '[]'::jsonb,
        '00000000-0000-0000-0000-000000000011');
