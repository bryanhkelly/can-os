#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { assertIsolatedTestDatabaseTarget } from "./isolated-test-db-guard.mjs";

async function expectQueryDenied(client, savepoint, query, values, expectedCode) {
  await client.query(`SAVEPOINT ${savepoint}`);
  let error;
  try {
    await client.query(query, values);
  } catch (caught) {
    error = caught;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (error?.code !== expectedCode) {
    throw new Error(`Expected database denial ${expectedCode} at ${savepoint}.`);
  }
}

async function main() {
  if (existsSync(".env.local")) loadEnvFile(".env.local");
  if (process.env.APP_ENV !== "test") {
    throw new Error("APP_ENV=test is required for canonical schema validation.");
  }

  const fail = (message) => {
    throw new Error(`Canonical schema validation refused: ${message}`);
  };
  const { testUrl } = assertIsolatedTestDatabaseTarget({
    env: process.env,
    fail,
  });
  const ddl = readFileSync(
    resolve("database", "canonical", "v3.0.1", "schema.sql"),
    "utf8",
  );
  const controls = ddl.match(/^\s*(BEGIN|COMMIT|ROLLBACK);\s*$/gm) ?? [];
  const lastStatement = ddl.trimEnd().split(/\r?\n/).at(-1);
  if (controls.length !== 2 || !/^BEGIN;\s*$/m.test(ddl) || lastStatement !== "COMMIT;") {
    throw new Error("Canonical DDL must contain one transaction ending in COMMIT.");
  }
  if (
    /^\s*(CREATE DATABASE|DROP DATABASE|ALTER SYSTEM|CREATE ROLE|DROP ROLE|VACUUM|ANALYZE|CREATE INDEX CONCURRENTLY|DROP INDEX CONCURRENTLY)\b/im.test(
      ddl,
    )
  ) {
    throw new Error("Canonical DDL contains a statement that cannot be rolled back.");
  }

  const transactionalDdl = ddl.replace(/^COMMIT;\s*$/m, "");
  if (transactionalDdl === ddl) throw new Error("Could not remove the canonical DDL commit.");

  const pool = new Pool({ connectionString: testUrl, max: 1 });
  const client = await pool.connect();
  let released = false;
  try {
    const before = await client.query(`
      SELECT current_setting('server_version_num')::integer AS server_version_num,
        to_regnamespace('education_v30') IS NULL AS main_schema_absent,
        to_regnamespace('education_v30_secure') IS NULL AS secure_schema_absent,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') AS has_btree_gist,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') AS has_pgcrypto
    `);
    const initial = before.rows[0];
    if (initial.server_version_num < 160000) {
      throw new Error("PostgreSQL 16 or newer is required.");
    }
    if (!initial.main_schema_absent || !initial.secure_schema_absent) {
      throw new Error("Canonical schema already exists; refusing to run.");
    }

    await client.query(transactionalDdl);
    const catalog = await client.query(`
      SELECT reference_kind, count(*)::integer AS item_count
      FROM education_v30.blueprint_reference_items
      GROUP BY reference_kind
    `);
    const referenceCounts = Object.fromEntries(
      catalog.rows.map(({ reference_kind, item_count }) => [reference_kind, item_count]),
    );
    const referenceVersionCount = await client.query(`
      SELECT count(*)::integer AS item_count
      FROM education_v30.blueprint_reference_item_versions
      WHERE lifecycle = 'published'
    `);
    const affiliationCount = await client.query(`
      SELECT count(*)::integer AS item_count
      FROM education_v30.religious_affiliation_options
    `);
    const rlsCount = await client.query(`
      SELECT count(*)::integer AS table_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
        AND c.relname = ANY($1::text[])
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    `, [[
      "blueprint_configurations",
      "blueprint_configuration_versions",
      "blueprint_configuration_components",
      "blueprint_configuration_local_experiences",
      "blueprint_configuration_component_references",
      "blueprint_configuration_offering_intents",
      "configuration_reviews",
      "blueprint_outputs",
      "audit_events",
      "domain_events",
    ]]);
    const immutableChildTriggerCount = await client.query(`
      SELECT count(*)::integer AS trigger_count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
        AND t.tgname = ANY($1::text[])
        AND NOT t.tgisinternal
    `, [[
      "blueprint_reference_selection_immutability",
      "blueprint_offering_intent_immutability",
      "blueprint_local_experience_immutability",
      "blueprint_configuration_review_append_only",
    ]]);
    const learningRlsCount = await client.query(`
      SELECT count(*)::integer AS table_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
        AND c.relname = ANY($1::text[])
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    `, [[
      "instructional_track_policy_versions",
      "instructional_track_policy_withdrawals",
      "instructional_track_command_receipts",
      "content_withdrawals",
      "learner_course_attempts",
      "track_distribution_authorizations",
      "professional_capability_authorizations",
      "professional_role_assignments",
      "content_publication_manifests",
      "content_publication_manifest_items",
      "instructional_tracks",
      "track_lesson_presentations",
      "published_asset_reviews",
      "instructional_track_versions",
      "instructional_track_materials",
      "instructional_track_reviews",
      "learner_track_selections",
      "formative_practice_attempts",
      "noncredit_registrations",
    ]]);
    const nativeBlueprintSecurity = await client.query(`
      SELECT (SELECT count(*)::integer
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='education_v30'
          AND c.relname=ANY($1::text[])
          AND c.relrowsecurity AND c.relforcerowsecurity) AS protected_tables,
        (SELECT count(*)::integer
        FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='education_v30'
          AND p.polname LIKE 'blueprint_%') AS scoped_policies,
        (SELECT count(*)::integer
         FROM pg_policy p
         JOIN pg_class c ON c.oid=p.polrelid
         JOIN pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='education_v30'
           AND c.relname='education_operation_sites'
           AND p.polname='blueprint_operation_sites_read'
           AND p.polcmd='r'
           AND pg_get_expr(p.polqual,p.polrelid) LIKE '%blueprint_author%')
         AS scoped_operation_sites_policy,
        (SELECT count(*)::integer
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='education_v30'
          AND p.proname='v301_canonical_session_context'
          AND NOT EXISTS (SELECT 1
            FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a
            WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))
        AS private_session_functions
    `, [[
      "canonical_accounts","canonical_account_grants","canonical_sessions",
      "blueprints","blueprint_versions","blueprint_components",
      "religious_affiliation_options","evidence_documents",
      "evidence_document_versions","blueprint_component_approval_decisions",
      "blueprint_execution_batches","education_operations",
      "education_operation_organization_roles","education_operation_sites",
      "program_deployments","deployment_offering_adoptions",
    ]]);
    const programCatalogRlsCount = await client.query(`
      SELECT count(*)::integer AS table_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
        AND c.relname = ANY($1::text[])
        AND c.relrowsecurity
        AND c.relforcerowsecurity
    `, [[
      "database_role_organization_bindings",
      "sites",
      "site_organization_roles",
      "geographic_areas",
      "blueprint_reference_items",
      "blueprint_reference_item_versions",
      "offerings",
      "offering_versions",
      "qualification_program_fit_policies",
      "qualification_program_fit_policy_versions",
      "qualification_program_fit_policy_version_withdrawals",
    ]]);
    const programCatalogPolicyCheck = await client.query(`
      SELECT count(*)::integer AS policy_count,
        count(*) FILTER (WHERE
          p.polname = 'can_v30_trusted_owner_access'
          AND p.polcmd = '*'
          AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = current_user)]::oid[]
          AND pg_get_expr(p.polqual, p.polrelid) = 'true'
          AND pg_get_expr(p.polwithcheck, p.polrelid) = 'true'
        )::integer AS trusted_owner_policy_count,
        count(*) FILTER (WHERE
          p.polname = ANY($2::text[])
          AND p.polcmd = 'r'
          AND pg_get_expr(p.polqual, p.polrelid) LIKE '%v28_role_%'
        )::integer AS scoped_catalog_policy_count
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
        AND c.relname = ANY($1::text[])
    `, [[
      "database_role_organization_bindings",
      "sites",
      "site_organization_roles",
      "geographic_areas",
      "blueprint_reference_items",
      "blueprint_reference_item_versions",
      "offerings",
      "offering_versions",
      "qualification_program_fit_policies",
      "qualification_program_fit_policy_versions",
      "qualification_program_fit_policy_version_withdrawals",
    ], [
      "program_catalog_geographic_areas_read",
      "program_catalog_site_operators_read",
      "program_catalog_sites_read",
      "program_catalog_blueprint_reference_items_read",
      "program_catalog_blueprint_reference_versions_read",
      "program_catalog_offerings_read",
      "program_catalog_offering_versions_read",
      "program_catalog_fit_policies_read",
      "program_catalog_fit_policy_versions_read",
      "program_catalog_fit_policy_withdrawals_read",
    ]]);
    const programCatalogFunctionCheck = await client.query(`
      SELECT count(*)::integer AS function_count,
        count(*) FILTER (WHERE NOT EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ))::integer AS no_public_execute_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'education_v30'
        AND p.proname = ANY($1::text[])
    `, [[
      "v28_role_can_access_org",
      "v28_role_has_purpose",
      "v30_catalog_program_availability",
    ]]);
    const catalogOrganizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const catalogRole = `can_v30_program_catalog_${catalogOrganizationId.replaceAll("-", "")}`;
    const applicationRole = `can_v30_program_catalog_app_${randomUUID().replaceAll("-", "")}`;
    const publicSiteReaderRole = `can_v30_public_reader_${randomUUID().replaceAll("-", "")}`;
    const publicSiteApplicationRole = `can_v30_public_app_${randomUUID().replaceAll("-", "")}`;
    if (!/^[a-z0-9_]+$/.test(catalogRole)) {
      throw new Error("Generated program-catalog role name is invalid.");
    }
    if (!/^[a-z0-9_]+$/.test(applicationRole)) {
      throw new Error("Generated application role name is invalid.");
    }
    if (!/^[a-z0-9_]+$/.test(publicSiteReaderRole) ||
        !/^[a-z0-9_]+$/.test(publicSiteApplicationRole)) {
      throw new Error("Generated public-site role name is invalid.");
    }
    const authorizedSiteCode = `catalog-${randomUUID()}`;
    const otherSiteCode = `catalog-${randomUUID()}`;
    await client.query(`
      INSERT INTO education_v30.organizations (id, legal_name, display_name)
      VALUES
        ($1, 'Catalog rollback fixture', 'Catalog rollback fixture'),
        ($2, 'Other catalog rollback fixture', 'Other catalog rollback fixture')
    `, [catalogOrganizationId, otherOrganizationId]);
    const geography = await client.query(`
      INSERT INTO education_v30.geographic_areas (code, name, level_code)
      VALUES ($1, 'Catalog rollback fixture', 'test')
      RETURNING id
    `, [`catalog-${randomUUID()}`]);
    const geographicAreaId = geography.rows[0].id;
    const sites = await client.query(`
      INSERT INTO education_v30.sites (code, name, site_kind, geographic_area_id, status)
      VALUES
        ($1, 'Authorized catalog site', 'physical', $3, 'active'),
        ($2, 'Other organization catalog site', 'physical', $3, 'active')
      RETURNING id, code
    `, [authorizedSiteCode, otherSiteCode, geographicAreaId]);
    const authorizedSiteId = sites.rows.find((site) => site.code === authorizedSiteCode)?.id;
    const otherSiteId = sites.rows.find((site) => site.code === otherSiteCode)?.id;
    if (!authorizedSiteId || !otherSiteId) {
      throw new Error("Program-catalog rollback Sites were not created.");
    }
    const relationshipStart = new Date(Date.now() - 60_000);
    await client.query(`
      INSERT INTO education_v30.site_organization_roles (
        site_id, organization_id, role_code, valid_from
      ) VALUES
        ($1, $2, 'operator', $4),
        ($3, $5, 'operator', $4)
    `, [authorizedSiteId, catalogOrganizationId, otherSiteId, relationshipStart, otherOrganizationId]);
    // Native v3 account, grant, Site and bearer-session smoke test.
    const canonicalPersonId = randomUUID();
    const canonicalAccountId = randomUUID();
    const canonicalGrantId = randomUUID();
    const canonicalSessionHash = "a".repeat(64);
    await client.query(`
      INSERT INTO education_v30.persons (id,preferred_name)
      VALUES ($1,'Canonical test administrator')
    `, [canonicalPersonId]);
    await client.query(`
      INSERT INTO education_v30.canonical_accounts (id,email_normalized,email_verified_at)
      VALUES ($1,$2,clock_timestamp())
    `, [canonicalAccountId, `canonical-${randomUUID()}@example.test`]);
    await client.query(`
      INSERT INTO education_v30.canonical_account_grants (
        id,account_id,person_id,organization_id,site_id,role_code
      ) VALUES ($1,$2,$3,$4,$5,'site_admin')
    `, [canonicalGrantId, canonicalAccountId, canonicalPersonId,
      catalogOrganizationId, authorizedSiteId]);
    await client.query(`
      INSERT INTO education_v30.canonical_sessions (
        account_id,active_grant_id,secret_hash,expires_at
      ) VALUES ($1,$2,$3,clock_timestamp()+interval '12 hours')
    `, [canonicalAccountId, canonicalGrantId, canonicalSessionHash]);
    await client.query(`
      CREATE ROLE can_v30_canonical_auth_reader
       NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE
    `);
    await client.query(`
      GRANT USAGE ON SCHEMA education_v30 TO can_v30_canonical_auth_reader
    `);
    await client.query(`
      GRANT EXECUTE ON FUNCTION education_v30.v301_canonical_session_context(text)
      TO can_v30_canonical_auth_reader
    `);
    await client.query("GRANT can_v30_canonical_auth_reader TO CURRENT_USER");
    await client.query("SET LOCAL ROLE can_v30_canonical_auth_reader");
    const canonicalSessionResult = await client.query(`
      SELECT person_id,organization_id,site_id,role_code
      FROM education_v30.v301_canonical_session_context($1)
    `, [canonicalSessionHash]);
    if (canonicalSessionResult.rows.length !== 1 ||
      canonicalSessionResult.rows[0].person_id !== canonicalPersonId ||
      canonicalSessionResult.rows[0].organization_id !== catalogOrganizationId ||
      canonicalSessionResult.rows[0].site_id !== authorizedSiteId ||
      canonicalSessionResult.rows[0].role_code !== "site_admin") {
      throw new Error("Native v3 session did not resolve exactly one scoped Person and Site.");
    }
    await expectQueryDenied(
      client, "canonical_raw_sessions_denied",
      "SELECT secret_hash FROM education_v30.canonical_sessions LIMIT 1",
      [], "42501",
    );
    await client.query("RESET ROLE");
    await client.query(`
      UPDATE education_v30.canonical_sessions
      SET revoked_at=clock_timestamp() WHERE secret_hash=$1
    `, [canonicalSessionHash]);
    await client.query("SET LOCAL ROLE can_v30_canonical_auth_reader");
    const revokedNativeSession = await client.query(`
      SELECT count(*)::integer AS remaining
      FROM education_v30.v301_canonical_session_context($1)
    `, [canonicalSessionHash]);
    if (revokedNativeSession.rows[0].remaining !== 0) {
      throw new Error("Revoked canonical sessions must not resolve an identity.");
    }
    await client.query("RESET ROLE");

    await client.query(`
      INSERT INTO education_v30.site_publication_bindings (
        site_id, public_slug, status, published_at
      ) VALUES
        ($1, 'canonical-public-reader-test', 'published', clock_timestamp()),
        ($2, 'canonical-public-reader-draft', 'draft', NULL)
    `, [authorizedSiteId, otherSiteId]);
    await client.query(`CREATE ROLE ${catalogRole} LOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE`);
    await client.query(`GRANT USAGE ON SCHEMA education_v30 TO ${catalogRole}`);
    for (const [table, columns] of [
      ["sites", "id, geographic_area_id, status"],
      ["site_organization_roles", "site_id, organization_id, role_code, valid_from, valid_through"],
      ["geographic_areas", "id"],
      ["blueprint_reference_items", "id, code, reference_kind, category, status, sort_order"],
      ["blueprint_reference_item_versions", "id, item_id, version_no, title, summary, lifecycle"],
      ["offerings", "id, code, title, status"],
      ["offering_versions", "id, offering_id, version_no, lifecycle"],
      ["qualification_program_fit_policies", "id, status"],
      ["qualification_program_fit_policy_versions", "id, policy_id, offering_version_id, lifecycle"],
      ["qualification_program_fit_policy_version_withdrawals", "policy_version_id, effective_at"],
    ]) {
      await client.query(`GRANT SELECT (${columns}) ON education_v30.${table} TO ${catalogRole}`);
    }
    await client.query(`
      GRANT EXECUTE ON FUNCTION
        education_v30.v28_role_can_access_org(uuid, text),
        education_v30.v28_role_has_purpose(text),
        education_v30.v30_catalog_program_availability(uuid, text)
      TO ${catalogRole}
    `);
    await client.query(`
      INSERT INTO education_v30.database_role_organization_bindings (
        db_role, organization_id, purpose_code, valid_from, status
      ) VALUES ($1, $2, 'program_catalog', clock_timestamp(), 'approved')
    `, [catalogRole, catalogOrganizationId]);

    await client.query(`
      CREATE ROLE ${applicationRole} LOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE
    `);
    await client.query(`
      GRANT ${catalogRole} TO ${applicationRole} WITH INHERIT FALSE, SET TRUE
    `);
    await client.query(`GRANT ${applicationRole} TO CURRENT_USER`);
    const provisionedRole = await client.query(`
      SELECT r.rolcanlogin
          AND NOT r.rolsuper
          AND NOT r.rolbypassrls
          AND NOT r.rolcreatedb
          AND NOT r.rolcreaterole
          AND NOT r.rolinherit
          AND NOT r.rolreplication
          AND NOT EXISTS (
            SELECT 1 FROM pg_auth_members m WHERE m.member = r.oid
          )
          AND NOT pg_has_role(r.oid, n.nspowner, 'MEMBER') AS least_privilege_role
      FROM pg_roles r
      CROSS JOIN pg_namespace n
      WHERE r.rolname = $1 AND n.nspname = 'education_v30'
    `, [catalogRole]);
    if (!provisionedRole.rows[0]?.least_privilege_role) {
      throw new Error("Provisioned program-catalog role has unsafe role attributes or memberships.");
    }
    const applicationMembership = await client.query(`
      SELECT bool_and(r.rolcanlogin
          AND NOT r.rolsuper
          AND NOT r.rolbypassrls
          AND NOT r.rolcreatedb
          AND NOT r.rolcreaterole
          AND NOT r.rolinherit
          AND NOT r.rolreplication
          AND NOT pg_has_role(r.oid, n.nspowner, 'MEMBER')
          AND NOT has_table_privilege(r.oid, 'education_v30.sites', 'SELECT'))
          AND count(m.roleid) = 1
          AND bool_and(m.roleid = catalog_role.oid
            AND m.set_option AND NOT m.inherit_option AND NOT m.admin_option)
        AS restricted_role_membership
      FROM pg_roles r
      CROSS JOIN pg_namespace n
      JOIN pg_auth_members m ON m.member = r.oid
      JOIN pg_roles catalog_role ON catalog_role.rolname = $2
      WHERE r.rolname = $1 AND n.nspname = 'education_v30'
    `, [applicationRole, catalogRole]);
    if (!applicationMembership.rows[0]?.restricted_role_membership) {
      throw new Error("Application role does not have a non-inheriting SET-only catalog role grant.");
    }

    await client.query(`
      CREATE ROLE ${publicSiteReaderRole} NOLOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE
    `);
    await client.query(`
      GRANT USAGE ON SCHEMA education_v30 TO ${publicSiteReaderRole}
    `);
    await client.query(`
      GRANT EXECUTE ON FUNCTION education_v30.v301_public_site_claims(text)
      TO ${publicSiteReaderRole}
    `);
    await client.query(`
      CREATE ROLE ${publicSiteApplicationRole} LOGIN NOINHERIT NOBYPASSRLS NOCREATEDB NOCREATEROLE
    `);
    await client.query(`
      GRANT ${publicSiteReaderRole} TO ${publicSiteApplicationRole}
      WITH INHERIT FALSE, SET TRUE
    `);
    await client.query(`GRANT ${publicSiteApplicationRole} TO CURRENT_USER`);
    await client.query(`SET LOCAL ROLE ${publicSiteApplicationRole}`);
    await client.query(`SET LOCAL ROLE ${publicSiteReaderRole}`);
    const publicSiteRoleResult = await client.query(`
      SELECT current_user::text = $1 AS expected_role,
        (SELECT count(*) FROM education_v30.v301_public_site_claims($2)) AS published_rows,
        (SELECT count(*) FROM education_v30.v301_public_site_claims($3)) AS draft_rows,
        (SELECT max(site_name) FROM education_v30.v301_public_site_claims($2))
          AS published_site_name,
        has_function_privilege(current_user,
          'education_v30.v301_public_site_claims(text)', 'EXECUTE') AS can_execute_projection,
        has_table_privilege(current_user,
          'education_v30.site_publication_bindings', 'SELECT') AS can_read_bindings,
        has_table_privilege(current_user,
          'education_v30.program_publication_claims', 'SELECT') AS can_read_claims
    `, [publicSiteReaderRole, "canonical-public-reader-test", "canonical-public-reader-draft"]);
    const publicSiteRole = publicSiteRoleResult.rows[0];
    if (!publicSiteRole.expected_role
      || publicSiteRole.published_rows !== "1"
      || publicSiteRole.draft_rows !== "0"
      || publicSiteRole.published_site_name !== "Authorized catalog site"
      || !publicSiteRole.can_execute_projection
      || publicSiteRole.can_read_bindings
      || publicSiteRole.can_read_claims) {
      throw new Error("Public-site reader role access is not limited to the public projection.");
    }
    await expectQueryDenied(
      client,
      "public_site_direct_binding_read",
      "SELECT site_id FROM education_v30.site_publication_bindings LIMIT 1",
      [],
      "42501",
    );
    await expectQueryDenied(
      client,
      "public_site_direct_claim_read",
      "SELECT display_text FROM education_v30.program_publication_claims LIMIT 1",
      [],
      "42501",
    );
    await client.query("RESET ROLE");

    await client.query(`SET LOCAL ROLE ${applicationRole}`);
    await client.query(`SET LOCAL ROLE ${catalogRole}`);
    const activeRole = await client.query(`
      SELECT current_user::text = $1 AS expected_role,
        (SELECT count(*) FROM education_v30.sites WHERE id = $2) AS authorized_site_count,
        (SELECT count(*) FROM education_v30.sites WHERE id = $3) AS cross_organization_site_count,
        has_column_privilege(current_user, 'education_v30.sites', 'name', 'SELECT')
          AS can_read_ungranted_site_name,
        has_table_privilege(current_user, 'education_v30.sites', 'UPDATE')
          AS can_update_sites,
        education_v30.v28_role_can_access_org($4, 'program_catalog')
          AS has_bound_organization,
        education_v30.v28_role_has_purpose('program_catalog') AS has_catalog_purpose,
        (SELECT count(*) FROM education_v30.v30_catalog_program_availability($5, 'onsite'))
          AS catalog_function_rows,
        (SELECT count(*) FROM education_v30.blueprint_reference_items)
          AS active_reference_count,
        (SELECT count(*) FROM education_v30.blueprint_reference_item_versions)
          AS published_reference_count,
        has_column_privilege(current_user,
          'education_v30.blueprint_reference_item_versions', 'metadata', 'SELECT')
          AS can_read_private_reference_metadata,
        has_table_privilege(current_user,
          'education_v30.blueprint_reference_items', 'INSERT')
          AS can_write_reference_library
    `, [catalogRole, authorizedSiteId, otherSiteId, catalogOrganizationId, geographicAreaId]);
    const activeRoleResult = activeRole.rows[0];
    if (!activeRoleResult.expected_role
      || activeRoleResult.authorized_site_count !== "1"
      || activeRoleResult.cross_organization_site_count !== "0"
      || activeRoleResult.can_read_ungranted_site_name
      || activeRoleResult.can_update_sites
      || !activeRoleResult.has_bound_organization
      || !activeRoleResult.has_catalog_purpose
      || activeRoleResult.active_reference_count !== "74"
      || activeRoleResult.published_reference_count !== "74"
      || activeRoleResult.can_read_private_reference_metadata
      || activeRoleResult.can_write_reference_library
      || !/^\d+$/.test(activeRoleResult.catalog_function_rows)) {
      throw new Error("Program-catalog role authorization or least-privilege checks failed.");
    }
    await expectQueryDenied(
      client,
      "catalog_ungranted_column",
      "SELECT name FROM education_v30.sites WHERE id = $1",
      [authorizedSiteId],
      "42501",
    );
    await expectQueryDenied(
      client,
      "catalog_prospect_contact_denied",
      "SELECT contact_email FROM education_v30_secure.enrollment_prospect_contact_details LIMIT 1",
      [],
      "42501",
    );
    await expectQueryDenied(
      client,
      "catalog_write_denied",
      "UPDATE education_v30.sites SET status = 'closed' WHERE id = $1",
      [authorizedSiteId],
      "42501",
    );

    await client.query("RESET ROLE");
    await client.query(`
      UPDATE education_v30.database_role_organization_bindings
      SET valid_through = clock_timestamp() - interval '1 second'
      WHERE db_role = $1 AND organization_id = $2 AND purpose_code = 'program_catalog'
    `, [catalogRole, catalogOrganizationId]);
    await client.query(`SET LOCAL ROLE ${applicationRole}`);
    await client.query(`SET LOCAL ROLE ${catalogRole}`);
    const expiredRole = await client.query(`
      SELECT count(*) AS visible_sites
      FROM education_v30.sites
      WHERE id = $1
    `, [authorizedSiteId]);
    const expiredFunction = await client.query(`
      SELECT education_v30.v28_role_has_purpose('program_catalog') AS has_catalog_purpose
    `);
    if (expiredRole.rows[0].visible_sites !== "0" || expiredFunction.rows[0].has_catalog_purpose) {
      throw new Error("Expired program-catalog role binding retained access.");
    }
    await expectQueryDenied(
      client,
      "catalog_expired_function",
      `SELECT * FROM education_v30.v30_catalog_program_availability($1, 'onsite')`,
      [geographicAreaId],
      "P0001",
    );

    await client.query("RESET ROLE");
    await client.query(`
      UPDATE education_v30.database_role_organization_bindings
      SET valid_through = NULL, status = 'revoked'
      WHERE db_role = $1 AND organization_id = $2 AND purpose_code = 'program_catalog'
    `, [catalogRole, catalogOrganizationId]);
    await client.query(`SET LOCAL ROLE ${applicationRole}`);
    await client.query(`SET LOCAL ROLE ${catalogRole}`);
    const revokedRole = await client.query(`
      SELECT (SELECT count(*) FROM education_v30.sites WHERE id = $1) AS visible_sites,
        education_v30.v28_role_has_purpose('program_catalog') AS has_catalog_purpose
    `, [authorizedSiteId]);
    if (revokedRole.rows[0].visible_sites !== "0" || revokedRole.rows[0].has_catalog_purpose) {
      throw new Error("Revoked program-catalog role binding retained access.");
    }
    await expectQueryDenied(
      client,
      "catalog_revoked_function",
      `SELECT * FROM education_v30.v30_catalog_program_availability($1, 'onsite')`,
      [geographicAreaId],
      "P0001",
    );
    await client.query("RESET ROLE");
    const learningPolicyCheck = await client.query(`
      SELECT count(*)::integer AS policy_count,
        count(*) FILTER (WHERE
          p.polname = 'can_v30_trusted_owner_access'
          AND p.polcmd = '*'
          AND p.polroles = ARRAY[(SELECT oid FROM pg_roles WHERE rolname = current_user)]::oid[]
          AND pg_get_expr(p.polqual, p.polrelid) = 'true'
          AND pg_get_expr(p.polwithcheck, p.polrelid) = 'true'
        )::integer AS trusted_owner_policy_count,
        count(*) FILTER (WHERE
          c.relname = 'noncredit_registrations'
          AND p.polname = 'tenant_noncredit_registration_select'
          AND p.polcmd = 'r'
          AND p.polroles = '{0}'::oid[]
          AND pg_get_expr(p.polqual, p.polrelid) LIKE '%v28_role_can_access_org%'
          AND pg_get_expr(p.polqual, p.polrelid) LIKE '%training_registration%'
        )::integer AS scoped_registration_policy_count
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
        AND c.relname = ANY($1::text[])
    `, [[
      "instructional_track_policy_versions",
      "instructional_track_policy_withdrawals",
      "instructional_track_command_receipts",
      "content_withdrawals",
      "learner_course_attempts",
      "track_distribution_authorizations",
      "professional_capability_authorizations",
      "professional_role_assignments",
      "content_publication_manifests",
      "content_publication_manifest_items",
      "instructional_tracks",
      "track_lesson_presentations",
      "published_asset_reviews",
      "instructional_track_versions",
      "instructional_track_materials",
      "instructional_track_reviews",
      "learner_track_selections",
      "formative_practice_attempts",
      "noncredit_registrations",
      "can_v30_trusted_owner_access",
      "tenant_noncredit_registration_select",
    ]]);
    const learningTriggerCount = await client.query(`
      SELECT count(*)::integer AS trigger_count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
        AND t.tgname = ANY($1::text[])
        AND NOT t.tgisinternal
    `, [[
      "instructional_track_policy_version_immutability",
      "instructional_track_policy_publication_gate",
      "instructional_track_policy_withdrawals_append_only",
      "instructional_track_command_receipts_append_only",
      "track_publication_gate",
      "track_selection_published",
      "formative_practice_eligibility",
      "formative_practice_attempts_append_only",
      "track_distribution_rights_evidence_guard",
      "track_manifest_rights_evidence_guard",
      "content_withdrawals_append_only",
      "submitted_track_version_immutability",
      "released_track_identity_immutability",
      "learner_course_attempt_source_gate",
    ]]);
    const courseScopedRoleColumnCount = await client.query(`
      SELECT count(*)::integer AS column_count
      FROM information_schema.columns
      WHERE table_schema = 'education_v30'
        AND table_name = 'professional_role_assignments'
        AND column_name = 'course_id'
    `);
    const securePracticeTriggerCount = await client.query(`
      SELECT count(*)::integer AS trigger_count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30_secure'
        AND t.tgname = 'formative_practice_response_append_only'
        AND NOT t.tgisinternal
    `);
    const securePracticeRlsCount = await client.query(`
        SELECT count(*)::integer AS table_count
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'education_v30_secure'
          AND c.relname = 'formative_practice_responses'
          AND c.relrowsecurity
          AND c.relforcerowsecurity
    `);
    const prospectContactRlsCount = await client.query(`
    SELECT count(*)::integer AS table_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'education_v30_secure'
      AND c.relname = 'enrollment_prospect_contact_details'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
    `);
    const sitePublicationBindingRlsCount = await client.query(`
      SELECT count(*)::integer AS table_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'education_v30'
      AND c.relname = 'site_publication_bindings'
      AND c.relrowsecurity
      AND c.relforcerowsecurity
    `);
    const publicSiteClaimsFunctionCheck = await client.query(`
      SELECT count(*)::integer AS function_count,
        count(*) FILTER (WHERE p.prosecdef AND NOT EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ))::integer AS restricted_definer_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'education_v30'
        AND p.proname = 'v301_public_site_claims'
    `);
    await client.query(`
      DO $reference_immutability$
      DECLARE rejected boolean := false;
      BEGIN
        BEGIN
          UPDATE education_v30.blueprint_reference_item_versions
          SET title = title
          WHERE id = (
            SELECT id FROM education_v30.blueprint_reference_item_versions
            WHERE lifecycle = 'published' LIMIT 1
          );
        EXCEPTION WHEN raise_exception THEN
          rejected := true;
        END;
        IF NOT rejected THEN
          RAISE EXCEPTION 'Published Blueprint reference version mutation was accepted';
        END IF;
      END
      $reference_immutability$;
    `);
    await client.query(`
      DO $blueprint_version_invariants$
      DECLARE
        organization_id uuid;
        blueprint_id uuid;
        blueprint_version_id uuid;
        component_id uuid;
        configuration_id uuid;
        configuration_version_id uuid;
        offering_id uuid;
        offering_version_id uuid;
        reference_version_id uuid;
        late_offering_version_id uuid;
        late_reference_version_id uuid;
        rejected boolean;
      BEGIN
        INSERT INTO education_v30.organizations(legal_name,display_name)
        VALUES ('Rollback fixture','Rollback fixture')
        RETURNING id INTO organization_id;
        INSERT INTO education_v30.blueprints(publisher_organization_id,code,title)
        VALUES (organization_id,'rollback-fixture','Rollback fixture')
        RETURNING id INTO blueprint_id;
        INSERT INTO education_v30.blueprint_versions(
          blueprint_id,version_no,target_kind)
        VALUES (blueprint_id,1,'composite')
        RETURNING id INTO blueprint_version_id;
        INSERT INTO education_v30.blueprint_components(
          blueprint_version_id,component_key,component_kind)
        VALUES (blueprint_version_id,'fixture-component','program_model')
        RETURNING id INTO component_id;
        INSERT INTO education_v30.blueprint_configurations(
          blueprint_id,owning_organization_id,name)
        VALUES (blueprint_id,organization_id,'Rollback fixture')
        RETURNING id INTO configuration_id;
        INSERT INTO education_v30.blueprint_configuration_versions(
          configuration_id,blueprint_id,blueprint_version_id,revision)
        VALUES (configuration_id,blueprint_id,blueprint_version_id,1)
        RETURNING id INTO configuration_version_id;
        INSERT INTO education_v30.blueprint_configuration_components(
          configuration_version_id,blueprint_version_id,component_id,selection_status)
        VALUES (configuration_version_id,blueprint_version_id,component_id,'proposed');
        INSERT INTO education_v30.blueprint_configuration_local_experiences(
          configuration_version_id,component_id,experience_kind,title)
        VALUES (configuration_version_id,component_id,'experience','Fixture proposal');
        SELECT id INTO reference_version_id
        FROM education_v30.blueprint_reference_item_versions
        WHERE lifecycle='published' LIMIT 1;
        SELECT id INTO late_reference_version_id
        FROM education_v30.blueprint_reference_item_versions
        WHERE lifecycle='published' AND id<>reference_version_id LIMIT 1;
        IF reference_version_id IS NULL THEN
          RAISE EXCEPTION 'Missing published Blueprint reference test fixture';
        END IF;
        IF late_reference_version_id IS NULL THEN
          RAISE EXCEPTION 'Missing second published Blueprint reference test fixture';
        END IF;
        INSERT INTO education_v30.blueprint_configuration_component_references(
          configuration_version_id,component_id,reference_item_version_id)
        VALUES (configuration_version_id,component_id,reference_version_id);
        UPDATE education_v30.blueprint_versions
        SET lifecycle='published',published_at=now()
        WHERE id=blueprint_version_id;
        INSERT INTO education_v30.offerings(publisher_organization_id,code,title)
        VALUES (organization_id,'rollback-fixture','Rollback fixture')
        RETURNING id INTO offering_id;
        INSERT INTO education_v30.offering_versions(
          offering_id,version_no,lifecycle,published_at)
        VALUES (offering_id,1,'published',now())
        RETURNING id INTO offering_version_id;
        INSERT INTO education_v30.offering_versions(
          offering_id,version_no,lifecycle,published_at)
        VALUES (offering_id,2,'published',now())
        RETURNING id INTO late_offering_version_id;
        INSERT INTO education_v30.blueprint_configuration_offering_intents(
          configuration_version_id,component_id,offering_version_id,configuration)
        VALUES (configuration_version_id,component_id,offering_version_id,'{"delivery":"onsite"}');
        UPDATE education_v30.blueprint_configuration_versions
        SET lifecycle='frozen',frozen_at=now()
        WHERE id=configuration_version_id;

        rejected := false;
        BEGIN
          UPDATE education_v30.blueprint_configuration_versions
          SET config='{"changed":true}'
          WHERE id=configuration_version_id;
        EXCEPTION WHEN raise_exception THEN
          rejected := true;
        END;
        IF NOT rejected THEN
          RAISE EXCEPTION 'Frozen Blueprint configuration version mutation was accepted';
        END IF;

        rejected := false;
        BEGIN
          INSERT INTO education_v30.blueprint_configuration_local_experiences(
            configuration_version_id,component_id,experience_kind,title)
          VALUES (configuration_version_id,component_id,'experience','Late proposal');
        EXCEPTION WHEN raise_exception THEN
          rejected := true;
        END;
        IF NOT rejected THEN
          RAISE EXCEPTION 'Frozen Blueprint local-experience append was accepted';
        END IF;

        rejected := false;
        BEGIN
          INSERT INTO education_v30.blueprint_configuration_component_references(
            configuration_version_id,component_id,reference_item_version_id)
          VALUES (configuration_version_id,component_id,late_reference_version_id);
        EXCEPTION WHEN raise_exception THEN
          rejected := true;
        END;
        IF NOT rejected THEN
          RAISE EXCEPTION 'Frozen Blueprint reference append was accepted';
        END IF;

        rejected := false;
        BEGIN
          INSERT INTO education_v30.blueprint_configuration_offering_intents(
            configuration_version_id,component_id,offering_version_id)
          VALUES (configuration_version_id,component_id,late_offering_version_id);
        EXCEPTION WHEN raise_exception THEN
          rejected := true;
        END;
        IF NOT rejected THEN
          RAISE EXCEPTION 'Frozen Blueprint Offering-intent append was accepted';
        END IF;

        INSERT INTO education_v30.audit_events(
          owning_organization_id,event_code,entity_kind,entity_id,payload)
        VALUES (organization_id,'blueprint.configuration.submitted',
          'blueprint_configuration',configuration_id,'{"revision":1}');
        INSERT INTO education_v30.domain_events(
          event_type,aggregate_type,aggregate_id,payload)
        VALUES ('BlueprintConfigurationSubmitted','blueprint_configuration',
          configuration_id,'{"revision":1}');
      END
      $blueprint_version_invariants$;
    `);
    const expectedReferenceCounts = {
      program_model: 14,
      club: 19,
      activity: 11,
      community: 13,
      experience: 17,
    };
    const failedInvariants = [
      JSON.stringify(Object.fromEntries(Object.entries(referenceCounts).sort())) !==
        JSON.stringify(Object.fromEntries(Object.entries(expectedReferenceCounts).sort())) &&
        "Blueprint reference catalog",
      referenceVersionCount.rows[0].item_count !== 74 && "published Blueprint reference versions",
      affiliationCount.rows[0].item_count !== 25 && "religious affiliation options",
      rlsCount.rows[0].table_count !== 10 && "Blueprint forced RLS",
      immutableChildTriggerCount.rows[0].trigger_count !== 4 && "Blueprint child immutability",
      (nativeBlueprintSecurity.rows[0].protected_tables !== 16 ||
        nativeBlueprintSecurity.rows[0].scoped_policies < 21 ||
        nativeBlueprintSecurity.rows[0].scoped_operation_sites_policy !== 1 ||
        nativeBlueprintSecurity.rows[0].private_session_functions !== 1) &&
        "native Blueprint database and session RLS",
      learningRlsCount.rows[0].table_count !== 19 && "learning forced RLS",
      programCatalogRlsCount.rows[0].table_count !== 11 && "program catalog forced RLS",
      (programCatalogPolicyCheck.rows[0].policy_count < 21 ||
        programCatalogPolicyCheck.rows[0].trusted_owner_policy_count !== 11 ||
        programCatalogPolicyCheck.rows[0].scoped_catalog_policy_count !== 10) &&
        "program catalog policy scope",
      (programCatalogFunctionCheck.rows[0].function_count !== 3 ||
        programCatalogFunctionCheck.rows[0].no_public_execute_count !== 3) &&
        "program catalog function grants",
      (learningPolicyCheck.rows[0].policy_count !== 20 ||
        learningPolicyCheck.rows[0].trusted_owner_policy_count !== 19 ||
        learningPolicyCheck.rows[0].scoped_registration_policy_count !== 1) &&
        "learning policy scope",
      learningTriggerCount.rows[0].trigger_count !== 14 && "learning lifecycle triggers",
      courseScopedRoleColumnCount.rows[0].column_count !== 1 && "course-scoped professional roles",
      securePracticeTriggerCount.rows[0].trigger_count !== 1 && "secure practice immutability",
      securePracticeRlsCount.rows[0].table_count !== 1 && "secure practice forced RLS",
      prospectContactRlsCount.rows[0].table_count !== 1 && "prospect contact forced RLS",
      sitePublicationBindingRlsCount.rows[0].table_count !== 1 && "public Site binding forced RLS",
      (publicSiteClaimsFunctionCheck.rows[0].function_count !== 1 ||
        publicSiteClaimsFunctionCheck.rows[0].restricted_definer_count !== 1) &&
        "public Site claims function access",
    ].filter(Boolean);
    if (failedInvariants.length > 0) {
      throw new Error(`Canonical persistence invariants failed: ${failedInvariants.join(", ")}.`);
    }

    await client.query("ROLLBACK");
    const after = await client.query(`
      SELECT to_regnamespace('education_v30') IS NULL AS main_schema_absent,
        to_regnamespace('education_v30_secure') IS NULL AS secure_schema_absent,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'btree_gist') AS has_btree_gist,
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') AS has_pgcrypto,
        NOT EXISTS (
          SELECT 1 FROM pg_roles
          WHERE rolname IN ($1, $2, $3, $4)
        ) AS probe_roles_absent
    `, [catalogRole, applicationRole, publicSiteReaderRole, publicSiteApplicationRole]);
    const final = after.rows[0];
    if (
      !final.main_schema_absent ||
      !final.secure_schema_absent ||
      !final.probe_roles_absent ||
      final.has_btree_gist !== initial.has_btree_gist ||
      final.has_pgcrypto !== initial.has_pgcrypto
    ) {
      throw new Error("Rollback verification failed; canonical objects remain.");
    }

    console.log(
      `Canonical v3.0.1 rollback, catalog, and public-site role checks passed on PostgreSQL ${Math.floor(initial.server_version_num / 10000)}.`,
    );
  } catch (error) {
    client.release(true);
    released = true;
    throw error;
  } finally {
    if (!released) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    "Canonical schema rollback check failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  process.exitCode = 1;
});
