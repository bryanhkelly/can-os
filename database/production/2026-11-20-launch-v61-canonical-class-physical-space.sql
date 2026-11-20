-- CAN OS V6.1 Prepare: use existing public.site_spaces as the single
-- physical-space and resource source of truth for canonical Classes.
-- This adds no parallel room registry, class roster or facilitator grant.
-- Apply to the isolated Launch Studio Neon branch and validate before main.
BEGIN;

ALTER TABLE public.site_spaces
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.site_spaces'::regclass
        AND conname='site_spaces_revision_positive') THEN
    ALTER TABLE public.site_spaces
      ADD CONSTRAINT site_spaces_revision_positive CHECK (revision > 0);
  END IF;
END $$;

-- Preserve existing legacy room identity once, without assuming the legacy
-- room-coverage Sections belong to any canonical Class. Keep existing Site
-- spaces when a matching name was already recorded. Do not migrate coverage.
INSERT INTO public.site_spaces(id,site_id,code,name,max_occupancy,resources)
SELECT r.id,r.site_id,
  'legacy-room-' || replace(r.id::text,'-',''),r.name,r.capacity,
  jsonb_build_object('importSource','site_rooms','importedForLaunchV61',true)
FROM public.site_rooms r
WHERE r.retired_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.site_spaces s
     WHERE s.site_id=r.site_id AND lower(btrim(s.name))=lower(btrim(r.name))
  )
ON CONFLICT DO NOTHING;

-- The staff assignment reference must agree with the Class, not merely exist
-- elsewhere in the operating network. This supporting unique index permits
-- a composite FK while preserving the existing canonical staff-assignment PK.
CREATE UNIQUE INDEX IF NOT EXISTS class_staff_assignment_id_class_uq
  ON public.class_staff_assignments(id,class_id);

-- A Class can select one default physical space for planning. Its actual
-- dated Sessions, attendance, operating approval and staffing remain governed
-- by their existing independent records and must be revalidated at operation.
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS physical_space_id uuid,
  ADD COLUMN IF NOT EXISTS primary_facilitator_assignment_id uuid,
  ADD COLUMN IF NOT EXISTS physical_planning_revision integer NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.classes'::regclass
        AND conname='classes_physical_space_site_fk') THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_physical_space_site_fk
      FOREIGN KEY (physical_space_id,site_id)
      REFERENCES public.site_spaces(id,site_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.classes'::regclass
        AND conname='classes_primary_facilitator_assignment_fk') THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_primary_facilitator_assignment_fk
      FOREIGN KEY (primary_facilitator_assignment_id,id)
      REFERENCES public.class_staff_assignments(id,class_id)
      ON UPDATE RESTRICT ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
      WHERE conrelid='public.classes'::regclass
        AND conname='classes_physical_space_requires_site_ck') THEN
    ALTER TABLE public.classes
      ADD CONSTRAINT classes_physical_space_requires_site_ck
      CHECK (physical_space_id IS NULL OR site_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS classes_physical_space_idx
  ON public.classes(physical_space_id) WHERE physical_space_id IS NOT NULL;
COMMIT;
