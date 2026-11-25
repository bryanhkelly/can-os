import { and, eq, isNotNull, sql, type SQLWrapper } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { accessAccountSignups, demoSchoolTenants, sites } from "@/db/schema";
import { DEMO_ACCOUNT_DOMAIN, LOCAL_DEMO_ADMIN, isDemoAccountEmail, isDemoTenantOrganization as isValorOrganization } from "@/domain/local-demo-access";

type Reader = Pick<Database, "select">;

export async function readDemoSchoolForAccount(accountId: string, reader: Reader = db) {
  const [school] = await reader.select({
    domain: demoSchoolTenants.domain,
    organizationId: demoSchoolTenants.organizationId,
    siteId: demoSchoolTenants.siteId,
    adminAccountId: demoSchoolTenants.adminAccountId,
    adminPersonId: demoSchoolTenants.adminPersonId,
    adminGrantId: demoSchoolTenants.adminGrantId,
    enabled: demoSchoolTenants.enabled,
    siteOrganizationId: sites.organizationId,
  }).from(demoSchoolTenants)
    .leftJoin(sites, and(eq(sites.id, demoSchoolTenants.siteId),
      eq(sites.organizationId, demoSchoolTenants.organizationId)))
    .where(eq(demoSchoolTenants.adminAccountId, accountId)).limit(1);
  return school && { ...school, enabled: school.enabled &&
    school.siteOrganizationId === school.organizationId };
}

/** Classification survives tenant disablement so external delivery stays blocked. */
export async function isDemoTenantOrganization(organizationId: string | null, reader: Reader = db): Promise<boolean> {
  if (!organizationId) return false;
  if (isValorOrganization(organizationId)) return true;
  const [school] = await reader.select({ domain: demoSchoolTenants.domain })
    .from(demoSchoolTenants).where(eq(demoSchoolTenants.organizationId, organizationId)).limit(1);
  return Boolean(school);
}

/** Identity-layer boundary for shared-code credentials. Does not grant a role or
 * change an operational rule. An exact current Site grant is still required. */
export async function matchesDemoCredentialScope(
  email: string, organizationId: string | null, siteId: string | null,
  reader: Reader = db,
): Promise<boolean> {
  if (!isDemoAccountEmail(email) || !organizationId || !siteId) return false;
  const domain = email.trim().toLowerCase().split("@")[1]!;
  if (domain === DEMO_ACCOUNT_DOMAIN) return organizationId === LOCAL_DEMO_ADMIN.organizationId &&
    siteId === LOCAL_DEMO_ADMIN.siteId;
  const [binding] = await reader.select({domain:demoSchoolTenants.domain})
    .from(demoSchoolTenants)
    .innerJoin(sites, and(eq(sites.id,demoSchoolTenants.siteId),
      eq(sites.organizationId,demoSchoolTenants.organizationId)))
    .where(and(eq(demoSchoolTenants.domain,domain),
      eq(demoSchoolTenants.organizationId,organizationId),
      eq(demoSchoolTenants.siteId,siteId),eq(demoSchoolTenants.enabled,true))).limit(1);
  return Boolean(binding);
}

/** Transaction-side equivalent of credential scope. Inputs are trusted
 * column expressions; never interpolate user-supplied SQL identifiers. */
export function demoCredentialScopePredicate(
  email: SQLWrapper, organizationId: SQLWrapper, siteId: SQLWrapper,
) {
  return sql<boolean>`(
    ${email} ~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?\\.demo$'
    AND ${organizationId} IS NOT NULL AND ${siteId} IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.sites credential_site
      WHERE credential_site.id=${siteId} AND credential_site.organization_id=${organizationId})
    AND (
      (split_part(${email},'@',2)=${DEMO_ACCOUNT_DOMAIN}
        AND ${organizationId}=${LOCAL_DEMO_ADMIN.organizationId}::uuid
        AND ${siteId}=${LOCAL_DEMO_ADMIN.siteId}::uuid)
      OR EXISTS (SELECT 1 FROM public.demo_school_tenants credential_tenant
        WHERE credential_tenant.enabled
          AND credential_tenant.domain=split_part(${email},'@',2)
          AND credential_tenant.organization_id=${organizationId}
          AND credential_tenant.site_id=${siteId})
    )
  )`;
}

/** Account-only demo approval is tied to a current registered credential
 * domain. It does not create any Site, network or program membership. */
export async function readDemoCredentialDomain(email:string, reader:Reader=db) {
  if (!isDemoAccountEmail(email)) return null;
  const domain=email.trim().toLowerCase().split("@")[1]!;
  if (domain===DEMO_ACCOUNT_DOMAIN) {
    const [site]=await reader.select({organizationId:sites.organizationId,siteId:sites.id})
      .from(sites).where(and(eq(sites.id,LOCAL_DEMO_ADMIN.siteId),
        eq(sites.organizationId,LOCAL_DEMO_ADMIN.organizationId))).limit(1);
    return site??null;
  }
  const [binding]=await reader.select({organizationId:demoSchoolTenants.organizationId,siteId:demoSchoolTenants.siteId})
    .from(demoSchoolTenants).innerJoin(sites,and(eq(sites.id,demoSchoolTenants.siteId),
      eq(sites.organizationId,demoSchoolTenants.organizationId)))
    .where(and(eq(demoSchoolTenants.domain,domain),eq(demoSchoolTenants.enabled,true))).limit(1);
  return binding??null;
}

export async function hasApprovedDemoPersonalCredential(accountId:string,email:string,reader:Reader=db) {
  if (!await readDemoCredentialDomain(email,reader)) return false;
  const [signup]=await reader.select({id:accessAccountSignups.id}).from(accessAccountSignups)
    .where(and(eq(accessAccountSignups.accountId,accountId),isNotNull(accessAccountSignups.consumedAt))).limit(1);
  return Boolean(signup);
}
