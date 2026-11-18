-- CAN OS main: six canonical facilitated-room evidence tables to public.
-- No copy, bridge, rekey, view redefinition, policy relaxation, or CASCADE.
-- Inbound foreign keys and security-invoker view bindings retain relation OIDs.
-- Coordinate with Drizzle model and classroom readiness checks on GitHub main.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $before$
DECLARE x record; table_oid oid; r record; num_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Production Neon main required'; END IF;
 FOR x IN SELECT * FROM (VALUES
    ('facilitated_room_activity_releases',483328,2,2),
    ('facilitated_room_activity_responses',483362,0,3),
    ('facilitated_room_control_commands',491520,0,3),
    ('facilitated_room_feedback',483466,0,2),
    ('facilitated_room_presence_events',483401,0,2),
    ('facilitated_room_survey_campaigns',483499,0,2)
 ) AS expected(table_name,table_oid,inbound_fks,outbound_fks) LOOP
   table_oid := to_regclass(format('education_v30.%I',x.table_name));
   IF table_oid IS DISTINCT FROM x.table_oid::oid
     OR to_regclass(format('public.%I',x.table_name)) IS NOT NULL
   THEN RAISE EXCEPTION 'Wrong source or destination: %',x.table_name; END IF;
   SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO r
     FROM pg_class WHERE oid=table_oid;
   IF r.relkind<>'r' OR NOT r.relrowsecurity OR NOT r.relforcerowsecurity
     OR r.relacl IS NOT NULL
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=table_oid)<>1
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=table_oid AND NOT tgisinternal)<>0
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=table_oid AND contype='f')<>x.inbound_fks
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=table_oid AND contype='f')<>x.outbound_fks
     OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||x.table_name||'%')
   THEN RAISE EXCEPTION 'Changed security or SQL dependencies: %',x.table_name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',x.table_name) INTO num_rows;
   IF num_rows<>0 THEN RAISE EXCEPTION 'Unexpected persisted rows in %: %',x.table_name,num_rows; END IF;
 END LOOP;
END $before$;
ALTER TABLE education_v30.facilitated_room_activity_releases SET SCHEMA public;
ALTER TABLE education_v30.facilitated_room_activity_responses SET SCHEMA public;
ALTER TABLE education_v30.facilitated_room_control_commands SET SCHEMA public;
ALTER TABLE education_v30.facilitated_room_feedback SET SCHEMA public;
ALTER TABLE education_v30.facilitated_room_presence_events SET SCHEMA public;
ALTER TABLE education_v30.facilitated_room_survey_campaigns SET SCHEMA public;
DO $after$
DECLARE x record; table_oid oid; r record; num_rows bigint;
BEGIN
 FOR x IN SELECT * FROM (VALUES
    ('facilitated_room_activity_releases',483328,2,2),
    ('facilitated_room_activity_responses',483362,0,3),
    ('facilitated_room_control_commands',491520,0,3),
    ('facilitated_room_feedback',483466,0,2),
    ('facilitated_room_presence_events',483401,0,2),
    ('facilitated_room_survey_campaigns',483499,0,2)
 ) AS expected(table_name,table_oid,inbound_fks,outbound_fks) LOOP
   table_oid := to_regclass(format('public.%I',x.table_name));
   IF table_oid IS DISTINCT FROM x.table_oid::oid
     OR to_regclass(format('education_v30.%I',x.table_name)) IS NOT NULL
   THEN RAISE EXCEPTION 'OID migration incomplete: %',x.table_name; END IF;
   SELECT relrowsecurity,relforcerowsecurity,relacl INTO r FROM pg_class WHERE oid=table_oid;
   IF NOT r.relrowsecurity OR NOT r.relforcerowsecurity OR r.relacl IS NOT NULL
     OR (SELECT count(*) FROM pg_policy WHERE polrelid=table_oid)<>1
     OR (SELECT count(*) FROM pg_constraint WHERE confrelid=table_oid AND contype='f')<>x.inbound_fks
     OR (SELECT count(*) FROM pg_constraint WHERE conrelid=table_oid AND contype='f')<>x.outbound_fks
   THEN RAISE EXCEPTION 'Post-move security or FK mismatch: %',x.table_name; END IF;
   EXECUTE format('SELECT count(*) FROM public.%I',x.table_name) INTO num_rows;
   IF num_rows<>0 THEN RAISE EXCEPTION 'Unexpected post-move rows in %',x.table_name; END IF;
 END LOOP;
END $after$;
-- These views must remain queryable without changing their parse-tree dependencies.
SELECT * FROM education_v30.facilitated_room_pilot_evidence LIMIT 0;
SELECT * FROM education_v30.facilitated_room_pilot_weekly_evidence LIMIT 0;
SELECT * FROM education_v30.facilitated_room_media_command_evidence LIMIT 0;
COMMIT;
