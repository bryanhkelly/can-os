import { and, eq, inArray, isNotNull, like, or } from "drizzle-orm";
import { db, type Database } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, demoSchoolTenants, domainEvents,
  people, programs, publicFamilyStartRequests,
} from "@/db/schema";
import { roleCapabilities } from "@/domain/access-context";
import { hasValidAccessGrantScope } from "@/domain/access-grant-scope";
import { EventTypes } from "@/domain/event-types";
import { matchesVerifiedExternalSandboxInvitation } from "@/domain/sandbox-external-invitation";
import { matchesDemoSchoolAdministrator } from "@/domain/school-setup";
import { hasApprovedDemoPersonalCredential, matchesDemoCredentialScope, readDemoSchoolForAccount } from "./demo-school-tenants.server";
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
  accountPersonId: accessAccounts.personId,
};

const supportedRoles = Object.keys(roleCapabilities);
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

async function listPublicFamilyStartGrantIds(
  email: string,
  grants: Awaited<ReturnType<typeof listActiveAccountGrants>>,
  reader: GrantReader,
): Promise<Set<string>> {
  const candidates = grants.filter(grant =>
    grant.role === "guardian" && grant.organizationId && grant.siteId);
  if (!candidates.length) return new Set();
  const rows = await reader.select({
    programId: publicFamilyStartRequests.programId,
    siteId: publicFamilyStartRequests.siteId,
    programOrganizationId: programs.organizationId,
    actorPersonId: domainEvents.actorPersonId,
  }).from(publicFamilyStartRequests)
    .innerJoin(programs, and(
      eq(programs.id, publicFamilyStartRequests.programId),
      eq(programs.siteId, publicFamilyStartRequests.siteId),
    ))
    .innerJoin(domainEvents, and(
      eq(domainEvents.aggregateType, "public_family_start_request"),
      eq(domainEvents.aggregateId, publicFamilyStartRequests.id),
      eq(domainEvents.eventType, EventTypes.PublicFamilyStartVerified),
    ))
    .where(and(
      eq(publicFamilyStartRequests.emailNormalized, email),
      isNotNull(publicFamilyStartRequests.consumedAt),
      inArray(publicFamilyStartRequests.siteId, candidates.map(grant => grant.siteId!)),
      inArray(programs.organizationId, candidates.map(grant => grant.organizationId!)),
    ));
  const allowed = new Set<string>();
  for (const grant of candidates) {
    if (rows.some(row => row.actorPersonId === grant.personId &&
      row.siteId === grant.siteId &&
      row.programOrganizationId === grant.organizationId)) {
      allowed.add(grant.id);
    }
  }
  return allowed;
}

/** Demo Admin may switch to any existing active Person/grant at the exact
 * demo Site, not just people on a hardcoded fixture allowlist.
 * This is LOGIN/SWITCH code ONLY. It never provisions or overrides a
 * Person's role, Site scope, independent approvals, or Class enrollment.
 * A demo-code account does not require verified mailbox ownership, but its
 * Person, tenant and active grant must still match. Real accounts still
 * require verified email; disabled accounts remain excluded.
 */
export async function listDemoSourceGrants(database: GrantReader = db) {
  const rows = await database.select(grantSelection).from(accountPersonGrants)
    .innerJoin(accessAccounts, and(
      eq(accessAccounts.id, accountPersonGrants.accountId),
      eq(accessAccounts.personId, accountPersonGrants.personId),
      eq(accessAccounts.disabled, false),
      // The original Valor tenant is an explicitly scoped synthetic fixture.
      // Do not silently treat an arbitrary *.demo email as verified.
      or(isNotNull(accessAccounts.emailVerifiedAt),
        like(accessAccounts.emailNormalized, "%@valorschool.demo")),
    ))
    .innerJoin(people, and(
      eq(people.id, accountPersonGrants.personId),
      eq(people.active, true),
    ))
    .where(and(
      eq(accountPersonGrants.active, true),
      eq(accountPersonGrants.organizationId, LOCAL_DEMO_ADMIN.organizationId),
      eq(accountPersonGrants.siteId, LOCAL_DEMO_ADMIN.siteId),
      inArray(accountPersonGrants.role, supportedRoles),
    ));
  return rows.filter(row =>
    row.accountId !== LOCAL_DEMO_ADMIN.accountId &&
    row.personId !== LOCAL_DEMO_ADMIN.personId &&
    hasValidAccessGrantScope(row));
}

/** Resolve only current account grants or the separately provisioned demo-admin switch list. */
export async function readSessionGrants(accountId: string, email: string, reader: GrantReader = db) {
  const normalizedEmail = email.trim().toLowerCase();
  const demoAccount = isDemoAccountEmail(normalizedEmail) ||
    LOCAL_DEMO_ACCOUNTS.some(account => account.accountId === accountId);
  const adminAccount =
    accountId === LOCAL_DEMO_ADMIN.accountId || normalizedEmail === LOCAL_DEMO_ADMIN.email;
  const ownGrants = (await listActiveAccountGrants(accountId, reader))
    .filter(grant => grant.accountId === accountId && hasValidAccessGrantScope(grant));

  if (demoAccount && !adminAccount) {
    // All non-switching credentials use the same current Person and active
    // grants. Credential approval limits the reachable institution, not
    // the permitted business capabilities of a valid role.
    const school = await readDemoSchoolForAccount(accountId, reader);
    const bindings = await readDemoStaffBindings(accountId, reader);
    const fixedIdentity = LOCAL_DEMO_ACCOUNTS.find(candidate=>candidate.accountId===accountId ||
      candidate.email===normalizedEmail);
    if (fixedIdentity && (fixedIdentity.accountId!==accountId || fixedIdentity.email!==normalizedEmail))
      return {grants:[],demoAccountSwitching:false};
    const grants:typeof ownGrants=[];
    for (const grant of ownGrants) {
      if (grant.email!==normalizedEmail || grant.accountPersonId!==grant.personId) continue;
      if (fixedIdentity) {
        if (isApprovedDemoGrant(grant,normalizedEmail)) grants.push(grant);
        continue;
      }
      if (grant.role==="account_holder" && !grant.organizationId && !grant.siteId) {
        if (await hasApprovedDemoPersonalCredential(accountId,normalizedEmail,reader)) grants.push(grant);
        continue;
      }
      if (!await matchesDemoCredentialScope(normalizedEmail,grant.organizationId,grant.siteId,reader)) continue;
      // Privileged roles are never acquired from a shared personal credential.
      if (grant.role==="guardian" || grant.role==="student" ||
          (school && matchesDemoSchoolAdministrator(school,grant,normalizedEmail)) ||
          bindings.some(binding=>matchesDemoStaffBinding(binding,grant,normalizedEmail)) ||
          (normalizedEmail.endsWith("@valorschool.demo") && grant.role!=="platform_owner" && grant.role!=="app_admin"))
        grants.push(grant);
    }
    return {grants,demoAccountSwitching:false,...(school&&grants.some(g=>g.id===school.adminGrantId)?{launchSiteId:school.siteId}:{})};
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
    const publicFamilyGrantIds = await listPublicFamilyStartGrantIds(
      normalizedEmail, syntheticGrants, reader,
    );
    const grants = ownGrants.filter(grant => {
      const valor = grant.organizationId === LOCAL_DEMO_ADMIN.organizationId;
      const registered = byOrg.get(grant.organizationId ?? "");
      if (!valor && !registered) return true;
      if (valor ? grant.siteId !== LOCAL_DEMO_ADMIN.siteId :
        !registered?.enabled || registered.siteId !== grant.siteId) return false;
      return publicFamilyGrantIds.has(grant.id) || matchesVerifiedExternalSandboxInvitation(
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

  return {grants:[],demoAccountSwitching:false};
}
