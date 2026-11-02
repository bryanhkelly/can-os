import { and, desc, eq, gt, like, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, people, programResponsibilityAssignments,
  programs, roleAssignments, schoolConfigurationVersions, sections, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { assertLocalDelegationIssuer, delegationExpiration } from "@/domain/site-local-delegation-policy";
import { sectionFacilitatorKey } from "@/domain/site-section-delegation";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { requiresIndependentChurchLocalDelegation } from "./site-local-delegation.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
type Reader = Pick<typeof db, "select">;

async function hostSection(tx: Reader, sectionId: string) {
  const [row] = await tx.select({
    id: sections.id, title: sections.title, active: sections.active,
    programId: sections.programId, sectionSiteId: sections.siteId,
    siteId: programs.siteId, organizationId: programs.organizationId,
    hostOrganizationId: programs.hostOrganizationId,
    providerId: programs.academicProviderOrganizationId,
    onsite: programs.deliveryModel,
  }).from(sections)
    .innerJoin(programs, eq(programs.id, sections.programId))
    .where(eq(sections.id, sectionId)).limit(1);
  if (!row || !row.active || !row.siteId ||
      row.sectionSiteId !== row.siteId || row.onsite.onsite !== true)
    throw new AuthorizationError("active onsite Section at canonical host Site");
  const [site] = await tx.select({ organizationId: sites.organizationId })
    .from(sites).where(eq(sites.id, row.siteId)).limit(1);
  if (!site || site.organizationId !== row.organizationId ||
      (row.hostOrganizationId ?? row.organizationId) !== site.organizationId)
    throw new AuthorizationError("consistent host ownership and Section Site");
  return { ...row, siteId: row.siteId, organizationId: site.organizationId };
}

async function latestConfig(tx: Reader, programId: string) {
  const [row] = await tx.select({ id: schoolConfigurationVersions.id })
    .from(schoolConfigurationVersions).where(eq(schoolConfigurationVersions.programId, programId))
    .orderBy(desc(schoolConfigurationVersions.version)).limit(1);
  return row ?? null;
}

/**
 * One Site's Section may have multiple named adults, each with an independent
 * effective term. This does not alter educational instructors, curriculum,
 * class schedules, pupil placement or CAN's regulatory obligations.
 */
export async function changeSectionFacilitator(actor: AccessContext, input: {
  sectionId: string; personId: string; action: "appoint" | "revoke";
  expectedAssignmentId: string | null; validThrough?: string;
}) {
  return db.transaction(async tx => {
    const section = await hostSection(tx, input.sectionId);
    assertLocalDelegationIssuer(actor, { organizationId: section.organizationId,
      siteId: section.siteId, programId: section.programId });
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:" + section.programId}))`);
    const config = await latestConfig(tx, section.programId);
    if (!config) throw new Error("Appoint a local Site director before assigning Section facilitators");
    const key = sectionFacilitatorKey(section.id, input.personId);
    const [prior] = await tx.select({
      id: programResponsibilityAssignments.id,
      effectiveThrough: programResponsibilityAssignments.effectiveThrough,
      responsibleRoleAssignmentId: programResponsibilityAssignments.responsibleRoleAssignmentId,
    }).from(programResponsibilityAssignments).where(and(
      eq(programResponsibilityAssignments.configurationVersionId, config.id),
      eq(programResponsibilityAssignments.responsibilityKey, key),
    )).limit(1);
    if ((prior?.id ?? null) !== input.expectedAssignmentId)
      throw new Error("Section staffing changed; refresh before editing");
    const now = new Date();
    if (input.action === "revoke") {
      if (!prior || (prior.effectiveThrough && prior.effectiveThrough <= now))
        return { changed: false, assignmentId: prior?.id ?? null };
      await tx.update(programResponsibilityAssignments).set({
        effectiveThrough: now, updatedAt: now,
      }).where(eq(programResponsibilityAssignments.id, prior.id));
      // Retain the facilitator role row as evidence while excluding it from
      // every live projection (same treatment as CAN staff revocation).
      if (prior.responsibleRoleAssignmentId) {
        const [dutyRole] = await tx.select({
          id: roleAssignments.id, metadata: roleAssignments.metadata,
        }).from(roleAssignments)
          .where(eq(roleAssignments.id, prior.responsibleRoleAssignmentId)).limit(1);
        if (dutyRole && dutyRole.metadata?.origin === "local_section_facilitator" &&
            !dutyRole.metadata?.revokedAt) {
          await tx.update(roleAssignments).set({
            capabilities: [],
            metadata: { ...dutyRole.metadata, revokedAt: now.toISOString(),
              revocationReason: `Section facilitator duty revoked for Section ${section.id}`,
              revokedByPersonId: actor.actorPersonId },
            updatedAt: now,
          }).where(eq(roleAssignments.id, dutyRole.id));
        }
      }
      await writeAudit(tx, actor, {
        action: "site.section_facilitator.revoked",
        entityType: "program_responsibility_assignment", entityId: prior.id,
        scope: { organizationId: section.organizationId, siteId: section.siteId,
          programId: section.programId, sectionId: section.id },
        before: { personId: input.personId }, after: { effectiveThrough: now.toISOString() },
      });
      await emitEvent(tx, {
        eventType: EventTypes.SectionFacilitatorRevoked, aggregateType: "program_responsibility_assignment",
        aggregateId: prior.id, actorPersonId: actor.actorPersonId,
        organizationId: section.organizationId, siteId: section.siteId,
        programId: section.programId, sectionId: section.id,
        payload: { personId: input.personId },
      });
      return { changed: true, assignmentId: prior.id };
    }
    if (!input.validThrough) throw new Error("Delegation expiration is required");
    const through = delegationExpiration(input.validThrough, now);
    await requireChurchHostedOperatingServices(tx, section.programId, ["onsite_supervision"]);
    // An exact-Site, non-synthetic, email-verified pre-existing identity.
    const [candidate] = await tx.select({ id: accountPersonGrants.id })
      .from(accountPersonGrants)
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
      .where(and(eq(accountPersonGrants.personId, input.personId),
        eq(accountPersonGrants.role, "room_facilitator"),
        eq(accountPersonGrants.organizationId, section.organizationId),
        eq(accountPersonGrants.siteId, section.siteId),
        eq(accountPersonGrants.active, true),
        eq(people.active, true), eq(accessAccounts.disabled, false),
        sql`${accessAccounts.emailVerifiedAt} is not null`)).limit(1);
    if (!candidate) throw new AuthorizationError("verified Site facilitator identity");
    // Re-appointment restores the retained, soft-revoked role row with its
    // original id instead of accumulating duplicate historical rows.
    const [revokedRole] = await tx.select({
      id: roleAssignments.id, metadata: roleAssignments.metadata,
    }).from(roleAssignments).where(and(
      eq(roleAssignments.personId, input.personId),
      eq(roleAssignments.organizationId, section.organizationId),
      eq(roleAssignments.siteId, section.siteId),
      eq(roleAssignments.programId, section.programId),
      eq(roleAssignments.roleKey, "room_facilitator"),
      sql`${roleAssignments.metadata}->>'origin' = 'local_section_facilitator'`,
      sql`${roleAssignments.metadata}->>'sectionId' = ${section.id}`,
      sql`${roleAssignments.metadata}->>'revokedAt' is not null`,
    )).orderBy(desc(roleAssignments.updatedAt)).limit(1);
    let role: { id: string };
    if (revokedRole) {
      const [restored] = await tx.update(roleAssignments).set({
        capabilities: ["onsite.attendance.record"],
        metadata: { ...revokedRole.metadata, expiresAt: through.toISOString(),
          revokedAt: null, revocationReason: null, revokedByPersonId: null },
        updatedAt: now,
      }).where(eq(roleAssignments.id, revokedRole.id)).returning({ id: roleAssignments.id });
      if (!restored) throw new Error("Unable to restore Section role");
      role = restored;
    } else {
      const [created] = await tx.insert(roleAssignments).values({
        personId: input.personId, roleKey: "room_facilitator",
        organizationId: section.organizationId, siteId: section.siteId,
        programId: section.programId, capabilities: ["onsite.attendance.record"],
        metadata: { origin: "local_section_facilitator", sectionId: section.id,
          expiresAt: through.toISOString() },
      }).returning({ id: roleAssignments.id });
      if (!created) throw new Error("Unable to persist Section role");
      role = created;
    }
    let id: string;
    if (prior) {
      await tx.update(programResponsibilityAssignments).set({
        responsibleRoleAssignmentId: role.id, effectiveFrom: now,
        effectiveThrough: through, updatedAt: now,
      }).where(eq(programResponsibilityAssignments.id, prior.id));
      id = prior.id;
    } else {
      const [newAssignment] = await tx.insert(programResponsibilityAssignments).values({
        configurationVersionId: config.id, responsibilityKey: key,
        accountableOrganizationId: section.organizationId,
        responsibleRoleAssignmentId: role.id,
        effectiveFrom: now, effectiveThrough: through,
      }).returning({ id: programResponsibilityAssignments.id });
      if (!newAssignment) throw new Error("Cannot create Section appointment");
      id = newAssignment.id;
    }
    await writeAudit(tx, actor, {
      action: "site.section_facilitator.appointed",
      entityType: "program_responsibility_assignment", entityId: id,
      scope: { organizationId: section.organizationId, siteId: section.siteId,
        programId: section.programId, sectionId: section.id },
      after: { personId: input.personId, roleAssignmentId: role.id,
        effectiveFrom: now.toISOString(), effectiveThrough: through.toISOString() },
    });
    await emitEvent(tx, {
      eventType: EventTypes.SectionFacilitatorAppointed, aggregateType: "program_responsibility_assignment",
      aggregateId: id, actorPersonId: actor.actorPersonId,
      organizationId: section.organizationId, siteId: section.siteId,
      programId: section.programId, sectionId: section.id,
      payload: { personId: input.personId, expiresAt: through.toISOString() },
    });
    return { changed: true, assignmentId: id };
  });
}

/** An active facilitator can ONLY see the Sections to which they were appointed. */
export async function activeFacilitatorSectionIds(tx: Reader, actor: AccessContext,
  programId: string): Promise<string[]> {
  if (actor.sessionAccountId || actor.role !== "room_facilitator" ||
      !actor.actorPersonId || !actor.grantSiteId || !actor.accountId || !actor.grantId ||
      !actor.scope.programIds?.includes(programId)) return [];
  // Revoking or expiring the church/CAN operating agreement must immediately
  // revoke pupil-roster reads, not only new attendance/duty writes.
  await requireChurchHostedOperatingServices(tx, programId, ["onsite_supervision"]);
  const config = await latestConfig(tx, programId);
  if (!config) return [];
  const now = new Date();
  const rows = await tx.select({
    sectionId: sections.id,
  }).from(programResponsibilityAssignments)
    .innerJoin(roleAssignments, eq(roleAssignments.id, programResponsibilityAssignments.responsibleRoleAssignmentId))
    .innerJoin(sections, and(
      sql`${programResponsibilityAssignments.responsibilityKey} =
        ('room_facilitator:' || ${sections.id}::text || ':' || ${roleAssignments.personId}::text)`,
      eq(sections.programId, programId),
      eq(sections.siteId, actor.grantSiteId),
      eq(sections.active, true),
    ))
    .innerJoin(accountPersonGrants, and(
      eq(accountPersonGrants.id, actor.grantId),
      eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.personId, roleAssignments.personId),
      eq(accountPersonGrants.organizationId, roleAssignments.organizationId),
      eq(accountPersonGrants.siteId, roleAssignments.siteId),
      eq(accountPersonGrants.role, "room_facilitator"),
    ))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(programResponsibilityAssignments.configurationVersionId, config.id),
      like(programResponsibilityAssignments.responsibilityKey, "room_facilitator:%"),
      eq(programResponsibilityAssignments.accountableOrganizationId,
        sql`${roleAssignments.organizationId}`),
      eq(roleAssignments.personId, actor.actorPersonId),
      eq(roleAssignments.roleKey, "room_facilitator"),
      eq(roleAssignments.programId, programId),
      eq(roleAssignments.siteId, actor.grantSiteId),
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify(["onsite.attendance.record"])}::jsonb`,
      sql`${roleAssignments.metadata}->>'origin' = 'local_section_facilitator'`,
      sql`${roleAssignments.metadata}->>'sectionId' = ${sections.id}::text`,
      eq(accountPersonGrants.active, true),
      eq(people.active, true), eq(accessAccounts.disabled, false),
      sql`${accessAccounts.emailVerifiedAt} is not null`,
      lte(programResponsibilityAssignments.effectiveFrom, now),
      gt(programResponsibilityAssignments.effectiveThrough, now),
    ));
  return [...new Set(rows.map(row => row.sectionId))];
}

/** Use on positive writes, before mutating or returning a replayed result. */
export async function requireCurrentSectionFacilitator(
  tx: Reader, actor: AccessContext, programId: string, sectionId: string,
): Promise<void> {
  const section = await hostSection(tx, sectionId);
  if (section.programId !== programId ||
      actor.grantSiteId !== section.siteId ||
      !actor.scope.organizationIds?.includes(section.organizationId))
    throw new AuthorizationError("assigned Section and original host Site scope");
  // Preserve pre-existing ordinary school staffing paths: section-scoped
  // delegation is a new requirement only for independently church-hosted CAN.
  if (!await requiresIndependentChurchLocalDelegation(tx, programId)) return;
  const ids = await activeFacilitatorSectionIds(tx, actor, programId);
  if (!ids.includes(sectionId))
    throw new AuthorizationError("current exact-Section named facilitator assignment");
  await requireChurchHostedOperatingServices(tx, programId, ["onsite_supervision"]);
}

/** Host-only operator listing; no student enrollment, grades or schoolwide user directory. */
export async function listSectionFacilitators(actor: AccessContext, programId: string) {
  const [program] = await db.select({
    id: programs.id, siteId: programs.siteId, organizationId: programs.organizationId,
  }).from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program?.siteId) throw new AuthorizationError("existing Program Site");
  assertLocalDelegationIssuer(actor, {
    organizationId: program.organizationId, siteId: program.siteId, programId,
  });
  const config = await latestConfig(db, programId);
  const [sectionRows, appointments, staff] = await Promise.all([
    db.select({ id: sections.id, title: sections.title, code: sections.code })
      .from(sections).where(and(eq(sections.programId, programId),
        eq(sections.siteId, program.siteId), eq(sections.active, true))),
    config ? db.select({
      id: programResponsibilityAssignments.id,
      key: programResponsibilityAssignments.responsibilityKey,
      personId: roleAssignments.personId,
      first: people.legalFirstName, last: people.legalLastName,
      effectiveFrom: programResponsibilityAssignments.effectiveFrom,
      effectiveThrough: programResponsibilityAssignments.effectiveThrough,
    }).from(programResponsibilityAssignments)
      .innerJoin(roleAssignments, eq(roleAssignments.id, programResponsibilityAssignments.responsibleRoleAssignmentId))
      .innerJoin(people, eq(people.id, roleAssignments.personId))
      .where(and(eq(programResponsibilityAssignments.configurationVersionId, config.id),
        like(programResponsibilityAssignments.responsibilityKey, "room_facilitator:%")))
      : Promise.resolve([]),
    db.select({ personId: accountPersonGrants.personId, first: people.legalFirstName,
      last: people.legalLastName })
      .from(accountPersonGrants)
      .innerJoin(people, eq(people.id, accountPersonGrants.personId))
      .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
      .where(and(eq(accountPersonGrants.organizationId, program.organizationId),
        eq(accountPersonGrants.siteId, program.siteId),
        eq(accountPersonGrants.role, "room_facilitator"),
        eq(accountPersonGrants.active, true),
        eq(people.active, true),
        eq(accessAccounts.disabled, false),
        sql`${accessAccounts.emailVerifiedAt} is not null`)).limit(100),
  ]);
  const sectionIds = new Set(sectionRows.map(section => section.id));
  return {
    programId,
    sections: sectionRows,
    staff: [...new Map(staff.map(person => [person.personId, person])).values()],
    appointments: appointments.filter(a => {
      const sectionId = a.key.split(":")[1];
      return sectionId && sectionIds.has(sectionId);
    }).map(a => ({
      id: a.id, sectionId: a.key.split(":")[1]!, personId: a.personId,
      name: a.first + " " + a.last,
      effectiveFrom: a.effectiveFrom?.toISOString() ?? null,
      effectiveThrough: a.effectiveThrough?.toISOString() ?? null,
    })),
    hasConfiguration: !!config,
  };
}
