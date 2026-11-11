import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, courseTemplates, courseTemplateVersions, memberships,
  people, programs, roleAssignments } from "@/db/schema";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import type { Actor } from "@/modules/identity/actors.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { requireCurrentProgramSiteAuthorization } from "@/modules/programs/program-site-authorization.server";

export type TrackTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type TrackCapability = "instructional_track.author" | "instructional_track.review" | "instructional_track.publish" | "instructional_track.withdraw";
export const trackProgramPolicySchema = z.object({
  authoringEnabled: z.boolean().default(false),
  studentChoiceEnabled: z.boolean().default(false),
  practiceEnabled: z.boolean().default(false),
  deliveryEnabled: z.boolean().default(false),
  selectionPolicy: z.enum(["student", "guardian"]),
  allowSwitching: z.boolean(),
}).strict();

export function requireTrackFeature(program: { metadata: Record<string, unknown> }, feature: "authoring" | "choice" | "practice" | "delivery") {
  const parsed = trackProgramPolicySchema.safeParse(program.metadata.instructionalTracks);
  const flag = { authoring: "CAN_INSTRUCTIONAL_TRACK_AUTHORING_ENABLED", choice: "CAN_INSTRUCTIONAL_TRACK_CHOICE_ENABLED",
    practice: "CAN_INSTRUCTIONAL_TRACK_PRACTICE_ENABLED", delivery: "CAN_INSTRUCTIONAL_TRACK_DELIVERY_ENABLED" }[feature];
  const setting = { authoring: "authoringEnabled", choice: "studentChoiceEnabled", practice: "practiceEnabled", delivery: "deliveryEnabled" }[feature] as
    "authoringEnabled" | "studentChoiceEnabled" | "practiceEnabled" | "deliveryEnabled";
  if (process.env[flag] !== "true" || !parsed.success || !parsed.data[setting])
    throw new AuthorizationError("enabled instructional track feature for this Program");
  return parsed.data;
}

/** Recheck the original grant, Person and account even when the Actor was resolved earlier. */
export async function requireActiveTrackActor(tx: TrackTx, actor: Actor) {
  const [grant] = await tx.select({ id: accountPersonGrants.id, organizationId: accountPersonGrants.organizationId,
    siteId: accountPersonGrants.siteId }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(eq(accountPersonGrants.id, actor.grantId), eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.personId, actor.actorPersonId), eq(accountPersonGrants.role, actor.role),
      eq(accountPersonGrants.active, true), eq(people.active, true), eq(accessAccounts.disabled, false),
      isNotNull(accessAccounts.emailVerifiedAt))).for("share").limit(1);
  if (!grant || grant.siteId !== actor.grantSiteId || !grant.organizationId || !actor.scope.organizationIds?.includes(grant.organizationId))
    throw new AuthorizationError("current verified track account grant and original scope");
  return grant;
}

/** v1 authors provider-owned courses only. Adoption alone never licenses derivative production.
 * Course-scoped content qualification/authority must be explicitly delegated by the provider.
 * This does not appoint a Section teacher and grants no learner-record access.
 */
export async function requireTrackProvider(tx: TrackTx, actor: Actor, input: {
  programId: string; courseVersionId: string; capability: TrackCapability;
}) {
  const expectedRole = input.capability === "instructional_track.author" ? "academic_content_creator" : "academic_content_reviewer";
  if (actor.role !== expectedRole || actor.grantSiteId !== null || actor.sessionAccountId)
    throw new AuthorizationError("provider-owned content role");
  assertCapability(actor, input.capability);
  const grant = await requireActiveTrackActor(tx, actor);
  const [program] = await tx.select().from(programs).where(eq(programs.id, input.programId)).for("share").limit(1);
  const [course] = await tx.select({ id: courseTemplateVersions.id, courseId: courseTemplates.id,
    ownerId: courseTemplates.owningOrganizationId, status: courseTemplateVersions.status })
    .from(courseTemplateVersions).innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(eq(courseTemplateVersions.id, input.courseVersionId)).for("share").limit(1);
  if (!program || !course || (course.status !== "published" && input.capability !== "instructional_track.withdraw") || grant.siteId !== null ||
    grant.organizationId !== program.academicProviderOrganizationId || course.ownerId !== program.academicProviderOrganizationId ||
    !actor.scope.organizationIds?.includes(program.academicProviderOrganizationId))
    throw new AuthorizationError("provider-owned published source course");
  if (input.capability !== "instructional_track.withdraw") requireTrackFeature(program, "authoring");
  const [authority] = await tx.select({ id: roleAssignments.id }).from(roleAssignments)
    .innerJoin(memberships, and(eq(memberships.personId, roleAssignments.personId), eq(memberships.organizationId, roleAssignments.organizationId)))
    .where(and(eq(roleAssignments.personId, actor.actorPersonId), eq(roleAssignments.roleKey, expectedRole),
      eq(roleAssignments.organizationId, program.academicProviderOrganizationId), isNull(roleAssignments.siteId),
      or(isNull(roleAssignments.programId), eq(roleAssignments.programId, program.id)), activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify([input.capability])}::jsonb`,
      sql`${roleAssignments.metadata}->'courseTemplateVersionIds' @> ${JSON.stringify([course.id])}::jsonb`
    )).for("share").limit(1);
  if (!authority) throw new AuthorizationError("current explicit course-scoped content delegation");
  const hostId = program.hostOrganizationId ?? program.organizationId;
  // Apply the existing independently verified contract to ALL shared-provider hosts.
  if (hostId !== program.academicProviderOrganizationId && input.capability !== "instructional_track.withdraw")
    await requireCurrentProgramSiteAuthorization(tx, program.id, ["curriculum", "academic_instruction"]);
  return program;
}

/** A presenter profile is not proof of current institutional content eligibility. */
export async function requireCurrentTrackPresenter(tx: TrackTx, input: {
  personId: string; providerId: string; courseVersionId: string; programId: string;
}) {
  const [eligible] = await tx.select({ id: roleAssignments.id }).from(roleAssignments)
    .innerJoin(memberships, and(eq(memberships.personId, roleAssignments.personId), eq(memberships.organizationId, roleAssignments.organizationId)))
    .innerJoin(accountPersonGrants, and(eq(accountPersonGrants.personId, roleAssignments.personId),
      eq(accountPersonGrants.organizationId, roleAssignments.organizationId)))
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(eq(roleAssignments.personId, input.personId), eq(roleAssignments.organizationId, input.providerId),
      eq(roleAssignments.roleKey, "academic_content_creator"), isNull(roleAssignments.siteId),
      or(isNull(roleAssignments.programId), eq(roleAssignments.programId, input.programId)), activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> '["instructional_track.author"]'::jsonb`,
      sql`${roleAssignments.metadata}->'courseTemplateVersionIds' @> ${JSON.stringify([input.courseVersionId])}::jsonb`,
      eq(accountPersonGrants.role, "academic_content_creator"), eq(accountPersonGrants.active, true), isNull(accountPersonGrants.siteId),
      eq(people.active, true), eq(accessAccounts.disabled, false), isNotNull(accessAccounts.emailVerifiedAt)))
    .for("share").limit(1);
  if (!eligible) throw new AuthorizationError("current provider content eligibility of the recorded presenter");
}
