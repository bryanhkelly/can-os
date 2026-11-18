#!/usr/bin/env node
/**
 * Read-only CAN -> canonical Site staff release preflight.
 * Checks CAN-only staff sessions, exact public Person/Site/Organization grants,
 * enforced RLS and installed restricted SQL without printing identities.
 *
 * DATABASE_URL=<target database> npm run db:canonical:staff-readiness
 * Requires at least one current, verified, non-demo CAN staff Site-role path.
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
  const [{ project_id, branch_id, database_name, staff_reader, sites,
    organizations, people, access_grants, access_sessions, public_rls }] =
    (await client.query(`
      SELECT current_setting('neon.project_id',true) AS project_id,
        current_setting('neon.branch_id',true) AS branch_id,
        current_database() AS database_name,
        to_regprocedure('education_v30.v301_can_staff_session_context(text)') IS NOT NULL AS staff_reader,
        to_regclass('public.sites') IS NOT NULL AS sites,
        to_regclass('public.organizations') IS NOT NULL AS organizations,
        to_regclass('public.people') IS NOT NULL AS people,
        to_regclass('public.account_person_grants') IS NOT NULL AS access_grants,
        to_regclass('public.access_sessions') IS NOT NULL AS access_sessions,
        (SELECT bool_and(relrowsecurity AND relforcerowsecurity)
         FROM pg_class WHERE oid IN ('public.people'::regclass,
          'public.sites'::regclass,'public.organizations'::regclass)) AS public_rls
    `)).rows;
  if(project_id!=="sweet-hall-62441909"||
    branch_id!=="br-restless-sea-ar9ooo55"||database_name!=="neondb")
    throw new Error("Refusing Neon branch other than CAN OS main");
  const checks={staff_reader,sites,organizations,people,access_grants,access_sessions,public_rls};
  const missing=Object.entries(checks).filter(([,present])=>!present).map(([key])=>key);
  const [{projection}]=(await client.query(`
    SELECT pg_get_functiondef('education_v30.v301_can_staff_session_context(text)'::regprocedure)
      AS projection
  `)).rows;
  if(!projection.includes("source.can_grant_id")||
    projection.includes("access_account_canonical_principals")||
    projection.includes("canonical_account_grants"))
    missing.push("native_staff_correspondence_not_retired");
  if(missing.length){
    await client.query("ROLLBACK");
    console.error("BLOCKED: canonical Site-staff reader or core security is incomplete: "+
      missing.join(", "));
    process.exitCode=1;
  }else{
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
        (SELECT count(*)::int FROM public.account_person_grants public_grant
          JOIN public.access_accounts a ON a.id=public_grant.account_id
          JOIN public.people can_person ON can_person.id=public_grant.person_id
          JOIN public.sites site ON site.id=public_grant.site_id
            AND site.organization_id=public_grant.organization_id
          JOIN public.organizations org ON org.id=public_grant.organization_id
          WHERE public_grant.active AND public_grant.role IN ('site_admin','registrar')
            AND public_grant.site_id IS NOT NULL AND a.person_id=public_grant.person_id
            AND can_person.active AND NOT a.disabled AND a.email_verified_at IS NOT NULL
            AND a.email_normalized NOT LIKE '%.demo'
            AND site.lifecycle_status IN ('planning','active')
            AND org.lifecycle_status='active'
            AND NOT EXISTS (
              SELECT 1 FROM public.account_person_grants conflicting
              WHERE conflicting.account_id=a.id AND conflicting.active
                AND conflicting.person_id<>a.person_id)
        ) AS verified_can_staff_grants,
        (SELECT count(*)::int FROM public.access_sessions s
          JOIN public.access_accounts a ON a.id=s.account_id
          JOIN public.account_person_grants public_grant
            ON public_grant.id=s.active_grant_id AND public_grant.account_id=a.id
          JOIN public.people can_person ON can_person.id=public_grant.person_id
          JOIN public.sites site ON site.id=public_grant.site_id
            AND site.organization_id=public_grant.organization_id
          JOIN public.organizations org ON org.id=public_grant.organization_id
          WHERE s.revoked_at IS NULL AND s.expires_at>now()
            AND s.updated_at>now()-interval '30 minutes'
            AND (NOT s.shared_device OR s.last_activity_at>now()-interval '5 minutes')
            AND public_grant.active AND public_grant.role IN ('site_admin','registrar')
            AND public_grant.site_id IS NOT NULL AND a.person_id=public_grant.person_id
            AND can_person.active AND NOT a.disabled AND a.email_verified_at IS NOT NULL
            AND a.email_normalized NOT LIKE '%.demo'
            AND site.lifecycle_status IN ('planning','active')
            AND org.lifecycle_status='active'
            AND NOT EXISTS (
              SELECT 1 FROM public.account_person_grants conflicting
              WHERE conflicting.account_id=a.id AND conflicting.active
                AND conflicting.person_id<>a.person_id)
        ) AS eligible_staff_paths
    `)).rows;
    await client.query("ROLLBACK");
    // Mirrors the installed restricted CAN staff-session reader's current identity gates.
    // Canonical identity links and duplicate native grants are never required.
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
      console.error("BLOCKED: no currently eligible non-demo CAN staff session with an exact Site grant.");
      console.error("Do not manufacture a session or staff grant for acceptance.");
      process.exitCode = 1;
    } else {
      console.log("PASS: at least one verified CAN staff session has an exact public Person and Site grant.");
      console.log("NEXT: verify restricted login permissions and same-session Blueprint browser acceptance.");
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
