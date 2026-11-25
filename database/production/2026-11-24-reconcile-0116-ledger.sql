-- Narrow reconciliation of 0116 only. Preserve the old hash in this reviewed file.
-- Original SQL is unchanged since 58cc2ea089207cee628025b574f4f04d8483ab06.
-- Both column definitions and the validated FK were independently inspected on main.
-- Historical execution logs are unavailable; this is schema-equivalence reconciliation,
-- not a claim that original execution was independently witnessed.
DO $repair$
DECLARE changed integer;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
 OR current_database()<>'neondb' OR current_user<>'neondb_owner'
 THEN RAISE EXCEPTION 'Expected CAN OS Neon main owner'; END IF;
 PERFORM pg_advisory_xact_lock(20261115,79083);
 IF (SELECT count(*) FROM drizzle.__drizzle_migrations WHERE created_at=1795462010000)<>1
 OR (SELECT max(created_at) FROM drizzle.__drizzle_migrations)<>1795462010000
 THEN RAISE EXCEPTION 'Unexpected 0116 ledger baseline'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
 WHERE a.attrelid='public.campaign_deliveries'::regclass AND a.attname='outcome_unconfirmed'
 AND NOT a.attisdropped AND a.atttypid='boolean'::regtype AND a.attnotnull
 AND pg_get_expr(d.adbin,d.adrelid)='false')
 OR NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.campaign_suppressions'::regclass
 AND a.attname='recorded_by_person_id' AND a.atttypid='uuid'::regtype AND NOT a.attnotnull AND NOT a.attisdropped
 AND NOT EXISTS(SELECT 1 FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum))
 OR NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='recorded_by_person_id'
 JOIN pg_attribute p ON p.attrelid=c.confrelid AND p.attname='id'
 WHERE c.conrelid='public.campaign_suppressions'::regclass AND c.confrelid='public.people'::regclass
 AND c.contype='f' AND c.convalidated AND c.confdeltype='r' AND c.confupdtype='a'
 AND NOT c.condeferrable AND c.conkey=ARRAY[a.attnum] AND c.confkey=ARRAY[p.attnum])
 THEN RAISE EXCEPTION '0116 catalog evidence differs from committed SQL'; END IF;
 UPDATE drizzle.__drizzle_migrations
 SET hash='9fde0995f1d5ad49f1bb194e0c1f151de79c9b7c4b2e92d2def807a4faa697d7'
 WHERE id=118 AND created_at=1795462010000
 AND hash='9fde0995f1d5ad49f1bb194e0c1f151de79c7b4b2e92d2def807a4faa697d7';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Expected exactly one reviewed malformed 0116 row'; END IF;
END $repair$;
