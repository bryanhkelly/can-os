import { and, eq, inArray } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import { accessAccounts, accountPersonGrants, demoSchoolTenants, domainEvents, people } from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";
import { EventTypes } from "@/domain/event-types";
import { matchesVerifiedExternalSandboxInvitation } from "@/domain/sandbox-external-invitation";
import { matchesDemoSchoolAdministrator } from "@/domain/school-setup";
import { readDemoSchoolForAccount } from "./demo-school-tenants.server";
import { readDemoStaffBindings, matchesDemoStaffBinding } from "./demo-staff-access.server";
import { AuthorizationError } from "@/domain/command-context";
import {
  isDemoAccountEmail,
  isApprovedDemoGrant,
  LOCAL_DEMO_ACCOUNTS,
  LOCAL_DEMO_ADMIN,
} from "@/domain/local-demo-access";

type GrantReader = Pick<Database, "select">;

const grantSelection = {
  id: accountPersonGrants.id,
  accountId: accountPersonGrants.accountId,
  personId: accountPersonGrants.personId,
  role: accountPersonGrants.role,
  organizationId: accountPersonGrants.organizationId,
  siteId: accountPersonGrants.siteId,
  active: accountPersonGrants.active,
  firstName: people.legalFirstName,
  lastName: people.legalLastName,
  email: accessAccounts.emailNormalized,
  emailVerifiedAt: accessAccounts.emailVerifiedAt,
};

const supportedRoles = Object.keys(roleCapabilities);
const sourceAccounts = LOCAL_DEMO_ACCOUNTS.filter(
  account => account.email !== LOCAL_DEMO_ADMIN.email,
);

async function listActiveAccountGrants(accountId: string, reader: GrantReader) {
  return reader.select(grantSelection).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.accountId, accountId),
      eq(accountPersonGrants.active, true),
      eq(accessAccounts.disabled, false),
      eq(people.active, true),
      inArray(accountPersonGrants.role, supportedRoles),
    ));
}

/** Current, tenant-bound source memberships; no mirrored admin grants are accepted. */
export async function listDemoSourceGrants(database: GrantReader = db) {
  const rows = await database.select(grantSelection).from(accountPersonGrants)
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(
      inArray(accessAccounts.emailNormalized, sourceAccounts.map(account => account.email)),
      eq(accessAccounts.disabled, false),
      eq(people.active, true),
      eq(accountPersonGrants.active, true),
      eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
      eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId),
      inArray(accountPersonGrants.role, supportedRoles),
    ));
  return rows.filter(row =>
    isApprovedDemoGrant(row, row.email),
  );
}

/** Resolve only current account grants or the separately provisioned demo-admin switch list. */
export async function readSessionGrants(accountId: string, email: string, reader: GrantReader = db) {
  const normalizedEmail = email.trim().toLowerCase();
  const demoAccount = isDemoAccountEmail(normalizedEmail) ||
    LOCAL_DEMO_ACCOUNTS.some(account => account.accountId === accountId);
  const adminAccount =
    accountId === LOCAL_DEMO_ADMIN.accountId || normalizedEmail === LOCAL_DEMO_ADMIN.email;
  const ownGrants = (await listActiveAccountGrants(accountId, reader))
    .filter(grant => grant.accountId === accountId);

  const valorAccount = LOCAL_DEMO_ACCOUNTS.some(account => account.accountId === accountId) ||
    normalizedEmail.endsWith("@valorschool.demo");
  if (!valorAccount) {
    const school = await readDemoSchoolForAccount(accountId, reader);
    if (school) {
      const grants = ownGrants.filter(grant => matchesDemoSchoolAdministrator(school, grant, normalizedEmail));
      return { grants, demoAccountSwitching: false, launchSiteId: school.siteId };
    }
    const bindings = await readDemoStaffBindings(accountId, reader);
    if (bindings.length && demoAccount) {
      return { grants: ownGrants.filter(grant =>
        bindings.some(binding => matchesDemoStaffBinding(binding, grant, normalizedEmail))),
      demoAccountSwitching: false };
    }
    if (demoAccount) return { grants: [], demoAccountSwitching: false };
  }

  if (!adminAccount && !demoAccount) {
    // Real testers use normal verified-email sign-in. A synthetic grant
    // additionally needs an issued-and-accepted original Site invitation.
    const organizationIds = [...new Set(ownGrants.map(grant => grant.organizationId)
      .filter((id): id is string => Boolean(id)))];
    const schools = organizationIds.length ? await reader.select({
      organizationId: demoSchoolTenants.organizationId,
      siteId: demoSchoolTenants.siteId,
      enabled: demoSchoolTenants.enabled,
    }).from(demoSchoolTenants).where(inArray(demoSchoolTenants.organizationId, organizationIds)) : [];
    const byOrg = new Map(schools.map(school => [school.organizationId, school]));
    const syntheticGrants = ownGrants.filter(grant =>
      grant.organizationId === LOCAL_DEMO_ADMIN.organizationId ||
      byOrg.has(grant.organizationId ?? ""));
    const evidence = syntheticGrants.length ? await reader.select({
      grantId: domainEvents.aggregateId,
      eventType: domainEvents.eventType,
      payload: domainEvents.payload,
    }).from(domainEvents).where(and(
      eq(domainEvents.aggregateType, "StaffInvitation"),
      inArray(domainEvents.aggregateId, syntheticGrants.map(grant => grant.id)),
      inArray(domainEvents.eventType, [
        EventTypes.StaffInvitationIssued, EventTypes.StaffInvitationAccepted,
      ]),
    )) : [];
    const issued = new Map(evidence.filter(row => row.eventType === EventTypes.StaffInvitationIssued)
      .map(row => [row.grantId, row]));
    const accepted = new Map(evidence.filter(row => row.eventType === EventTypes.StaffInvitationAccepted)
      .map(row => [row.grantId, row]));
    const grants = ownGrants.filter(grant => {
      const valor = grant.organizationId === LOCAL_DEMO_ADMIN.organizationId;
      const registered = byOrg.get(grant.organizationId ?? "");
      if (!valor && !registered) return true;
      if (valor ? grant.siteId !== LOCAL_DEMO_ADMIN.siteId :
        !registered?.enabled || registered.siteId !== grant.siteId) return false;
      return matchesVerifiedExternalSandboxInvitation(
        grant, issued.get(grant.id), accepted.get(grant.id), normalizedEmail);
    });
    return { grants, demoAccountSwitching: false };
  }

  if (adminAccount) {
    if (accountId !== LOCAL_DEMO_ADMIN.accountId || normalizedEmail !== LOCAL_DEMO_ADMIN.email) {
      throw new AuthorizationError("active demo administrator membership");
    }
    const adminGrant = ownGrants.find(grant =>
      grant.id === LOCAL_DEMO_ADMIN.grantId &&
      isApprovedDemoGrant(grant, normalizedEmail),
    );
    if (!adminGrant) throw new AuthorizationError("active demo administrator membership");
    const grants = await listDemoSourceGrants(reader);
    return {
      grants: [adminGrant, ...grants],
      demoAccountSwitching: true,
      launchSiteId: LOCAL_DEMO_ADMIN.siteId,
    };
  }

  const grants = ownGrants.filter(grant =>
    isApprovedDemoGrant(grant, normalizedEmail),
  );
  return { grants, demoAccountSwitching: false };
}
