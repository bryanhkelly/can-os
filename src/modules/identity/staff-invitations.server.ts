import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, domainEvents, people, sites } from "@/db/schema";
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";
import { AuthorizationError } from "@/domain/command-context";
import { assertRawAccountPerson } from "./unambiguous-adult-account.server";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";

export const STAFF_INVITATION_AGGREGATE = "StaffInvitation";

export type PendingStaffInvitation = {
  id: string;
  accountId: string;
  personId: string;
  role: string;
  organizationId: string;
  siteId: string;
};

type Reader = Pick<typeof db, "select">;
type Mutation = Pick<typeof db, "select" | "update" | "insert">;

/**
 * Pending invitations are represented by an inactive exact-Site grant and its
 * transactional invitation event. Acceptance is a separate immutable event.
 * Revoked/legacy inactive grants are never inferred to be invitations.
 */
export async function listPendingStaffInvitations(
  executor: Reader,
  accountId: string,
): Promise<PendingStaffInvitation[]> {
  const grants = await executor.select({
    id: accountPersonGrants.id,
    accountId: accountPersonGrants.accountId,
    personId: accountPersonGrants.personId,
    role: accountPersonGrants.role,
    organizationId: accountPersonGrants.organizationId,
    siteId: accountPersonGrants.siteId,
  }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(
      eq(accountPersonGrants.accountId, accountId),
      eq(accountPersonGrants.active, false),
      eq(people.active, true),
    ));
  if (!grants.length) return [];
  const events = await executor.select({
    grantId: domainEvents.aggregateId,
    eventType: domainEvents.eventType,
  }).from(domainEvents).where(and(
    eq(domainEvents.aggregateType, STAFF_INVITATION_AGGREGATE),
    inArray(domainEvents.aggregateId, grants.map(grant => grant.id)),
    inArray(domainEvents.eventType, [EventTypes.StaffInvitationIssued, EventTypes.StaffInvitationAccepted]),
  ));
  const issued = new Set(events.filter(event => event.eventType === EventTypes.StaffInvitationIssued).map(event => event.grantId));
  const accepted = new Set(events.filter(event => event.eventType === EventTypes.StaffInvitationAccepted).map(event => event.grantId));
  return grants.filter((grant): grant is PendingStaffInvitation =>
    Boolean(grant.organizationId && grant.siteId) &&
    issued.has(grant.id) && !accepted.has(grant.id) &&
    localStaffInviteRoles.includes(grant.role as typeof localStaffInviteRoles[number]),
  );
}

/** Activate and attest only explicitly pending, narrowly scoped invitations. */
export async function acceptStaffInvitations(
  tx: Mutation,
  accountId: string,
  invitations: readonly PendingStaffInvitation[],
  now = new Date(),
  automaticApproval?: {actorPersonId:string},
): Promise<PendingStaffInvitation[]> {
  const accepted: PendingStaffInvitation[] = [];
  for (const invitation of invitations) {
    // A pending row must still bind the same immutable Account Person and
    // exact Site at acceptance time, not just when the invitation was issued.
    const [account] = await tx.select({personId:accessAccounts.personId})
      .from(accessAccounts).innerJoin(people,and(eq(people.id,accessAccounts.personId),eq(people.active,true)))
      .where(and(eq(accessAccounts.id,accountId),eq(accessAccounts.disabled,false))).for("share").limit(1);
    if(!account?.personId||account.personId!==invitation.personId||invitation.accountId!==accountId)
      throw new AuthorizationError("current invited Account Person");
    await assertRawAccountPerson(accountId,invitation.personId,tx);
    const [site]=await tx.select({id:sites.id}).from(sites).where(and(eq(sites.id,invitation.siteId),eq(sites.organizationId,invitation.organizationId))).for("share").limit(1);
    if(!site||!localStaffInviteRoles.includes(invitation.role as typeof localStaffInviteRoles[number]))
      throw new AuthorizationError("current invited Site membership");
    const [updated] = await tx.update(accountPersonGrants)
      .set({ active: true, updatedAt: now })
      .where(and(
        eq(accountPersonGrants.id, invitation.id),
        eq(accountPersonGrants.accountId, accountId),
        eq(accountPersonGrants.personId, invitation.personId),
        eq(accountPersonGrants.role, invitation.role),
        eq(accountPersonGrants.organizationId, invitation.organizationId),
        eq(accountPersonGrants.siteId, invitation.siteId),
        eq(accountPersonGrants.active, false),
        )).returning({ id: accountPersonGrants.id });
    if (!updated) continue;
    await emitEvent(tx, {
      eventType: EventTypes.StaffInvitationAccepted,
      aggregateType: STAFF_INVITATION_AGGREGATE,
      aggregateId: invitation.id,
      actorPersonId: automaticApproval?.actorPersonId ?? invitation.personId,
      organizationId: invitation.organizationId,
      siteId: invitation.siteId,
      payload: { accountId, personId: invitation.personId, role: invitation.role,
        approvalMethod: automaticApproval ? "automatic_demo" : "recipient_sign_in" },
    });
    await writeAudit(tx, {
      actorPersonId: automaticApproval?.actorPersonId ?? invitation.personId,
      action: "identity.staff_invitation.accepted",
      resourceType: STAFF_INVITATION_AGGREGATE,
      resourceId: invitation.id,
      scope: { organizationId: invitation.organizationId, siteId: invitation.siteId },
      before: { active: false },
      after: { active: true, accountId, personId: invitation.personId, role: invitation.role },
      context: { accountId, grantId: invitation.id, role: invitation.role,
        approvalMethod: automaticApproval ? "automatic_demo" : "recipient_sign_in" },
    });
    accepted.push(invitation);
  }
  return accepted;
}
