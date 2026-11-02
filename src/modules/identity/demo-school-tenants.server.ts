import { and, eq } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { demoSchoolTenants, sites } from "@/db/schema";
import { isDemoTenantOrganization as isValorOrganization } from "@/domain/local-demo-access";

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
