-- CAN OS Neon production main: one coordinated move of 14 ACTIVE zero-row
-- review/authorization/Blueprint/Survey/Class tables with matching function
-- rebinding. One transaction. No bridge, duplication, CASCADE, or DROP.
-- Original relation OIDs, incoming/outgoing FKs, indexes, security policies,
-- owner/custom ACLs, triggers and SECURITY DEFINER function identity retained.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';
DO $guard$
DECLARE x record; f record; relation oid; n bigint; src text:='education_v30'; dst text:='public'; needle text; unexpected_needle text;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Neon CAN OS production main required'; END IF;
 FOR x IN SELECT * FROM (VALUES ('class_offering_versions',541898,1,1,2,4,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('blueprint_configurations',403121,3,0,2,1,4,NULL),
   ('blueprint_configuration_local_experiences',403217,3,1,1,0,2,NULL),
   ('blueprint_configuration_offering_intents',403428,3,1,2,0,2,NULL),
   ('class_session_agenda_revisions',543172,1,1,3,0,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('instructional_track_reviews',404348,1,1,3,0,6,NULL),
   ('learning_completion_evidence_bindings',542879,1,1,11,0,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('survey_question_branch_rules',412039,1,1,4,0,5,NULL),
   ('survey_question_options',412014,1,1,1,4,4,NULL),
   ('survey_version_reviews',412076,1,1,3,0,5,NULL),
   ('canonical_sensitive_capability_approvals',542825,4,0,4,0,3,'{neondb_owner=arwdDxtm/neondb_owner,can_v30_sensitive_approval_writer=arw/neondb_owner}'),
   ('geographic_areas',402265,2,0,1,12,3,NULL),
   ('content_manifest_review_decisions',411889,1,2,3,0,5,NULL),
   ('instructional_track_materials',403711,1,2,3,0,4,NULL)) exp(name,oid,pol,trg,out_fks,in_fks,indexes,acl) LOOP
  relation:=to_regclass(format('%I.%I',src,x.name));
  IF relation IS DISTINCT FROM x.oid::oid OR to_regclass(format('%I.%I',dst,x.name)) IS NOT NULL
  THEN RAISE EXCEPTION 'Unexpected relation source/destination %',x.name; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=relation AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl::text IS NOT DISTINCT FROM x.acl)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=relation)<>x.pol
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal)<>x.trg
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=relation)<>x.out_fks
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=relation)<>x.in_fks
    OR (SELECT count(*) FROM pg_index WHERE indrelid=relation)<>x.indexes
    OR has_table_privilege('authenticated',relation,'SELECT')
    OR has_table_privilege('authenticated',relation,'INSERT')
    OR has_table_privilege('authenticated',relation,'UPDATE')
    OR has_table_privilege('authenticated',relation,'DELETE')
  THEN RAISE EXCEPTION 'Security, FK or index state changed %',x.name; END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I',src,x.name) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Table no longer empty: %',x.name; END IF;
END LOOP;
 FOR x IN SELECT * FROM (VALUES ('class_offering_versions',541898,1,1,2,4,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('blueprint_configurations',403121,3,0,2,1,4,NULL),
   ('blueprint_configuration_local_experiences',403217,3,1,1,0,2,NULL),
   ('blueprint_configuration_offering_intents',403428,3,1,2,0,2,NULL),
   ('class_session_agenda_revisions',543172,1,1,3,0,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('instructional_track_reviews',404348,1,1,3,0,6,NULL),
   ('learning_completion_evidence_bindings',542879,1,1,11,0,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('survey_question_branch_rules',412039,1,1,4,0,5,NULL),
   ('survey_question_options',412014,1,1,1,4,4,NULL),
   ('survey_version_reviews',412076,1,1,3,0,5,NULL),
   ('canonical_sensitive_capability_approvals',542825,4,0,4,0,3,'{neondb_owner=arwdDxtm/neondb_owner,can_v30_sensitive_approval_writer=arw/neondb_owner}'),
   ('geographic_areas',402265,2,0,1,12,3,NULL),
   ('content_manifest_review_decisions',411889,1,2,3,0,5,NULL),
   ('instructional_track_materials',403711,1,2,3,0,4,NULL)) exp(name,oid,pol,trg,out_fks,in_fks,indexes,acl) LOOP
  relation:=to_regclass(format('%I.%I',src,x.name));
  IF EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
    JOIN pg_class pub ON pub.relnamespace='public'::regnamespace AND pub.relname=idx.relname
    WHERE i.indrelid=relation)
  THEN RAISE EXCEPTION 'Public index name collision: %',x.name; END IF;
 END LOOP;
 needle:='';
 unexpected_needle:='';
 FOR f IN SELECT * FROM (VALUES ('v301_guard_blueprint_output',404767,'JOIN blueprint_configurations c','JOIN public.blueprint_configurations c',1,true,'search_path=education_v30, pg_catalog',NULL),
   ('v301_can_sensitive_capability',542872,'JOIN education_v30.canonical_sensitive_capability_approvals approval','JOIN public.canonical_sensitive_capability_approvals approval',1,true,'search_path=pg_catalog, pg_temp','{neondb_owner=X/neondb_owner,can_v30_canonical_auth_reader=X/neondb_owner}'),
   ('canonical_class_session_agenda_guard',543211,'FROM education_v30.class_session_agenda_revisions','FROM public.class_session_agenda_revisions',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v27_check_manifest_approval',413565,'FROM content_manifest_review_decisions','FROM public.content_manifest_review_decisions',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v30_catalog_program_availability',418612,'FROM geographic_areas g','FROM public.geographic_areas g',2,true,'search_path=education_v30, pg_catalog','{neondb_owner=X/neondb_owner}'),
   ('v30_catalog_program_availability',418612,'FROM geographic_areas par','FROM public.geographic_areas par',2,true,'search_path=education_v30, pg_catalog','{neondb_owner=X/neondb_owner}'),
   ('validate_track_publication',409553,'FROM instructional_track_reviews','FROM public.instructional_track_reviews',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('ws3_guard_class_completion_decision',543168,'FROM education_v30.learning_completion_evidence_bindings','FROM public.learning_completion_evidence_bindings',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v27_check_survey_publication',413534,'FROM survey_version_reviews','FROM public.survey_version_reviews',1,false,'search_path=education_v30, pg_catalog',NULL)) expected(name,oid,old_ref,new_ref,occurrences,definer,path,acl) LOOP
  needle:=f.old_ref; unexpected_needle:=f.new_ref;
  IF to_regprocedure(format('education_v30.%I()',f.name)) IS DISTINCT FROM f.oid::oid
    OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND p.prosecdef=f.definer AND p.proconfig=ARRAY[f.path]::text[]
      AND p.proacl::text IS NOT DISTINCT FROM f.acl
      AND (length(p.prosrc)-length(replace(p.prosrc,needle,'')))/length(needle)=f.occurrences
      AND position(unexpected_needle IN p.prosrc)=0)
  THEN RAISE EXCEPTION 'Validation function contract changed: %',f.name; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.class_offering_versions SET SCHEMA public;
ALTER TABLE education_v30.blueprint_configurations SET SCHEMA public;
ALTER TABLE education_v30.blueprint_configuration_local_experiences SET SCHEMA public;
ALTER TABLE education_v30.blueprint_configuration_offering_intents SET SCHEMA public;
ALTER TABLE education_v30.class_session_agenda_revisions SET SCHEMA public;
ALTER TABLE education_v30.instructional_track_reviews SET SCHEMA public;
ALTER TABLE education_v30.learning_completion_evidence_bindings SET SCHEMA public;
ALTER TABLE education_v30.survey_question_branch_rules SET SCHEMA public;
ALTER TABLE education_v30.survey_question_options SET SCHEMA public;
ALTER TABLE education_v30.survey_version_reviews SET SCHEMA public;
ALTER TABLE education_v30.canonical_sensitive_capability_approvals SET SCHEMA public;
ALTER TABLE education_v30.geographic_areas SET SCHEMA public;
ALTER TABLE education_v30.content_manifest_review_decisions SET SCHEMA public;
ALTER TABLE education_v30.instructional_track_materials SET SCHEMA public;
DO $rebind$
DECLARE f record; ddl text;
BEGIN
 FOR f IN SELECT * FROM (VALUES ('v301_guard_blueprint_output',404767,'JOIN blueprint_configurations c','JOIN public.blueprint_configurations c',1,true,'search_path=education_v30, pg_catalog',NULL),
   ('v301_can_sensitive_capability',542872,'JOIN education_v30.canonical_sensitive_capability_approvals approval','JOIN public.canonical_sensitive_capability_approvals approval',1,true,'search_path=pg_catalog, pg_temp','{neondb_owner=X/neondb_owner,can_v30_canonical_auth_reader=X/neondb_owner}'),
   ('canonical_class_session_agenda_guard',543211,'FROM education_v30.class_session_agenda_revisions','FROM public.class_session_agenda_revisions',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v27_check_manifest_approval',413565,'FROM content_manifest_review_decisions','FROM public.content_manifest_review_decisions',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v30_catalog_program_availability',418612,'FROM geographic_areas g','FROM public.geographic_areas g',2,true,'search_path=education_v30, pg_catalog','{neondb_owner=X/neondb_owner}'),
   ('v30_catalog_program_availability',418612,'FROM geographic_areas par','FROM public.geographic_areas par',2,true,'search_path=education_v30, pg_catalog','{neondb_owner=X/neondb_owner}'),
   ('validate_track_publication',409553,'FROM instructional_track_reviews','FROM public.instructional_track_reviews',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('ws3_guard_class_completion_decision',543168,'FROM education_v30.learning_completion_evidence_bindings','FROM public.learning_completion_evidence_bindings',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v27_check_survey_publication',413534,'FROM survey_version_reviews','FROM public.survey_version_reviews',1,false,'search_path=education_v30, pg_catalog',NULL)) expected(name,oid,old_ref,new_ref,occurrences,definer,path,acl) LOOP
  ddl:=pg_get_functiondef(f.oid::oid);
  IF (length(ddl)-length(replace(ddl,f.old_ref,'')))/length(f.old_ref)<>f.occurrences
  THEN RAISE EXCEPTION 'Function text drifted: %',f.name; END IF;
  EXECUTE replace(ddl,f.old_ref,f.new_ref);
 END LOOP;
END $rebind$;
DO $verify$
DECLARE x record; f record; relation oid; n bigint; src text:='public'; dst text:='education_v30'; needle text;
BEGIN
 FOR x IN SELECT * FROM (VALUES ('class_offering_versions',541898,1,1,2,4,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('blueprint_configurations',403121,3,0,2,1,4,NULL),
   ('blueprint_configuration_local_experiences',403217,3,1,1,0,2,NULL),
   ('blueprint_configuration_offering_intents',403428,3,1,2,0,2,NULL),
   ('class_session_agenda_revisions',543172,1,1,3,0,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('instructional_track_reviews',404348,1,1,3,0,6,NULL),
   ('learning_completion_evidence_bindings',542879,1,1,11,0,4,'{neondb_owner=arwdDxtm/neondb_owner}'),
   ('survey_question_branch_rules',412039,1,1,4,0,5,NULL),
   ('survey_question_options',412014,1,1,1,4,4,NULL),
   ('survey_version_reviews',412076,1,1,3,0,5,NULL),
   ('canonical_sensitive_capability_approvals',542825,4,0,4,0,3,'{neondb_owner=arwdDxtm/neondb_owner,can_v30_sensitive_approval_writer=arw/neondb_owner}'),
   ('geographic_areas',402265,2,0,1,12,3,NULL),
   ('content_manifest_review_decisions',411889,1,2,3,0,5,NULL),
   ('instructional_track_materials',403711,1,2,3,0,4,NULL)) exp(name,oid,pol,trg,out_fks,in_fks,indexes,acl) LOOP
  relation:=to_regclass(format('%I.%I',src,x.name));
  IF relation IS DISTINCT FROM x.oid::oid OR to_regclass(format('%I.%I',dst,x.name)) IS NOT NULL
  THEN RAISE EXCEPTION 'Unexpected relation source/destination %',x.name; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=relation AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl::text IS NOT DISTINCT FROM x.acl)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=relation)<>x.pol
    OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=relation AND NOT tgisinternal)<>x.trg
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND conrelid=relation)<>x.out_fks
    OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=relation)<>x.in_fks
    OR (SELECT count(*) FROM pg_index WHERE indrelid=relation)<>x.indexes
    OR has_table_privilege('authenticated',relation,'SELECT')
    OR has_table_privilege('authenticated',relation,'INSERT')
    OR has_table_privilege('authenticated',relation,'UPDATE')
    OR has_table_privilege('authenticated',relation,'DELETE')
  THEN RAISE EXCEPTION 'Security, FK or index state changed %',x.name; END IF;
  EXECUTE format('SELECT count(*) FROM %I.%I',src,x.name) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Table no longer empty: %',x.name; END IF;
END LOOP;
 FOR f IN SELECT * FROM (VALUES ('v301_guard_blueprint_output',404767,'JOIN blueprint_configurations c','JOIN public.blueprint_configurations c',1,true,'search_path=education_v30, pg_catalog',NULL),
   ('v301_can_sensitive_capability',542872,'JOIN education_v30.canonical_sensitive_capability_approvals approval','JOIN public.canonical_sensitive_capability_approvals approval',1,true,'search_path=pg_catalog, pg_temp','{neondb_owner=X/neondb_owner,can_v30_canonical_auth_reader=X/neondb_owner}'),
   ('canonical_class_session_agenda_guard',543211,'FROM education_v30.class_session_agenda_revisions','FROM public.class_session_agenda_revisions',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v27_check_manifest_approval',413565,'FROM content_manifest_review_decisions','FROM public.content_manifest_review_decisions',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v30_catalog_program_availability',418612,'FROM geographic_areas g','FROM public.geographic_areas g',2,true,'search_path=education_v30, pg_catalog','{neondb_owner=X/neondb_owner}'),
   ('v30_catalog_program_availability',418612,'FROM geographic_areas par','FROM public.geographic_areas par',2,true,'search_path=education_v30, pg_catalog','{neondb_owner=X/neondb_owner}'),
   ('validate_track_publication',409553,'FROM instructional_track_reviews','FROM public.instructional_track_reviews',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('ws3_guard_class_completion_decision',543168,'FROM education_v30.learning_completion_evidence_bindings','FROM public.learning_completion_evidence_bindings',1,false,'search_path=education_v30, pg_catalog',NULL),
   ('v27_check_survey_publication',413534,'FROM survey_version_reviews','FROM public.survey_version_reviews',1,false,'search_path=education_v30, pg_catalog',NULL)) expected(name,oid,old_ref,new_ref,occurrences,definer,path,acl) LOOP
  needle:=f.new_ref;
  IF to_regprocedure(format('education_v30.%I()',f.name)) IS DISTINCT FROM f.oid::oid
    OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid::oid
      AND p.prosecdef=f.definer AND p.proconfig=ARRAY[f.path]::text[]
      AND p.proacl::text IS NOT DISTINCT FROM f.acl
      AND (length(p.prosrc)-length(replace(p.prosrc,needle,'')))/length(needle)=f.occurrences
      AND position(f.old_ref IN p.prosrc)=0)
  THEN RAISE EXCEPTION 'Function was not rebound safely: %',f.name; END IF;
 END LOOP;
END $verify$;
COMMIT;
