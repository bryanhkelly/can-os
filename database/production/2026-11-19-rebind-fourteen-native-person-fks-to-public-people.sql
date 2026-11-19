-- CAN OS | Neon main | Person FK convergence.
-- Move 14 validated foreign-key relationships from the empty transitional
-- education_v30.persons table to authoritative public.people (142 records).
-- No Person inserts, generated crosswalks, new role grants, or bridge tables.
-- Each child is checked empty and locked before its FK is replaced.
-- Every FK preserves its name and ON DELETE/UPDATE semantics.
-- Atomic, fail-closed; actual legacy Person table retirement is separate.
DO $person_cutover$
DECLARE
 expected jsonb := '[{"oid":402686,"schema_name":"education_v30","child_name":"canonical_account_grants","child_oid":402659,"conname":"canonical_account_grants_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (person_id) REFERENCES education_v30.persons(id)"},{"oid":542528,"schema_name":"public","child_name":"access_account_canonical_principals","child_oid":542508,"conname":"access_account_canonical_principals_canonical_principal_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (canonical_principal_id) REFERENCES education_v30.persons(id) ON DELETE RESTRICT"},{"oid":524323,"schema_name":"public","child_name":"access_account_noncredit_principals","child_oid":524288,"conname":"access_account_noncredit_principals_canonical_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (canonical_person_id) REFERENCES education_v30.persons(id) ON DELETE RESTRICT"},{"oid":543480,"schema_name":"public","child_name":"access_adult_learning_reviews","child_oid":543431,"conname":"access_adult_learning_reviews_canonical_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (canonical_person_id) REFERENCES education_v30.persons(id) ON DELETE RESTRICT"},{"oid":541981,"schema_name":"public","child_name":"class_enrollments","child_oid":541942,"conname":"class_enrollments_enrolled_by_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (enrolled_by_person_id) REFERENCES education_v30.persons(id)"},{"oid":541971,"schema_name":"public","child_name":"class_enrollments","child_oid":541942,"conname":"class_enrollments_learner_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (learner_person_id) REFERENCES education_v30.persons(id)"},{"oid":458813,"schema_name":"public","child_name":"facilitated_learning_participants","child_oid":450684,"conname":"facilitated_pairs_person_fk","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (participant_person_id) REFERENCES education_v30.persons(id)"},{"oid":426069,"schema_name":"public","child_name":"learner_achievement_decisions","child_oid":426050,"conname":"learner_achievement_decisions_recipient_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (recipient_person_id) REFERENCES education_v30.persons(id)"},{"oid":402751,"schema_name":"public","child_name":"learner_profiles","child_oid":402735,"conname":"learner_profiles_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (person_id) REFERENCES education_v30.persons(id)"},{"oid":542935,"schema_name":"public","child_name":"learning_completion_evidence_bindings","child_oid":542879,"conname":"learning_completion_evidence_binding_participant_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (participant_person_id) REFERENCES education_v30.persons(id)"},{"oid":543117,"schema_name":"public","child_name":"learning_completion_evidence_review_requests","child_oid":543060,"conname":"learning_completion_evidence_review__participant_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (participant_person_id) REFERENCES education_v30.persons(id)"},{"oid":458791,"schema_name":"public","child_name":"learning_sessions","child_oid":450560,"conname":"canonical_learning_sessions_person_fk","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (participant_person_id) REFERENCES education_v30.persons(id)"},{"oid":414799,"schema_name":"public","child_name":"noncredit_registrations","child_oid":414763,"conname":"noncredit_registrations_participant_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (participant_person_id) REFERENCES education_v30.persons(id)"},{"oid":524448,"schema_name":"public","child_name":"noncredit_self_enrollment_claims","child_oid":524413,"conname":"noncredit_self_enrollment_claims_participant_person_id_fkey","convalidated":true,"condeferrable":false,"condeferred":false,"definition":"FOREIGN KEY (participant_person_id) REFERENCES education_v30.persons(id) ON DELETE RESTRICT"}]'::jsonb;
 e record; obj oid; child_count bigint; new_definition text; matches integer;
BEGIN
 PERFORM set_config('lock_timeout','5s',true);
 PERFORM set_config('statement_timeout','120s',true);
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
     OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'CAN OS Neon main only'; END IF;
 IF to_regclass('education_v30.persons') IS DISTINCT FROM 402633::oid
     OR to_regclass('public.people') IS DISTINCT FROM 24889::oid
 THEN RAISE EXCEPTION 'Person identity table changed'; END IF;
 IF (SELECT count(*) FROM education_v30.persons)<>0
 THEN RAISE EXCEPTION 'Legacy Person records cannot be discarded'; END IF;
 IF (SELECT count(*) FROM public.people)<142
 THEN RAISE EXCEPTION 'Canonical Person records regressed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.people'::regclass
       AND c.relrowsecurity AND c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'Shared Person security policy changed'; END IF;
 IF jsonb_array_length(expected)<>14 THEN RAISE EXCEPTION 'Expected fourteen Person FKs'; END IF;
 IF (SELECT count(*) FROM pg_constraint
     WHERE contype='f' AND confrelid='education_v30.persons'::regclass)<>14
 THEN RAISE EXCEPTION 'Legacy Person FK inventory changed'; END IF;

 FOR e IN SELECT * FROM jsonb_to_recordset(expected)
   AS x(oid integer,schema_name text,child_name text,child_oid integer,
         conname text,convalidated boolean,condeferrable boolean,
         condeferred boolean,definition text)
 LOOP
   obj:=to_regclass(format('%I.%I',e.schema_name,e.child_name));
   IF obj IS DISTINCT FROM e.child_oid::oid
     OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.oid=e.oid::oid
       AND k.conrelid=obj AND k.confrelid='education_v30.persons'::regclass
       AND k.conname=e.conname AND k.convalidated=e.convalidated
       AND k.condeferrable=e.condeferrable AND k.condeferred=e.condeferred
       AND pg_get_constraintdef(k.oid)=e.definition)
     OR e.definition NOT LIKE '%REFERENCES education_v30.persons(id)%'
   THEN RAISE EXCEPTION 'Identity FK metadata drift: %.%',e.child_name,e.conname; END IF;
   EXECUTE format('LOCK TABLE %I.%I IN ACCESS EXCLUSIVE MODE',e.schema_name,e.child_name);
   EXECUTE format('SELECT count(*) FROM %I.%I',e.schema_name,e.child_name) INTO child_count;
   IF child_count<>0 THEN
     RAISE EXCEPTION 'Identity rebind requires empty child %.% (% rows)',
       e.schema_name,e.child_name,child_count;
   END IF;
 END LOOP;

 FOR e IN SELECT * FROM jsonb_to_recordset(expected)
   AS x(oid integer,schema_name text,child_name text,child_oid integer,
        conname text,convalidated boolean,condeferrable boolean,
        condeferred boolean,definition text)
 LOOP
   new_definition:=replace(e.definition,
       'REFERENCES education_v30.persons(id)',
       'REFERENCES public.people(id)');
   IF new_definition=e.definition THEN
     RAISE EXCEPTION 'Person FK rewrite did not modify %',e.conname; END IF;
   EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',
       e.schema_name,e.child_name,e.conname);
   EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
       e.schema_name,e.child_name,e.conname,new_definition);
 END LOOP;

 IF (SELECT count(*) FROM pg_constraint
    WHERE contype='f' AND confrelid='education_v30.persons'::regclass)<>0
 THEN RAISE EXCEPTION 'Legacy Person FKs remain'; END IF;
 SELECT count(*) INTO matches FROM pg_constraint k
 JOIN jsonb_to_recordset(expected)
  AS expected_fk(oid integer,schema_name text,child_name text,child_oid integer,
       conname text,convalidated boolean,condeferrable boolean,
       condeferred boolean,definition text)
 ON k.conrelid=expected_fk.child_oid::oid AND k.conname=expected_fk.conname
 WHERE k.contype='f' AND k.confrelid='public.people'::regclass
   AND k.convalidated AND NOT k.condeferrable AND NOT k.condeferred
   AND replace(pg_get_constraintdef(k.oid),
       'REFERENCES people(id)','REFERENCES public.people(id)')
       =replace(expected_fk.definition,
       'REFERENCES education_v30.persons(id)','REFERENCES public.people(id)');
 IF matches<>14 THEN RAISE EXCEPTION 'Person rebind postflight failed (% constraints)',matches; END IF;
 IF (SELECT count(*) FROM education_v30.persons)<>0
 THEN RAISE EXCEPTION 'Legacy Person rows appeared'; END IF;
 RAISE NOTICE 'Rebound 14 Person FKs to public.people; no identities or grants were created';
END $person_cutover$;