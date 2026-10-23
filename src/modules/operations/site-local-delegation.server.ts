import { and, desc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, people, programResponsibilityAssignments,
  programs, roleAssignments, schoolConfigurationVersions, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import {
  assertLocalDelegateGrant, assertLocalDelegationIssuer, delegationExpiration,
  localResponsibilityRoles, type LocalResponsibility,
} from "@/domain/site-local-delegation-policy";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

type Reader = Pick<typeof db, "select">;

async function loadHostProgram(tx: Reader, programId: string) {
  const [program] = await tx.select({
    id: programs.id, siteId: programs.siteId,
    organizationId: programs.organizationId,
    hostOrganizationId: programs.hostOrganizationId,
    deliveryModel: programs.deliveryModel,
    name: programs.name,
  }).from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program?.siteId || !program.deliveryModel.onsite)
    throw new AuthorizationError("existing onsite Program");
  const [site] = await tx.select({ id: sites.id, organizationId: sites.organizationId })
    .from(sites).where(eq(sites.id, program.siteId)).limit(1);
  if (!site || site.organizationId !== program.organizationId ||
      (program.hostOrganizationId ?? program.organizationId) !== site.organizationId)
    throw new AuthorizationError("Site-owned host Program");
  return { ...program, siteId: site.id, organizationId: site.organizationId };
}

async function currentConfiguration(tx: Reader, programId: string) {
  const [configuration] = await tx.select({
    id: schoolConfigurationVersions.id, version: schoolConfigurationVersions.version,
  }).from(schoolConfigurationVersions)
    .where(eq(schoolConfigurationVersions.programId, programId))
    .orderBy(desc(schoolConfigurationVersions.version)).limit(1);
  return configuration ?? null;
}

async function verifiedLocalCandidate(tx: Reader, input: {
  personId: string; role: string; siteId: string; organizationId: string;
}) {
  const [candidate] = await tx.select({
    id: accountPersonGrants.id, personId: accountPersonGrants.personId,
    role: accountPersonGrants.role, active: accountPersonGrants.active,
    organizationId: accountPersonGrants.organizationId, siteId: accountPersonGrants.siteId,
    emailVerifiedAt: accessAccounts.emailVerifiedAt,
    personActive: people.active,
  }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.personId, input.personId),
      eq(accountPersonGrants.role, input.role),
      eq(accountPersonGrants.organizationId, input.organizationId),
      eq(accountPersonGrants.siteId, input.siteId),
      eq(accountPersonGrants.active, true),
      eq(people.active, true),
      eq(accessAccounts.disabled, false),
    )).limit(1);
  return candidate ?? null;
}

/**
 * A Program-specific appointment on an existing SchoolConfigurationVersion.
 * This is a named responsibility, NOT an opening permit, a background check,
 * academic authority, or an account role. Account grants remain independent.
 */
export async function setSiteLocalDelegation(actor: AccessContext, input: {
  programId: string;
  responsibility: LocalResponsibility;
  action: "appoint" | "revoke";
  personId?: string;
  validThrough?: string;
  expectedAssignmentId?: string | null;
}) {
  return db.transaction(async tx => {
    const host = await loadHostProgram(tx, input.programId);
    assertLocalDelegationIssuer(actor, {
      organizationId: host.organizationId, siteId: host.siteId, programId: host.id,
    });
    // Serializes concurrent appointees and revocation with the same Program.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:" + host.id}))`);
    const config = await currentConfiguration(tx, host.id);
    if (!config) throw new Error("Configure this Program's school operations before delegating onsite responsibilities");

    // A church registrar cannot create a legal CAN service entitlement.
    await requireChurchHostedOperatingServices(tx, host.id, ["onsite_supervision"]);
    const key = input.responsibility;
    const [current] = await tx.select({
      id: programResponsibilityAssignments.id,
      responsibleRoleAssignmentId: programResponsibilityAssignments.responsibleRoleAssignmentId,
      effectiveFrom: programResponsibilityAssignments.effectiveFrom,
      effectiveThrough: programResponsibilityAssignments.effectiveThrough,
    }).from(programResponsibilityAssignments).where(and(
      eq(programResponsibilityAssignments.configurationVersionId, config.id),
      eq(programResponsibilityAssignments.responsibilityKey, key),
    )).limit(1);
    if ((current?.id ?? null) !== (input.expectedAssignmentId ?? null))
      throw new Error("Local responsibility changed; refresh before updating it");

    const now = new Date();
    if (input.action === "revoke") {
      if (!current) return { changed: false, responsibility: key, assignmentId: null };
      if (current.effectiveThrough && current.effectiveThrough <= now)
        return { changed: false, responsibility: key, assignmentId: current.id };
      await tx.update(programResponsibilityAssignments).set({
        effectiveThrough: now, updatedAt: now,
      }).where(eq(programResponsibilityAssignments.id, current.id));
      await writeAudit(tx, actor, {
        action: "site.local_responsibility.revoked",
        entityType: "program_responsibility_assignment", entityId: current.id,
        scope: { organizationId: host.organizationId, siteId: host.siteId, programId: host.id },
        before: { responsibility: key, roleAssignmentId: current.responsibleRoleAssignmentId },
        after: { responsibility: key, effectiveThrough: now.toISOString() },
      });
      await emitEvent(tx, {
        eventType: "LocalSiteResponsibilityRevoked", aggregateType: "program_responsibility_assignment",
        aggregateId: current.id, actorPersonId: actor.actorPersonId,
        organizationId: host.organizationId, siteId: host.siteId, programId: host.id,
        payload: { responsibility: key },
      });
      return { changed: true, responsibility: key, assignmentId: current.id };
    }

    if (!input.personId || !input.validThrough)
      throw new Error("Choose a verified local staff member and an expiration date");
    const expires = delegationExpiration(input.validThrough, now);
    const requiredRole = localResponsibilityRoles[key];
    const candidate = await verifiedLocalCandidate(tx, {
      personId: input.personId, role: requiredRole,
      organizationId: host.organizationId, siteId: host.siteId,
    });
    assertLocalDelegateGrant({
      role: candidate?.role ?? "", active: candidate?.active ?? false,
      verified: !!candidate?.emailVerifiedAt && !!candidate.personActive,
      samePerson: candidate?.personId === input.personId,
      organizationMatches: candidate?.organizationId === host.organizationId,
      siteMatches: candidate?.siteId === host.siteId,
    }, key);
    const [role] = await tx.insert(roleAssignments).values({
      personId: input.personId, organizationId: host.organizationId,
      siteId: host.siteId, programId: host.id, roleKey: requiredRole,
      // Responsibility alone MUST NOT mint academic privileges or new account grants.
      capabilities: ["onsite.attendance.record"],
      metadata: { origin: "local_site_delegation", responsibility: key,
        expiresAt: expires.toISOString() },
    }).returning({ id: roleAssignments.id });
    if (!role) throw new Error("Cannot record named local staff assignment");

    let assignmentId: string;
    if (current) {
      await tx.update(programResponsibilityAssignments).set({
        accountableOrganizationId: host.organizationId,
        responsibleRoleAssignmentId: role.id, effectiveFrom: now,
        effectiveThrough: expires, updatedAt: now,
      }).where(eq(programResponsibilityAssignments.id, current.id));
      assignmentId = current.id;
    } else {
      const [created] = await tx.insert(programResponsibilityAssignments).values({
        configurationVersionId: config.id,
        responsibilityKey: key, accountableOrganizationId: host.organizationId,
        responsibleRoleAssignmentId: role.id,
        effectiveFrom: now, effectiveThrough: expires,
      }).returning({ id: programResponsibilityAssignments.id });
      if (!created) throw new Error("Could not store onsite responsibility");
      assignmentId = created.id;
    }
    await writeAudit(tx, actor, {
      action: "site.local_responsibility.appointed",
      entityType: "program_responsibility_assignment", entityId: assignmentId,
      scope: { organizationId: host.organizationId, siteId: host.siteId, programId: host.id },
      before: { roleAssignmentId: current?.responsibleRoleAssignmentId ?? null },
      after: { responsibility: key, personId: input.personId, roleAssignmentId: role.id,
        effectiveFrom: now.toISOString(), effectiveThrough: expires.toISOString(),
        schoolConfigurationVersion: config.version },
    });
    await emitEvent(tx, {
      eventType: "LocalSiteResponsibilityAppointed", aggregateType: "program_responsibility_assignment",
      aggregateId: assignmentId, actorPersonId: actor.actorPersonId,
      organizationId: host.organizationId, siteId: host.siteId, programId: host.id,
      payload: { responsibility: key, personId: input.personId, expiresAt: expires.toISOString() },
    });
    return { changed: true, responsibility: key, assignmentId };
  });
}

/** A current local grant and the named Program responsibility are BOTH required. */
export async function requireCurrentSiteLocalDelegate(
  tx: Reader, actor: AccessContext, programId: string, responsibility: LocalResponsibility,
): Promise<void> {
  const host = await loadHostProgram(tx, programId);
  if (actor.demoFacilitator || !actor.actorPersonId ||
      actor.role !== localResponsibilityRoles[responsibility] ||
      actor.grantSiteId !== host.siteId ||
      !actor.scope.organizationIds?.includes(host.organizationId) ||
      !actor.scope.programIds?.includes(programId)) {
    throw new AuthorizationError("verified Program and local Site duty scope");
  }
  const config = await currentConfiguration(tx, programId);
  if (!config) throw new AuthorizationError("configured local responsibility");
  const now = new Date();
  const [assigned] = await tx.select({ id: programResponsibilityAssignments.id })
    .from(programResponsibilityAssignments)
    .innerJoin(roleAssignments, eq(roleAssignments.id, programResponsibilityAssignments.responsibleRoleAssignmentId))
    .innerJoin(accountPersonGrants, and(
      eq(accountPersonGrants.personId, roleAssignments.personId),
      eq(accountPersonGrants.role, roleAssignments.roleKey),
      eq(accountPersonGrants.organizationId, host.organizationId),
      eq(accountPersonGrants.siteId, host.siteId),
    ))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(programResponsibilityAssignments.configurationVersionId, config.id),
      eq(programResponsibilityAssignments.responsibilityKey, responsibility),
      eq(programResponsibilityAssignments.accountableOrganizationId, host.organizationId),
      eq(roleAssignments.personId, actor.actorPersonId),
      eq(roleAssignments.organizationId, host.organizationId),
      eq(roleAssignments.siteId, host.siteId),
      eq(roleAssignments.programId, programId),
      eq(roleAssignments.roleKey, localResponsibilityRoles[responsibility]),
      lte(programResponsibilityAssignments.effectiveFrom, now),
      gt(programResponsibilityAssignments.effectiveThrough, now),
      eq(accountPersonGrants.id, actor.grantId),
      eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.active, true), eq(people.active, true),
      eq(accessAccounts.disabled, false),
      sql`${accessAccounts.emailVerifiedAt} is not null`,
    )).limit(1);
  if (!assigned) throw new AuthorizationError("effective, named local Site responsibility");
  await requireChurchHostedOperatingServices(tx, programId, ["onsite_supervision"]);
}

/** Minimal safe planning/read model for one scoped Program. No student data. */
export async function listSiteLocalDelegations(actor: AccessContext, programId: string) {
  const host = await loadHostProgram(db, programId);
  assertLocalDelegationIssuer(actor, {
    organizationId: host.organizationId, siteId: host.siteId, programId: host.id,
  });
  const configuration = await currentConfiguration(db, programId);
  const responsibilities = configuration ? await db.select({
    id: programResponsibilityAssignments.id,
    key: programResponsibilityAssignments.responsibilityKey,
    roleAssignmentId: programResponsibilityAssignments.responsibleRoleAssignmentId,
    personId: roleAssignments.personId, role: roleAssignments.roleKey,
    firstName: people.legalFirstName, lastName: people.legalLastName,
    validFrom: programResponsibilityAssignments.effectiveFrom,
    validThrough: programResponsibilityAssignments.effectiveThrough,
  }).from(programResponsibilityAssignments)
    .leftJoin(roleAssignments, eq(roleAssignments.id, programResponsibilityAssignments.responsibleRoleAssignmentId))
    .leftJoin(people, eq(people.id, roleAssignments.personId))
    .where(eq(programResponsibilityAssignments.configurationVersionId, configuration.id)) : [];
  const candidates = await db.select({
    personId: accountPersonGrants.personId, role: accountPersonGrants.role,
    firstName: people.legalFirstName, lastName: people.legalLastName,
  }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(accountPersonGrants.organizationId, host.organizationId),
      eq(accountPersonGrants.siteId, host.siteId), eq(accountPersonGrants.active, true),
      eq(people.active, true), eq(accessAccounts.disabled, false),
      sql`${accessAccounts.emailVerifiedAt} is not null`,
    )).limit(100);
  return {
    programId: host.id, programName: host.name, siteId: host.siteId,
    hasConfiguration: !!configuration,
    responsibilities: responsibilities.filter(row => row.key in localResponsibilityRoles)
      .map(row => ({ id: row.id, key: row.key as LocalResponsibility,
        personId: row.personId, personName: row.firstName && row.lastName
          ? row.firstName + " " + row.lastName : "No current assignee",
        effectiveFrom: row.validFrom?.toISOString() ?? null,
        effectiveThrough: row.validThrough?.toISOString() ?? null })),
    candidates: [...new Map(candidates.filter(row =>
      row.role === "site_leader" || row.role === "room_facilitator")
      .map(row => [row.personId + ":" + row.role, row])).values()],
  };
}
