-- Final Organization FK: a currently empty adult-learning review table.
-- Direct reference to the same public Organization UUID, no identity mapping.
-- Independent staff/learner review gates and table RLS remain unchanged.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE prior text;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Only CAN OS Neon main'; END IF;
 IF EXISTS(SELECT 1 FROM public.access_adult_learning_reviews)
 THEN RAISE EXCEPTION 'Adult-learning review history changed'; END IF;
 IF EXISTS(SELECT 1 FROM education_v30.organizations native
  WHERE NOT EXISTS(SELECT 1 FROM public.organizations platform WHERE platform.id=native.id))
 THEN RAISE EXCEPTION 'Unmatched Organization'; END IF;
 SELECT pg_get_constraintdef(oid) INTO prior FROM pg_constraint
 WHERE conrelid='public.access_adult_learning_reviews'::regclass
   AND conname='access_adult_learning_reviews_organization_id_fkey'
   AND confrelid='education_v30.organizations'::regclass
   AND contype='f' AND convalidated AND NOT condeferrable;
 IF prior IS DISTINCT FROM
 'FOREIGN KEY (organization_id) REFERENCES education_v30.organizations(id) ON DELETE RESTRICT'
 THEN RAISE EXCEPTION 'Adult-learning FK semantics changed'; END IF;
END $guard$;
ALTER TABLE public.access_adult_learning_reviews
 DROP CONSTRAINT access_adult_learning_reviews_organization_id_fkey,
 ADD CONSTRAINT access_adult_learning_reviews_organization_id_fkey
 FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
DO $verify$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
 WHERE conrelid='public.access_adult_learning_reviews'::regclass
  AND conname='access_adult_learning_reviews_organization_id_fkey'
  AND contype='f' AND convalidated
  AND confrelid='public.organizations'::regclass)
 OR EXISTS(SELECT 1 FROM pg_constraint
 WHERE contype='f' AND confrelid='education_v30.organizations'::regclass)
 THEN RAISE EXCEPTION 'Native Organization still referenced or FK not valid'; END IF;
END $verify$;
COMMIT;
