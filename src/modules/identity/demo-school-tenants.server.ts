import { and, eq, isNotNull, sql, type SQLWrapper } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { accessAccountSignups, demoSchoolTenants, organizations, sites } from "@/db/schema";
import { DEMO_ACCOUNT_DOMAIN, LOCAL_DEMO_ADMIN, isDemoAccountEmail } from "@/domain/local-demo-access";

import { isDemoDomain } from "@/domain/domain-classification";

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

/** Classification follows the owning Organization domain, not credential registration. */
export async function isDemoTenantOrganization(organizationId: string | null, reader: Reader = db): Promise<boolean> {
  if (!organizationId) return false;
  const [organization] = await reader.select({ domain: organizations.domain })
    .from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return isDemoDomain(organization?.domain);
}

/** Identity-layer boundary for shared-code credentials. Does not grant a role or
 * change an operational rule. An exact current Site grant is still required. */
export async function matchesDemoCredentialScope(
  email: string, organizationId: string | null, siteId: string | null,
  reader: Reader = db,
): Promise<boolean> {
  if (!isDemoAccountEmail(email) || !organizationId || !siteId) return false;
  const binding=await readDemoCredentialDomain(email,reader);
  return binding?.organizationId===organizationId && binding?.siteId===siteId;
}

/** Transaction-side equivalent of credential scope. Inputs are trusted
 * column expressions; never interpolate user-supplied SQL identifiers. */
export function demoCredentialScopePredicate(
  email: SQLWrapper, organizationId: SQLWrapper, siteId: SQLWrapper,
) {
  return sql<boolean>`(
    ${email} ~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*[.]demo$'
    AND ${organizationId} IS NOT NULL AND ${siteId} IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.sites credential_site
      JOIN public.organizations credential_org ON credential_org.id=credential_site.organization_id
      WHERE credential_site.id=${siteId} AND credential_site.organization_id=${organizationId}
        AND credential_org.domain=split_part(${email},'@',2))
    AND (
      (split_part(${email},'@',2)=${DEMO_ACCOUNT_DOMAIN}
        AND ${organizationId}=${LOCAL_DEMO_ADMIN.organizationId}::uuid
        AND ${siteId}=${LOCAL_DEMO_ADMIN.siteId}::uuid
        AND NOT EXISTS (SELECT 1 FROM public.demo_school_tenants registered
          WHERE registered.domain=${DEMO_ACCOUNT_DOMAIN} OR registered.organization_id=${organizationId}))
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
  // Registered bindings take precedence, including disabled registrations.
  const [binding]=await reader.select({organizationId:demoSchoolTenants.organizationId,
    siteId:demoSchoolTenants.siteId,enabled:demoSchoolTenants.enabled,
    ownerDomain:organizations.domain,siteOrganizationId:sites.organizationId})
    .from(demoSchoolTenants)
    .leftJoin(sites,eq(sites.id,demoSchoolTenants.siteId))
    .leftJoin(organizations,eq(organizations.id,demoSchoolTenants.organizationId))
    .where(eq(demoSchoolTenants.domain,domain)).limit(1);
  if(binding)return binding.enabled && binding.ownerDomain===domain &&
    binding.siteOrganizationId===binding.organizationId
    ? {organizationId:binding.organizationId,siteId:binding.siteId}:null;
  // Compatibility for the original seeded fixture until its registry is migrated.
  if(domain===DEMO_ACCOUNT_DOMAIN){
    const [site]=await reader.select({organizationId:sites.organizationId,siteId:sites.id})
      .from(sites).innerJoin(organizations,eq(organizations.id,sites.organizationId))
      .where(and(eq(sites.id,LOCAL_DEMO_ADMIN.siteId),
        eq(sites.organizationId,LOCAL_DEMO_ADMIN.organizationId),eq(organizations.domain,domain),
        sql`NOT EXISTS (SELECT 1 FROM public.demo_school_tenants registered
          WHERE registered.organization_id=${sites.organizationId})`)).limit(1);
    return site??null;
  }
  return null;
}

export async function hasApprovedDemoPersonalCredential(accountId:string,email:string,reader:Reader=db) {
  if (!await readDemoCredentialDomain(email,reader)) return false;
  const [signup]=await reader.select({accountId:accessAccountSignups.accountId}).from(accessAccountSignups)
    .where(and(eq(accessAccountSignups.accountId,accountId),isNotNull(accessAccountSignups.consumedAt))).limit(1);
  return Boolean(signup);
}

/** Existing shared-code invitation policy. A disabled historical registration
 * also blocks the fixed fixture, even when its original binding predates the
 * registry. Ordinary verified and individual credential invitations do not
 * depend on this compatibility service. */
export async function matchesLegacyStaffInvitationScope(
  email:string, organizationId:string, siteId:string, reader:Reader=db,
):Promise<boolean>{
  const [binding]=await reader.select({enabled:demoSchoolTenants.enabled})
    .from(demoSchoolTenants).where(eq(demoSchoolTenants.organizationId,organizationId)).limit(1);
  return (!binding||binding.enabled) && await matchesDemoCredentialScope(email,organizationId,siteId,reader);
}
