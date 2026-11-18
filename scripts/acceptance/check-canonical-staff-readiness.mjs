#!/usr/bin/env node
/**
 * Read-only CAN -> canonical Site staff release preflight.
 * Checks installed schema and relationship readiness without inferring or
 * granting identity links, and without printing identities or credentials.
 *
 * DATABASE_URL=<target database> npm run db:canonical:staff-readiness
 * Requires at least one exact, approved, non-demo staff Person/Site/role path.
 * Still not proof a browser session authenticates or that the restricted login can SET ROLE.
 */
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for read-only readiness verification");
const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 });
let client;
try {
  client = await pool.connect();
  await client.query("BEGIN READ ONLY");
  const [{ staff_reader, person_link_table, platform_site_table, native_grants_table, operators_table }] =
    (await client.query(`
      SELECT
        to_regprocedure('education_v30.v301_can_staff_session_context(text)') IS NOT NULL AS staff_reader,
        to_regclass('public.access_account_canonical_principals') IS NOT NULL AS person_link_table,
        to_regclass('public.sites') IS NOT NULL AS platform_site_table,
        to_regclass('education_v30.canonical_account_grants') IS NOT NULL AS native_grants_table,
        to_regclass('education_v30.site_organization_roles') IS NOT NULL AS operators_table
    `)).rows;
  const checks = { staff_reader, person_link_table, platform_site_table, native_grants_table, operators_table };
  const missing = Object.entries(checks).filter(([, present]) => !present).map(([name]) => name);
  if (missing.length) {
    await client.query("ROLLBACK");
    console.error("FAIL: canonical staff infrastructure is incomplete: " + missing.join(", "));
    console.error("Apply the reviewed additive CAN staff migrations before any live acceptance run.");
    process.exitCode = 1;
  } else {
    const [counts] = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM public.account_person_grants g
           JOIN public.access_accounts a ON a.id = g.account_id
           JOIN public.people p ON p.id = g.person_id
          WHERE g.role = 'app_admin' AND g.active = true
            AND g.organization_id IS NULL AND g.site_id IS NULL
            AND a.person_id = p.id AND p.active = true
            AND a.disabled = false AND a.email_verified_at IS NOT NULL
            AND a.email_normalized NOT LIKE '%.demo'
            AND NOT EXISTS (
              SELECT 1 FROM public.account_person_grants conflicting
              WHERE conflicting.account_id = a.id AND conflicting.active = true
                AND conflicting.person_id <> a.person_id
            )
            AND (
              SELECT count(*) FROM public.account_person_grants authorized
              LEFT JOIN public.organizations authority_org
                ON authority_org.id = authorized.organization_id
              WHERE authorized.account_id = a.id
                AND authorized.person_id = a.person_id
                AND authorized.active = true
                AND (
                  (authorized.role = 'app_admin'
                    AND authorized.organization_id IS NULL
                    AND authorized.site_id IS NULL)
                  OR
                  (authorized.role = 'can_network_steward'
                    AND authorized.organization_id IS NOT NULL
                    AND authorized.site_id IS NULL
                    AND authority_org.type = 'can_network')
                )
            ) = 1
        ) AS eligible_app_admin_grants,
        (SELECT count(*)::int FROM public.account_person_grants g
           JOIN public.access_accounts a ON a.id = g.account_id
           JOIN public.people p ON p.id = g.person_id
           JOIN public.organizations o ON o.id = g.organization_id
          WHERE g.role = 'can_network_steward' AND g.active = true
            AND g.site_id IS NULL AND o.type = 'can_network'
            AND a.person_id = p.id AND p.active = true
            AND a.disabled = false AND a.email_verified_at IS NOT NULL
            AND a.email_normalized NOT LIKE '%.demo'
            AND NOT EXISTS (
              SELECT 1 FROM public.account_person_grants conflicting
              WHERE conflicting.account_id = a.id AND conflicting.active = true
                AND conflicting.person_id <> a.person_id
            )
            AND (
              SELECT count(*) FROM public.account_person_grants authorized
              LEFT JOIN public.organizations authority_org
                ON authority_org.id = authorized.organization_id
              WHERE authorized.account_id = a.id
                AND authorized.person_id = a.person_id
                AND authorized.active = true
                AND (
                  (authorized.role = 'app_admin'
                    AND authorized.organization_id IS NULL
                    AND authorized.site_id IS NULL)
                  OR
                  (authorized.role = 'can_network_steward'
                    AND authorized.organization_id IS NOT NULL
                    AND authorized.site_id IS NULL
                    AND authority_org.type = 'can_network')
                )
            ) = 1
        ) AS eligible_institutional_approver_grants,
        (SELECT count(*)::int FROM public.access_accounts a
           JOIN public.account_person_grants g ON g.account_id = a.id
          WHERE a.disabled = false AND a.email_verified_at IS NOT NULL
            AND a.email_normalized NOT LIKE '%.demo'
            AND a.person_id = g.person_id AND g.active = true
            AND g.role IN ('site_admin','registrar')
            AND g.organization_id IS NOT NULL AND g.site_id IS NOT NULL
        ) AS verified_can_staff_grants,
        (SELECT count(*)::int FROM public.access_account_canonical_principals
          WHERE revoked_at IS NULL AND verified_at IS NOT NULL) AS verified_person_links,
        (SELECT count(*)::int FROM public.sites platform_site
          WHERE platform_site.lifecycle_status IN ('planning','active')
        ) AS matching_shared_sites,
        (SELECT count(*)::int FROM education_v30.canonical_account_grants
          WHERE active = true AND revoked_at IS NULL
            AND role_code IN ('site_admin','registrar')) AS active_staff_grants,
        (SELECT count(*)::int FROM education_v30.site_organization_roles
          WHERE role_code IN ('operator','host') AND valid_from <= now()
            AND (valid_through IS NULL OR valid_through > now())) AS active_site_relationships,
        (SELECT count(*)::int FROM (
          SELECT a.id AS account_id, public_grant.id AS public_grant_id
           FROM public.access_accounts a
           JOIN public.account_person_grants public_grant
             ON public_grant.account_id = a.id
            AND public_grant.active AND public_grant.role IN ('site_admin','registrar')
            AND public_grant.site_id IS NOT NULL
           JOIN public.sites public_site ON public_site.id = public_grant.site_id
            AND public_site.organization_id = public_grant.organization_id
           JOIN public.access_account_canonical_principals person_link
             ON person_link.account_id = a.id
            AND person_link.revoked_at IS NULL AND person_link.verified_at IS NOT NULL
            AND person_link.verified_by_account_id <> a.id
           JOIN education_v30.canonical_account_grants native_grant
             ON native_grant.person_id = person_link.canonical_principal_id
            AND native_grant.site_id = public_site.id
            AND native_grant.role_code = public_grant.role
            AND native_grant.active AND native_grant.revoked_at IS NULL
           JOIN education_v30.canonical_accounts native_account
             ON native_account.id = native_grant.account_id
           JOIN public.organizations native_org
             ON native_org.id = native_grant.organization_id
           JOIN public.people can_person
             ON can_person.id = public_grant.person_id
          WHERE a.disabled = false AND a.email_verified_at IS NOT NULL
            AND a.person_id = public_grant.person_id
            AND a.email_normalized NOT LIKE '%.demo'
            AND native_account.disabled_at IS NULL
            AND native_account.email_verified_at IS NOT NULL
            AND native_org.lifecycle_status = 'active'
            AND can_person.active = true
            AND public_site.lifecycle_status IN ('planning','active')
            AND NOT EXISTS (
              SELECT 1 FROM public.account_person_grants other_grant
              WHERE other_grant.account_id = a.id AND other_grant.active = true
                AND other_grant.person_id <> public_grant.person_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.access_account_canonical_principals other_link
              WHERE other_link.canonical_principal_id = person_link.canonical_principal_id
                AND other_link.account_id <> a.id AND other_link.revoked_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM public.access_account_canonical_principals other_link
              WHERE other_link.account_id = a.id
                AND other_link.canonical_principal_id <> person_link.canonical_principal_id
                AND other_link.revoked_at IS NULL
            )
            AND EXISTS (
              SELECT 1 FROM education_v30.site_organization_roles rel
              WHERE rel.site_id = native_grant.site_id
                AND rel.organization_id = native_grant.organization_id
                AND rel.role_code IN ('host','operator')
                AND rel.valid_from <= now()
                AND (rel.valid_through IS NULL OR rel.valid_through > now())
            )
          GROUP BY a.id, public_grant.id
          HAVING count(*) = 1
        ) uniquely_authorized_staff) AS eligible_staff_paths
    `)).rows;
    await client.query("ROLLBACK");
    // Mirrors the restricted staff-session reader's identity and scope gates.
    // Exactly one canonical match per CAN active grant is mandatory.
    // An active browser session and role SET permission must still be tested.
    // Independent positive counters are NOT sufficient: they may belong to
    // different schools, people and grants. Require a complete joined path.
    const ready = Number(counts.eligible_staff_paths) > 0;
    // Only count approvers that pass the provisioner's exact-one-authority
    // requirement, including current Person ownership and conflicting grants.
    const firstAdminProvisioningBlocked = Number(counts.eligible_app_admin_grants) === 0
      && Number(counts.eligible_institutional_approver_grants) === 0;
    console.log(JSON.stringify({
      infrastructure: "present", ...counts,
      acceptance_ready: ready,
      staff_path_ready: ready,
      first_admin_provisioning_blocked: firstAdminProvisioningBlocked,
      browser_acceptance: "not-verified",
    }, null, 2));
    if (firstAdminProvisioningBlocked) {
      console.error("BLOCKED: no independently authorized App Admin or CAN institutional approver exists.");
      console.error("An initial institutional reviewer needs a separately governed, audited appointment.");
      console.error("Do not bypass approval, use shared demo credentials, or seed a privileged grant.");
    }
    if (!ready) {
      console.error("FAIL: no end-to-end, independently authorized, non-demo CAN staff path exists.");
      console.error("Do not create duplicate Site identities or grant staff access automatically.");
      process.exitCode = 1;
    } else {
      console.log("PASS: at least one matched CAN/canonical staff identity path exists.");
      console.log("NEXT: verify restricted login permissions and complete same-session Blueprint browser acceptance.");
      console.log("A joined path alone does not prove that a specific browser session can author.");
    }
  }
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => {});
  console.error("FAIL: canonical staff readiness could not be verified:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
