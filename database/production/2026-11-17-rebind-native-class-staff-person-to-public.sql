-- CAN OS Neon production MAIN. A Class staff assignment must identify the
-- verified authoritative public Person, not an unpopulated native Person.
-- Service owner: src/modules/classes/class-staff.functions.ts
-- Original exact Class FK name and NO ACTION semantics are preserved.
-- Do not substitute identity matching or create native role grants.
DO $one_person_class_staff$
DECLARE fk record;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
   OR current_database()<>'neondb'
 THEN RAISE EXCEPTION 'CAN OS production main only'; END IF;
 IF to_regclass('public.people') IS NULL OR to_regclass('education_v30.persons') IS NULL
   OR EXISTS(SELECT 1 FROM education_v30.persons)
 THEN RAISE EXCEPTION 'Unexpected Person registry state'; END IF;
 SELECT f.oid,f.confrelid,f.convalidated,f.condeferrable,f.condeferred,
        f.confdeltype,f.confupdtype,pg_get_constraintdef(f.oid) AS definition
  INTO fk FROM pg_constraint f
  WHERE f.conrelid='education_v30.class_staff_assignments'::regclass
    AND f.conname='class_staff_assignments_person_id_fkey'
    AND f.contype='f';
 IF NOT FOUND OR NOT fk.convalidated OR fk.condeferrable OR fk.condeferred
   OR fk.confdeltype<>'a' OR fk.confupdtype<>'a'
 THEN RAISE EXCEPTION 'Class staff Person FK is missing or changed'; END IF;
 IF fk.confrelid='public.people'::regclass THEN
   RAISE NOTICE 'Class staff already uses public.people';
   RETURN;
 END IF;
 IF fk.confrelid IS DISTINCT FROM to_regclass('education_v30.persons')
   OR fk.definition IS DISTINCT FROM
      'FOREIGN KEY (person_id) REFERENCES education_v30.persons(id)'
   OR NOT EXISTS(SELECT 1 FROM pg_class c
       WHERE c.oid='education_v30.class_staff_assignments'::regclass
         AND c.relrowsecurity AND c.relforcerowsecurity)
   OR (SELECT count(*) FROM pg_policy p
       WHERE p.polrelid='education_v30.class_staff_assignments'::regclass)<>1
   OR EXISTS(SELECT 1 FROM education_v30.class_staff_assignments)
 THEN RAISE EXCEPTION 'Unreviewed Class staff data, constraint or RLS'; END IF;
 PERFORM set_config('lock_timeout','5s',true);
 ALTER TABLE education_v30.class_staff_assignments
   DROP CONSTRAINT class_staff_assignments_person_id_fkey;
 ALTER TABLE education_v30.class_staff_assignments
   ADD CONSTRAINT class_staff_assignments_person_id_fkey
   FOREIGN KEY(person_id) REFERENCES public.people(id);
 IF NOT EXISTS(SELECT 1 FROM pg_constraint f
    WHERE f.conrelid='education_v30.class_staff_assignments'::regclass
      AND f.conname='class_staff_assignments_person_id_fkey'
      AND f.confrelid='public.people'::regclass
      AND f.convalidated AND NOT f.condeferrable
      AND f.confdeltype='a' AND f.confupdtype='a')
 THEN RAISE EXCEPTION 'Class staff public Person rebind not validated'; END IF;
END
$one_person_class_staff$;
