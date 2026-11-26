import { and, eq, inArray, isNotNull, isNull, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, demoSchoolTenants, domainEvents,
  people, programs, publicFamilyStartRequests,
} from "@/db/schema";
import { isEligiblePrivilegedMailbox } from "@/domain/domain-classification";
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
  DEMO_ACCOUNT_DOMAIN,
} from "@/domain/local-demo-access";

import { grantSelection, supportedRoles, type GrantReader, type AccountGrant } from "./account-grant-reader.server";

/** Compatibility boundary for existing public shared credentials.
 * Do not add operational permissions here. Remove when verified credential
 * handoff and retirement acceptance are complete. */
async function listPublicFamilyStartGrantIds(
  email: string,
  grants: AccountGrant[],
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

/** Public shared-code switching is limited to demo identities at the exact fixture Site.
 * Real accounts use their own credentials or independently verified owner delegation.
 * This cannot grant roles, alter memberships, or attest mailbox ownership.
 */
export async function listDemoSourceGrants(database: GrantReader = db) {
  const rows = await database.select(grantSelection).from(accountPersonGrants)
    .innerJoin(accessAccounts, and(
      eq(accessAccounts.id, accountPersonGrants.accountId),
      eq(accessAccounts.personId, accountPersonGrants.personId),
      eq(accessAccounts.disabled, false),
      like(accessAccounts.emailNormalized, "%@"+DEMO_ACCOUNT_DOMAIN),
      isNull(accessAccounts.privateAccessCodeHash),
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
    row.accountPersonId === row.personId && row.active && !row.privateCredential &&
    row.email.endsWith("@"+DEMO_ACCOUNT_DOMAIN) && isDemoAccountEmail(row.email) &&
    row.role !== "platform_owner" && row.role !== "app_admin" &&
    hasValidAccessGrantScope(row));
}

export async function readLegacyCredentialGrants(
  accountId: string, normalizedEmail: string, ownGrants: AccountGrant[], reader: GrantReader,
) {
  const demoAccount = isDemoAccountEmail(normalizedEmail) ||
    LOCAL_DEMO_ACCOUNTS.some(account => account.accountId === accountId);
  const adminAccount = accountId === LOCAL_DEMO_ADMIN.accountId || normalizedEmail === LOCAL_DEMO_ADMIN.email;
  // A private account must never fall back to the legacy credential reader.
  if (ownGrants.some(grant=>grant.privateCredential)) return {grants:[],demoAccountSwitching:false};
  if (demoAccount && !adminAccount) {
    // All non-switching credentials use the same current Person and active
    // grants. Credential approval limits the reachable institution, not
    // the permitted business capabilities of a valid role.
    const fixedIdentity = LOCAL_DEMO_ACCOUNTS.find(candidate=>candidate.accountId===accountId ||
      candidate.email===normalizedEmail);
    if (fixedIdentity && (fixedIdentity.accountId!==accountId || fixedIdentity.email!==normalizedEmail))
      return {grants:[],demoAccountSwitching:false};
    if (fixedIdentity) return {grants:ownGrants.filter(grant=>grant.email===normalizedEmail &&
      grant.accountPersonId===grant.personId && isApprovedDemoGrant(grant,normalizedEmail)),demoAccountSwitching:false};
    const school = await readDemoSchoolForAccount(accountId, reader);
    const bindings = await readDemoStaffBindings(accountId, reader);
    const grants:typeof ownGrants=[];
    for (const grant of ownGrants) {
      if (grant.email!==normalizedEmail || grant.accountPersonId!==grant.personId) continue;
      if (grant.role==="account_holder" && !grant.organizationId && !grant.siteId) {
        if (await hasApprovedDemoPersonalCredential(accountId,normalizedEmail,reader)) grants.push(grant);
        continue;
      }
      if (!await matchesDemoCredentialScope(normalizedEmail,grant.organizationId,grant.siteId,reader)) continue;
      // Privileged roles are never acquired from a shared personal credential.
      if (grant.role==="guardian" || grant.role==="student" ||
          (school && matchesDemoSchoolAdministrator(school,grant,normalizedEmail)) ||
          bindings.some(binding=>matchesDemoStaffBinding(binding,grant,normalizedEmail)) ||
          (normalizedEmail.endsWith("@"+DEMO_ACCOUNT_DOMAIN) && grant.role!=="platform_owner" && grant.role!=="app_admin"))
        grants.push(grant);
    }
    return {grants,demoAccountSwitching:false,...(school&&grants.some(g=>g.id===school.adminGrantId)?{launchSiteId:school.siteId}:{})};
  }

  if (!adminAccount && !demoAccount) {
    // An explicitly registered founder cannot bypass its credential boundary
    // by changing the account email to a deliverable address.
    const founder=await readDemoSchoolForAccount(accountId,reader);
    if(founder)return {grants:[],demoAccountSwitching:false};
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
      if (grant.role === "platform_owner" && !isEligiblePrivilegedMailbox(normalizedEmail)) return false;
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

