import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, people, programResponsibilityAssignments,
  organizations, programs, roleAssignments, schoolConfigurationVersions, sites,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import {
  assertLocalDelegateGrant, assertLocalDelegationIssuer, delegationExpiration,
  localResponsibilityRoles, type LocalResponsibility,
} from "@/domain/site-local-delegation-policy";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { activeRoleAssignmentPredicate } from "@/modules/identity/role-assignment-state.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
type Reader = Pick<typeof db, "select">;

async function loadHostProgram(tx: Reader, programId: string) {
  const [program] = await tx.select({
    id: programs.id, siteId: programs.siteId,
    organizationId: programs.organizationId,
    hostOrganizationId: programs.hostOrganizationId,
    academicProviderOrganizationId: programs.academicProviderOrganizationId,
    deliveryModel: programs.deliveryModel, gradeRange: programs.gradeRange,
    name: programs.name,
  }).from(programs).where(eq(programs.id, programId)).limit(1);
  if (!program?.siteId || !program.deliveryModel.onsite)
    throw new AuthorizationError("existing onsite Program");
  const [site] = await tx.select({ id: sites.id, organizationId: sites.organizationId })
    .from(sites).where(eq(sites.id, program.siteId)).limit(1);
  if (!site || site.organizationId !== program.organizationId ||
      (program.hostOrganizationId ?? program.organizationId) !== site.organizationId)
    throw new AuthorizationError("Site-owned host Program");
  const [hostOrg] = await tx.select({type: organizations.type}).from(organizations)
    .where(eq(organizations.id, site.organizationId)).limit(1);
  if (!hostOrg) throw new AuthorizationError("existing host organization");
  return { ...program, siteId: site.id, organizationId: site.organizationId,
    // Existing same-organization school day flows retain their original
    // named-duty checks. Strict new delegation applies to independent
    // church Site + CAN institution arrangements (GF-B).
    requiresDelegation: hostOrg.type === "church" &&
      program.academicProviderOrganizationId !== site.organizationId,
  };
}

/** Other school models retain their established site-staff grant semantics. */
export async function requiresIndependentChurchLocalDelegation(
  tx: Reader, programId: string,
): Promise<boolean> {
  return (await loadHostProgram(tx, programId)).requiresDelegation;
}

async function currentConfiguration(tx: Reader, programId: string) {
  const [configuration] = await tx.select({
    id: schoolConfigurationVersions.id, version: schoolConfigurationVersions.version,
  }).from(schoolConfigurationVersions)
    .where(eq(schoolConfigurationVersions.programId, programId))
    .orderBy(desc(schoolConfigurationVersions.version)).limit(1);
  return configuration ?? null;
}

/** Current named local director with an effective appointment, live Site grant
 * and a verified, enabled account. This is an escalation target, not authority
 * to supervise a block. Keep safety reporting possible after agreement expiry.
 */
export async function currentSiteDirectorPersonId(
  tx: Reader, programId: string, at = new Date(),
): Promise<string | null> {
  const configuration = await currentConfiguration(tx, programId);
  if (!configuration) return null;
  const [director] = await tx.select({ personId: roleAssignments.personId })
    .from(programResponsibilityAssignments)
    .innerJoin(roleAssignments, eq(roleAssignments.id, programResponsibilityAssignments.responsibleRoleAssignmentId))
    .innerJoin(programs, eq(programs.id, programId))
    .innerJoin(sites, and(eq(sites.id, programs.siteId),
      eq(sites.organizationId, programs.organizationId)))
    .innerJoin(accountPersonGrants, and(
      eq(accountPersonGrants.personId, roleAssignments.personId),
      eq(accountPersonGrants.role, roleAssignments.roleKey),
      eq(accountPersonGrants.organizationId, sites.organizationId),
      eq(accountPersonGrants.siteId, sites.id),
    ))
    .innerJoin(people, eq(people.id, roleAssignments.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(
      eq(programResponsibilityAssignments.configurationVersionId, configuration.id),
      eq(programResponsibilityAssignments.responsibilityKey, "site_director"),
      eq(programResponsibilityAssignments.accountableOrganizationId, sites.organizationId),
      eq(roleAssignments.programId, programId),
      eq(roleAssignments.organizationId, sites.organizationId),
      eq(roleAssignments.siteId, sites.id),
      eq(roleAssignments.roleKey, "site_leader"),
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify(["onsite.attendance.record"])}::jsonb`,
      lte(programResponsibilityAssignments.effectiveFrom, at),
      gt(programResponsibilityAssignments.effectiveThrough, at),
      eq(accountPersonGrants.active, true), eq(people.active, true),
      eq(accessAccounts.disabled, false),
      sql`${accessAccounts.emailVerifiedAt} is not null`,
    )).limit(1);
  return director?.personId ?? null;
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
    if (host.requiresDelegation && input.responsibility === "room_facilitator" &&
        input.action === "appoint")
      throw new AuthorizationError("Use named, Section-specific facilitator appointments for church/CAN schools");
    // Serializes concurrent appointees and revocation with the same Program.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"local-site-delegation:" + host.id}))`);
    let config = await currentConfiguration(tx, host.id);
    // Revocation is available even if CAN services are suspended or the
    // configuration has disappeared. Never require a live agreement to revoke.
    if (input.action === "appoint") {
      await requireChurchHostedOperatingServices(tx, host.id, ["onsite_supervision"]);
      if (!config) {
        // A planning record is NOT an approved operating configuration,
        // contract, child-safety signoff, or opening entitlement.
        const [draft] = await tx.insert(schoolConfigurationVersions).values({
          programId: host.id, version: 1, deploymentModel: "church_hosted_site",
          status: "draft",
          config: {
            grades: host.gradeRange,
            delivery: {
              onsite: host.deliveryModel.onsite === true,
              asynchronous: host.deliveryModel.asynchronous === true,
              liveOnline: host.deliveryModel.liveOnline === true,
              ...(host.deliveryModel.onsiteDaysPerWeek
                ? { onsiteDaysPerWeek: host.deliveryModel.onsiteDaysPerWeek } : {}),
            },
            services: ["onsite_supervision"],
          },
        }).returning({ id: schoolConfigurationVersions.id, version: schoolConfigurationVersions.version });
        if (!draft) throw new Error("Cannot create a local school planning configuration");
        config = draft;
      }
    }
    if (!config) return { changed: false, responsibility: input.responsibility, assignmentId: null };
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
      // The duty's role row is retained as compliance evidence but must stop
      // projecting as a live assignment (same treatment as CAN staff revocation).
      if (current.responsibleRoleAssignmentId) {
        const [dutyRole] = await tx.select({
          id: roleAssignments.id, metadata: roleAssignments.metadata,
        }).from(roleAssignments)
          .where(eq(roleAssignments.id, current.responsibleRoleAssignmentId)).limit(1);
        if (dutyRole && dutyRole.metadata?.origin === "local_site_delegation" &&
            !dutyRole.metadata?.revokedAt) {
          await tx.update(roleAssignments).set({
            capabilities: [],
            metadata: { ...dutyRole.metadata, revokedAt: now.toISOString(),
              revocationReason: `Local site responsibility "${key}" revoked`,
              revokedByPersonId: actor.actorPersonId },
            updatedAt: now,
          }).where(eq(roleAssignments.id, dutyRole.id));
        }
      }
      await writeAudit(tx, actor, {
        action: "site.local_responsibility.revoked",
        entityType: "program_responsibility_assignment", entityId: current.id,
        scope: { organizationId: host.organizationId, siteId: host.siteId, programId: host.id },
        before: { responsibility: key, roleAssignmentId: current.responsibleRoleAssignmentId },
        after: { responsibility: key, effectiveThrough: now.toISOString() },
      });
      await emitEvent(tx, {
        eventType: EventTypes.LocalSiteResponsibilityRevoked, aggregateType: "program_responsibility_assignment",
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
    // Re-appointment restores the retained, soft-revoked duty row with its
    // original id instead of accumulating duplicate historical rows.
    const [revokedRole] = await tx.select({
      id: roleAssignments.id, metadata: roleAssignments.metadata,
    }).from(roleAssignments).where(and(
      eq(roleAssignments.personId, input.personId),
      eq(roleAssignments.organizationId, host.organizationId),
      eq(roleAssignments.siteId, host.siteId),
      eq(roleAssignments.programId, host.id),
      eq(roleAssignments.roleKey, requiredRole),
      sql`${roleAssignments.metadata}->>'origin' = 'local_site_delegation'`,
      sql`${roleAssignments.metadata}->>'responsibility' = ${key}`,
      sql`${roleAssignments.metadata}->>'revokedAt' is not null`,
    )).orderBy(desc(roleAssignments.updatedAt)).limit(1);
    let role: { id: string };
    if (revokedRole) {
      const [restored] = await tx.update(roleAssignments).set({
        // Responsibility alone MUST NOT mint academic privileges or new account grants.
        capabilities: ["onsite.attendance.record"],
        metadata: { ...revokedRole.metadata, expiresAt: expires.toISOString(),
          revokedAt: null, revocationReason: null, revokedByPersonId: null },
        updatedAt: now,
      }).where(eq(roleAssignments.id, revokedRole.id)).returning({ id: roleAssignments.id });
      if (!restored) throw new Error("Cannot restore named local staff assignment");
      role = restored;
    } else {
      const [created] = await tx.insert(roleAssignments).values({
        personId: input.personId, organizationId: host.organizationId,
        siteId: host.siteId, programId: host.id, roleKey: requiredRole,
        // Responsibility alone MUST NOT mint academic privileges or new account grants.
        capabilities: ["onsite.attendance.record"],
        metadata: { origin: "local_site_delegation", responsibility: key,
          expiresAt: expires.toISOString() },
      }).returning({ id: roleAssignments.id });
      if (!created) throw new Error("Cannot record named local staff assignment");
      role = created;
    }

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
      eventType: EventTypes.LocalSiteResponsibilityAppointed, aggregateType: "program_responsibility_assignment",
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
  if (actor.sessionAccountId || !actor.actorPersonId ||
      actor.role !== localResponsibilityRoles[responsibility] ||
      actor.grantSiteId !== host.siteId ||
      !actor.scope.organizationIds?.includes(host.organizationId) ||
      !actor.scope.programIds?.includes(programId)) {
    throw new AuthorizationError("verified Program and local Site duty scope");
  }
  if (!host.requiresDelegation) return;
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
      activeRoleAssignmentPredicate(),
      sql`${roleAssignments.capabilities} @> ${JSON.stringify(["onsite.attendance.record"])}::jsonb`,
      sql`${roleAssignments.metadata}->>'origin' = 'local_site_delegation'`,
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
