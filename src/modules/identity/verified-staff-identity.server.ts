import { inArray, sql } from "drizzle-orm";
import { accessAccounts, accountPersonGrants, demoSchoolTenants, domainEvents, sites } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { demoCredentialScopePredicate } from "./demo-school-tenants.server";
import { privateAccountRoleEligible } from "@/domain/private-account-authority";
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";

/** Identity readiness is not professional qualification or mailbox ownership.
 * Shared demo credentials require a current canonical staff grant and
 * approved synthetic scope, not a fixture-specific role or Person ID. */
export function verifiedStaffIdentityPredicate() {
  const grant = accountPersonGrants;
  const account = accessAccounts;
  const privateRoles = ["site_admin", ...localStaffInviteRoles].filter(privateAccountRoleEligible);
  return sql<boolean>`(
    (
      ${account.privateAccessCodeHash} is not null
      and ${account.disabled} = false
      and ${account.emailNormalized} like '%.demo'
      and ${account.personId} = ${grant.personId}
      and ${grant.active} = true
      and ${inArray(grant.role,privateRoles)}
      and ${grant.organizationId} is not null
      and not exists (
        select 1 from public.account_person_grants conflicting
        where conflicting.account_id = ${account.id}
          and conflicting.active = true
          and conflicting.person_id <> ${account.personId}
      )
      and (${grant.siteId} is null or exists (
        select 1 from public.sites scoped_site
        where scoped_site.id = ${grant.siteId}
          and scoped_site.organization_id = ${grant.organizationId}
      ))
    )
    or (${account.privateAccessCodeHash} is null and (
    (${account.emailVerifiedAt} is not null and ${account.emailNormalized} not like '%.demo'
      and not ${inArray(account.id, LOCAL_DEMO_ACCOUNTS.map(identity => identity.accountId))}
      and ${grant.organizationId} is distinct from ${LOCAL_DEMO_ADMIN.organizationId}::uuid
      and not exists (select 1 from ${demoSchoolTenants}
        where ${demoSchoolTenants.adminAccountId} = ${account.id}
          or ${demoSchoolTenants.organizationId} = ${grant.organizationId}))
    or (
      ${account.disabled} = false
      and ${account.personId} = ${grant.personId}
      and ${grant.accountId} = ${account.id}
      and ${grant.active} = true
      and ${inArray(grant.role,["site_admin",...localStaffInviteRoles])}
      and ${demoCredentialScopePredicate(account.emailNormalized,grant.organizationId,grant.siteId)}
      and not exists (
        select 1 from public.account_person_grants conflicting
        where conflicting.account_id = ${account.id}
          and conflicting.active = true
          and conflicting.person_id <> ${account.personId}
      )
    )
    or (
      ${account.emailVerifiedAt} is not null
      and ${account.emailNormalized} not like '%.demo'
      and not ${inArray(account.id, LOCAL_DEMO_ACCOUNTS.map(identity => identity.accountId))}
      and ${grant.active} = true
      and ${inArray(grant.role, [...localStaffInviteRoles])}
      and (
        (${grant.organizationId} = ${LOCAL_DEMO_ADMIN.organizationId}::uuid
          and ${grant.siteId} = ${LOCAL_DEMO_ADMIN.siteId}::uuid)
        or exists (
          select 1 from ${demoSchoolTenants}
          inner join ${sites} on ${sites.id} = ${demoSchoolTenants.siteId}
            and ${sites.organizationId} = ${demoSchoolTenants.organizationId}
          where ${demoSchoolTenants.enabled} = true
            and ${demoSchoolTenants.organizationId} = ${grant.organizationId}
            and ${demoSchoolTenants.siteId} = ${grant.siteId}
        )
      )
      and exists (
        select 1 from ${domainEvents} issued
        where issued.aggregate_type = 'StaffInvitation'
          and issued.event_type = ${EventTypes.StaffInvitationIssued}
          and issued.aggregate_id = ${grant.id}
          and issued.payload->>'invitationMode' = 'verified_email'
          and issued.payload->>'emailNormalized' = ${account.emailNormalized}
          and issued.payload->>'accountId' = ${account.id}::text
          and issued.payload->>'personId' = ${grant.personId}::text
          and issued.payload->>'role' = ${grant.role}
          and issued.payload->>'organizationId' = ${grant.organizationId}::text
          and issued.payload->>'siteId' = ${grant.siteId}::text
          and exists (
            select 1 from ${domainEvents} accepted
            where accepted.aggregate_type = 'StaffInvitation'
              and accepted.event_type = ${EventTypes.StaffInvitationAccepted}
              and accepted.aggregate_id = ${grant.id}
              and accepted.payload->>'accountId' = ${account.id}::text
              and accepted.payload->>'personId' = ${grant.personId}::text
              and accepted.payload->>'role' = ${grant.role}
          )
      )
    )
    ))
  )`;
}
