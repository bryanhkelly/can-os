import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { DEMO_ACCOUNT_DOMAIN, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";

export type AccountHealthRow = {
  kind:"real"|"demo";
  accounts:number; disabled:number; activeGrants:number;
  missingActivePerson:number; personMismatches:number; scopeMismatches:number;
  noActiveGrants:number; unverifiedActiveReal:number; invalidDemoScopes:number;
};
export type AccountHealth = {status:"available"|"unavailable";checkedAt:string;rows:AccountHealthRow[]};

/** Read-only, aggregate diagnostics. The caller must authorize the independent
 * platform administration grant. No personal details or automatic grants. */
export async function readAccountHealth():Promise<AccountHealth>{
  const checkedAt=new Date().toISOString();
  try {
    const result=await db.execute(sql`
      WITH inventory AS (
        SELECT a.id,a.person_id,a.disabled,a.email_verified_at,
          a.email_normalized LIKE '%.demo' AS demo,
          p.active AS person_active,
          count(g.id) FILTER(WHERE g.active)::int AS active_grants,
          count(g.id) FILTER(WHERE g.active AND a.person_id IS DISTINCT FROM g.person_id)::int AS person_mismatches,
          count(g.id) FILTER(WHERE g.active AND (
            (g.site_id IS NOT NULL AND s.organization_id IS DISTINCT FROM g.organization_id)
            OR (g.role IN ('account_holder','app_admin','platform_owner') AND
              (g.organization_id IS NOT NULL OR g.site_id IS NOT NULL))
            OR (g.role NOT IN ('account_holder','app_admin','platform_owner') AND g.organization_id IS NULL)
          ))::int AS scope_mismatches,
          count(g.id) FILTER(WHERE g.active AND a.email_normalized LIKE '%.demo' AND NOT (
            a.email_normalized ~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?[.]demo$'
            AND (
              (g.role='account_holder' AND g.organization_id IS NULL AND g.site_id IS NULL
                AND EXISTS(SELECT 1 FROM public.access_account_signups signup
                  WHERE signup.account_id=a.id AND signup.consumed_at IS NOT NULL)
                AND (split_part(a.email_normalized,'@',2)=${DEMO_ACCOUNT_DOMAIN}
                  OR EXISTS(SELECT 1 FROM public.demo_school_tenants d
                    JOIN public.sites ds ON ds.id=d.site_id AND ds.organization_id=d.organization_id
                    WHERE d.enabled AND d.domain=split_part(a.email_normalized,'@',2))))
              OR (g.organization_id IS NOT NULL AND g.site_id IS NOT NULL
                AND s.organization_id=g.organization_id AND (
                  (split_part(a.email_normalized,'@',2)=${DEMO_ACCOUNT_DOMAIN}
                    AND g.organization_id=${LOCAL_DEMO_ADMIN.organizationId}::uuid
                    AND g.site_id=${LOCAL_DEMO_ADMIN.siteId}::uuid)
                  OR EXISTS(SELECT 1 FROM public.demo_school_tenants d
                    WHERE d.enabled AND d.domain=split_part(a.email_normalized,'@',2)
                      AND d.organization_id=g.organization_id AND d.site_id=g.site_id)))
            )
          ))::int AS invalid_demo_scopes
        FROM public.access_accounts a LEFT JOIN public.people p ON p.id=a.person_id
        LEFT JOIN public.account_person_grants g ON g.account_id=a.id
        LEFT JOIN public.sites s ON s.id=g.site_id
        GROUP BY a.id,p.active
      )
      SELECT CASE WHEN demo THEN 'demo' ELSE 'real' END AS kind,count(*)::int AS accounts,
        count(*) FILTER(WHERE disabled)::int AS disabled,
        coalesce(sum(active_grants),0)::int AS active_grants,
        count(*) FILTER(WHERE NOT disabled AND active_grants>0 AND
          (person_id IS NULL OR person_active IS DISTINCT FROM true))::int AS missing_active_person,
        coalesce(sum(person_mismatches),0)::int AS person_mismatches,
        coalesce(sum(scope_mismatches),0)::int AS scope_mismatches,
        count(*) FILTER(WHERE NOT disabled AND active_grants=0)::int AS no_active_grants,
        count(*) FILTER(WHERE NOT disabled AND NOT demo AND active_grants>0 AND email_verified_at IS NULL)::int AS unverified_active_real,
        coalesce(sum(invalid_demo_scopes),0)::int AS invalid_demo_scopes
      FROM inventory GROUP BY demo ORDER BY demo
    `);
    return {status:"available",checkedAt,rows:result.rows.map(r=>({
      kind:r.kind==="demo"?"demo":"real",accounts:Number(r.accounts),disabled:Number(r.disabled),
      activeGrants:Number(r.active_grants),missingActivePerson:Number(r.missing_active_person),
      personMismatches:Number(r.person_mismatches),scopeMismatches:Number(r.scope_mismatches),
      noActiveGrants:Number(r.no_active_grants),unverifiedActiveReal:Number(r.unverified_active_real),
      invalidDemoScopes:Number(r.invalid_demo_scopes),
    }))};
  } catch {
    return {status:"unavailable",checkedAt,rows:[]};
  }
}
