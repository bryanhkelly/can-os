import { inArray, sql } from "drizzle-orm";
import { accessAccounts, accountPersonGrants, demoSchoolTenants, domainEvents, sites } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN } from "@/domain/local-demo-access";
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";

/** Shared demo acceptance is an identity binding, never proof of email ownership. */
export function verifiedStaffIdentityPredicate() {
  const grant = accountPersonGrants;
  const account = accessAccounts;
  const valor = sql.join(LOCAL_DEMO_ACCOUNTS.map(identity => sql`(
    ${account.id} = ${identity.accountId}::uuid
    and ${account.emailNormalized} = ${identity.email}
    and ${grant.personId} = ${identity.personId}::uuid
    and ${grant.role} = ${identity.email === LOCAL_DEMO_ADMIN.email ? "site_admin" : identity.role.toLowerCase()}
  )`), sql` or `);
  return sql<boolean>`(
    (${account.emailVerifiedAt} is not null and ${account.emailNormalized} not like '%.demo'
      and not ${inArray(account.id, LOCAL_DEMO_ACCOUNTS.map(identity => identity.accountId))}
      and not exists (select 1 from ${demoSchoolTenants}
        where ${demoSchoolTenants.adminAccountId} = ${account.id}
          or ${demoSchoolTenants.organizationId} = ${grant.organizationId})
      and not exists (
        select 1 from ${domainEvents} inner join ${demoSchoolTenants}
          on ${domainEvents.payload}->>'organizationId' = ${demoSchoolTenants.organizationId}::text
        where ${domainEvents.aggregateType} = 'StaffInvitation'
          and ${domainEvents.eventType} = ${EventTypes.StaffInvitationIssued}
          and ${domainEvents.payload}->>'accountId' = ${account.id}::text
      ))
    or (
      ${grant.organizationId} = ${LOCAL_DEMO_ADMIN.organizationId}::uuid
      and ${grant.siteId} = ${LOCAL_DEMO_ADMIN.siteId}::uuid
      and (${valor})
    )
    or exists (
      select 1 from ${demoSchoolTenants}
      inner join ${sites} on ${sites.id} = ${demoSchoolTenants.siteId}
        and ${sites.organizationId} = ${demoSchoolTenants.organizationId}
      where ${demoSchoolTenants.enabled} = true
        and ${demoSchoolTenants.organizationId} = ${grant.organizationId}
        and ${demoSchoolTenants.siteId} = ${grant.siteId}
        and split_part(${account.emailNormalized}, '@', 2) = ${demoSchoolTenants.domain}
        and (
          (${grant.role} = 'site_admin'
            and ${demoSchoolTenants.adminAccountId} = ${account.id}
            and ${demoSchoolTenants.adminPersonId} = ${grant.personId}
            and ${demoSchoolTenants.adminGrantId} = ${grant.id}
            and ${account.emailNormalized} = 'admin.demo@' || ${demoSchoolTenants.domain})
          or exists (
            select 1 from ${domainEvents}
            where ${domainEvents.aggregateType} = 'StaffInvitation'
              and ${domainEvents.eventType} = ${EventTypes.StaffInvitationIssued}
              and ${domainEvents.aggregateId} = ${grant.id}
              and ${domainEvents.payload}->>'accountId' = ${account.id}::text
              and ${domainEvents.payload}->>'personId' = ${grant.personId}::text
              and ${domainEvents.payload}->>'role' = ${grant.role}
              and ${domainEvents.payload}->>'organizationId' = ${grant.organizationId}::text
              and ${domainEvents.payload}->>'siteId' = ${grant.siteId}::text
              and ${inArray(grant.role, [...localStaffInviteRoles])}
              and exists (
                select 1 from domain_events accepted_invitation
                where accepted_invitation.aggregate_type = 'StaffInvitation'
                  and accepted_invitation.event_type = ${EventTypes.StaffInvitationAccepted}
                  and accepted_invitation.aggregate_id = ${grant.id}
                  and accepted_invitation.payload->>'accountId' = ${account.id}::text
                  and accepted_invitation.payload->>'personId' = ${grant.personId}::text
                  and accepted_invitation.payload->>'role' = ${grant.role}
              )
          )
        )
    )
  )`;
}
