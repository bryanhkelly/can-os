import { and, eq, sql } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { demoSchoolTenants, domainEvents, sites } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { isDemoSchoolDomain } from "@/domain/school-setup";
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";

type Reader = Pick<Database, "select">;
type StaffGrant = {
  id: string; accountId: string; personId: string; role: string;
  organizationId: string | null; siteId: string | null;
};

/** Immutable invitation evidence binds ordinary staff onboarding to its original demo identity. */
export async function readDemoStaffBindings(accountId: string, reader: Reader = db) {
  const rows = await reader.select({
    grantId: domainEvents.aggregateId, payload: domainEvents.payload,
    domain: demoSchoolTenants.domain, organizationId: demoSchoolTenants.organizationId,
    siteId: demoSchoolTenants.siteId, enabled: demoSchoolTenants.enabled,
    siteOrganizationId: sites.organizationId,
  }).from(domainEvents).innerJoin(demoSchoolTenants,
    sql`${demoSchoolTenants.organizationId}::text = ${domainEvents.payload}->>'organizationId'`)
    .leftJoin(sites, and(eq(sites.id, demoSchoolTenants.siteId),
      eq(sites.organizationId, demoSchoolTenants.organizationId)))
    .where(and(
      eq(domainEvents.aggregateType, "StaffInvitation"),
      eq(domainEvents.eventType, EventTypes.StaffInvitationIssued),
      sql`${domainEvents.payload}->>'accountId' = ${accountId}`,
    ));
  return rows.map(row => ({ ...row, enabled: row.enabled &&
    row.siteOrganizationId === row.organizationId }));
}

export function matchesDemoStaffBinding(
  binding: Awaited<ReturnType<typeof readDemoStaffBindings>>[number],
  grant: StaffGrant,
  email: string,
): boolean {
  const expected = binding.payload;
  if (typeof expected.accountId !== "string" || typeof expected.personId !== "string" ||
    typeof expected.role !== "string") throw new AuthorizationError("valid demo staff invitation evidence");
  return binding.enabled && isDemoSchoolDomain(binding.domain) &&
    email.split("@")[1] === binding.domain && grant.id === binding.grantId &&
    grant.accountId === expected.accountId && grant.personId === expected.personId &&
    grant.role === expected.role && localStaffInviteRoles.some(role => role === grant.role) &&
    grant.organizationId === binding.organizationId && grant.siteId === binding.siteId &&
    expected.siteId === binding.siteId;
}
