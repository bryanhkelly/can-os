import { and, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  evidenceDocumentVersions,
  professionalCapabilityAuthorizations,
  professionalRoleAssignments,
  serviceCapabilities,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { isVerifiedEvidenceCurrent } from "@/domain/instructional-tracks";
import { accessAccounts, accessSessions, accountPersonGrants, people } from "@/db/schema";
import { sessionIdleCutoff } from "@/domain/access-tokens";

type TrackTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type TrackProviderCapability =
  | "instructional_track.author"
  | "instructional_track.review"
  | "instructional_track.publish"
  | "instructional_track.withdraw";

function providerRole(capability: TrackProviderCapability): "academic_content_creator" | "academic_content_reviewer" {
  return capability === "instructional_track.author"
    ? "academic_content_creator"
    : "academic_content_reviewer";
}

function capabilityCode(capability: TrackProviderCapability): "curriculum_author" | "content_reviewer" {
  return capability === "instructional_track.author" ? "curriculum_author" : "content_reviewer";
}

async function assertCurrentGrant(
  tx: TrackTransaction,
  actor: AccessContext,
  organizationId: string,
): Promise<void> {
  const now = new Date();
  const [session] = await tx.select({ id: accessSessions.id })
    .from(accessSessions)
    .where(and(
      eq(accessSessions.id, actor.sessionId),
      eq(accessSessions.accountId, actor.accountId),
      isNull(accessSessions.revokedAt),
      gt(accessSessions.expiresAt, now),
      gt(accessSessions.updatedAt, sessionIdleCutoff(now)),
    ))
    .for("share")
    .limit(1);
  if (!session) throw new AuthorizationError("current authenticated session");
  const actorPersonId = actor.actorPersonId;
  if (!actorPersonId) throw new AuthorizationError("authenticated session");
  const [grant] = await tx.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.id, actor.grantId),
      eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.personId, actorPersonId),
      eq(accountPersonGrants.role, actor.role),
      eq(accountPersonGrants.organizationId, organizationId),
      isNull(accountPersonGrants.siteId),
      eq(accountPersonGrants.active, true),
      eq(people.active, true),
      eq(accessAccounts.disabled, false),
      isNotNull(accessAccounts.emailVerifiedAt),
    ))
    .for("share")
    .limit(1);
  if (!grant) throw new AuthorizationError("current verified organization-wide provider grant");
}

async function assignmentIsCurrentAndScoped(
  tx: TrackTransaction,
  input: {
    personId: string;
    organizationId: string;
    courseId: string;
    capability: TrackProviderCapability;
  },
): Promise<boolean> {
  const now = new Date();
  const expectedRole = providerRole(input.capability);
  const expectedCapability = capabilityCode(input.capability);
  const [assignment] = await tx.select({
    authorityEvidenceId: professionalRoleAssignments.authorityEvidenceId,
    capabilityEvidenceVersionId: professionalCapabilityAuthorizations.evidenceVersionId,
  }).from(professionalRoleAssignments)
    .innerJoin(professionalCapabilityAuthorizations, and(
      eq(
        professionalCapabilityAuthorizations.id,
        professionalRoleAssignments.capabilityAuthorizationId,
      ),
      eq(
        professionalCapabilityAuthorizations.personId,
        professionalRoleAssignments.personId,
      ),
      eq(
        professionalCapabilityAuthorizations.capabilityId,
        professionalRoleAssignments.capabilityId,
      ),
    ))
    .innerJoin(serviceCapabilities, eq(
      serviceCapabilities.id,
      professionalRoleAssignments.capabilityId,
    ))
    .where(and(
      eq(professionalRoleAssignments.personId, input.personId),
      eq(professionalRoleAssignments.appointingOrganizationId, input.organizationId),
      eq(professionalRoleAssignments.organizationId, input.organizationId),
      eq(professionalRoleAssignments.roleCode, expectedRole),
      eq(professionalRoleAssignments.courseId, input.courseId),
      eq(professionalRoleAssignments.state, "approved"),
      lte(professionalRoleAssignments.beginsAt, now),
      or(isNull(professionalRoleAssignments.endsAt), gt(professionalRoleAssignments.endsAt, now)),
      isNull(professionalRoleAssignments.operationId),
      isNull(professionalRoleAssignments.deploymentId),
      isNull(professionalRoleAssignments.sectionId),
      isNull(professionalRoleAssignments.learnerId),
      isNull(professionalRoleAssignments.offeringId),
      eq(professionalCapabilityAuthorizations.decision, "approved"),
      lte(professionalCapabilityAuthorizations.validFrom, now),
      or(
        isNull(professionalCapabilityAuthorizations.validThrough),
        gt(professionalCapabilityAuthorizations.validThrough, now),
      ),
      isNull(professionalCapabilityAuthorizations.geographicAreaId),
      isNull(professionalCapabilityAuthorizations.operationId),
      isNull(professionalCapabilityAuthorizations.offeringId),
      eq(serviceCapabilities.code, expectedCapability),
    ))
    .for("share")
    .limit(1);
  if (!assignment?.authorityEvidenceId) return false;

  const evidenceIds = [
    assignment.authorityEvidenceId,
    ...(assignment.capabilityEvidenceVersionId ? [assignment.capabilityEvidenceVersionId] : []),
  ];
  const evidenceRows = await tx.select({
    id: evidenceDocumentVersions.id,
    verifiedAt: evidenceDocumentVersions.verifiedAt,
    verifiedByPersonId: evidenceDocumentVersions.verifiedByPersonId,
    validFrom: evidenceDocumentVersions.validFrom,
    validThrough: evidenceDocumentVersions.validThrough,
  }).from(evidenceDocumentVersions)
    .where(inArray(evidenceDocumentVersions.id, evidenceIds));
  const evidenceById = new Map(evidenceRows.map((evidence) => [evidence.id, evidence]));
  return evidenceIds.every((id) => {
    const evidence = evidenceById.get(id);
    return !!evidence && isVerifiedEvidenceCurrent({ ...evidence, at: now });
  });
}

export async function assertTrackProvider(
  tx: TrackTransaction,
  actor: AccessContext,
  input: {
    organizationId: string;
    courseId: string;
    capability: TrackProviderCapability;
  },
): Promise<void> {
  const expectedRole = providerRole(input.capability);
  if (
    !actor.actorPersonId ||
    actor.role !== expectedRole ||
    actor.grantSiteId !== null ||
    actor.sessionAccountId ||
    !actor.scope.organizationIds?.includes(input.organizationId)
  ) {
    throw new AuthorizationError("provider-owned course content role");
  }
  assertCapability(actor, input.capability);
  await assertCurrentGrant(tx, actor, input.organizationId);
  if (!await assignmentIsCurrentAndScoped(tx, {
    personId: actor.actorPersonId,
    organizationId: input.organizationId,
    courseId: input.courseId,
    capability: input.capability,
  })) {
    throw new AuthorizationError("current evidence-backed course content delegation");
  }
}

export async function assertCurrentTrackPresenter(
  tx: TrackTransaction,
  input: {
    personId: string;
    organizationId: string;
    courseId: string;
  },
): Promise<void> {
  const [grant] = await tx.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.personId, input.personId),
      eq(accountPersonGrants.organizationId, input.organizationId),
      isNull(accountPersonGrants.siteId),
      eq(accountPersonGrants.role, "academic_content_creator"),
      eq(accountPersonGrants.active, true),
      eq(people.active, true),
      eq(accessAccounts.disabled, false),
      isNotNull(accessAccounts.emailVerifiedAt),
    ))
    .for("share")
    .limit(1);
  if (!grant || !await assignmentIsCurrentAndScoped(tx, {
    personId: input.personId,
    organizationId: input.organizationId,
    courseId: input.courseId,
    capability: "instructional_track.author",
  })) {
    throw new AuthorizationError("current verified course presenter authorization");
  }
}

export function assertLearningParticipantRole(
  context: CommandContext,
  kind: "learner" | "guardian" | "learner_or_guardian",
): asserts context is CommandContext & { actorPersonId: string } {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  if (kind !== "guardian" && context.role === "student") {
    assertCapability(context, "student:read");
    return;
  }
  if (kind !== "learner" && context.role === "guardian") {
    assertCapability(context, "student:related-read");
    return;
  }
  throw new AuthorizationError(kind === "guardian" ? "guardian role" : "learner role");
}
