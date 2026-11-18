-- CAN OS Neon main Person retirement: the empty, RLS-protected public
-- feedback_subjects table still pointed its professional Person FK to
-- the EMPTY education_v30.persons. Rebind to authoritative public.people.
-- Keep FK name, one-column semantics, NO ACTION referential policy,
-- validated status and NOT DEFERRABLE. Do not infer identities or copy rows.
-- DO block is atomic; no correspondence tables or CASCADE operations.
DO $rebind_feedback_professional_person$
DECLARE
  constraint_oid oid;
  current_definition text;
  current_target oid;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Only CAN OS Neon main permitted';
  END IF;
  SELECT c.oid,pg_get_constraintdef(c.oid),c.confrelid
    INTO constraint_oid,current_definition,current_target
  FROM pg_constraint c
  WHERE c.conrelid=to_regclass('public.feedback_subjects')
    AND c.contype='f'
    AND c.conname='feedback_subjects_professional_person_id_fkey';
  IF constraint_oid IS NULL THEN RAISE EXCEPTION 'Expected Person FK not found'; END IF;
  IF current_target=to_regclass('public.people') THEN
    RAISE NOTICE 'feedback professional Person already refers to public.people';
    RETURN;
  END IF;
  IF current_target IS DISTINCT FROM to_regclass('education_v30.persons')
     OR current_definition<>'FOREIGN KEY (professional_person_id) REFERENCES education_v30.persons(id)'
     OR NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.oid=constraint_oid
        AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
        AND c.confdeltype='a' AND c.confupdtype='a')
     OR EXISTS(SELECT 1 FROM education_v30.persons)
     OR EXISTS(SELECT 1 FROM public.feedback_subjects)
     OR NOT EXISTS(SELECT 1 FROM pg_class t WHERE t.oid='public.feedback_subjects'::regclass
        AND t.relrowsecurity AND t.relforcerowsecurity)
  THEN RAISE EXCEPTION 'Unexpected Person data, FK actions, or RLS protections'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  EXECUTE 'ALTER TABLE public.feedback_subjects DROP CONSTRAINT feedback_subjects_professional_person_id_fkey';
  EXECUTE 'ALTER TABLE public.feedback_subjects ADD CONSTRAINT feedback_subjects_professional_person_id_fkey FOREIGN KEY (professional_person_id) REFERENCES public.people(id)';
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
    WHERE c.conrelid='public.feedback_subjects'::regclass
      AND c.conname='feedback_subjects_professional_person_id_fkey'
      AND c.contype='f' AND c.confrelid='public.people'::regclass
      AND c.convalidated AND NOT c.condeferrable
      AND c.confdeltype='a' AND c.confupdtype='a'
  ) THEN RAISE EXCEPTION 'One-Person FK move failed validation'; END IF;
END
$rebind_feedback_professional_person$;
