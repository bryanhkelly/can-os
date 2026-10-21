import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, applications, guardianRelationships, householdMemberships, households, people, programs, studentProfiles } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { publicIntakeProgram, publicIntakePrograms } from "./public-intake.server";
import { createProspectiveStudent } from "./prospective-student.server";
import { applicationGrades, applicationPacketProgress, familyApplicationDetails, readApplicationPacket } from "@/domain/application-packet";
import { syncApplicationPacketJourney } from "./application-packet.server";

const uuid = z.string().uuid();
export { applicationGrades, familyApplicationDetails } from "@/domain/application-packet";
const draftInput = familyApplicationDetails.extend({
  programId: uuid, requestId: uuid, applicationId: uuid.optional(),
  expectedVersion: z.number().int().min(1).optional(),
}).strict();

async function applicant() {
  const actor = await getCommandContext(getRequest());
  assertCapability(actor, "enrollment.apply");
  if (!actor.actorPersonId || !["applicant", "guardian"].includes(actor.role))
    throw new AuthorizationError("family applicant identity");
  return { ...actor, actorPersonId: actor.actorPersonId };
}

export const listApplicationPrograms = createServerFn({ method: "GET" }).handler(publicIntakePrograms);

/** A verified account can opt into an open school, never acquire a guardian/staff grant. */
export const joinApplicationSchool = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ programId: uuid }).strict().parse(value))
  .handler(async ({ data }) => {
    const context = await getCommandContext(getRequest());
    if (!context.actorPersonId) throw new AuthorizationError("applicant identity");
    const actor = { ...context, actorPersonId: context.actorPersonId };
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.accountId}))`);
      const program = await publicIntakeProgram(data.programId, tx);
      const [account] = await tx.select().from(accessAccounts).where(eq(accessAccounts.id, actor.accountId)).for("share");
      if (!account || account.disabled) throw new AuthorizationError("active applicant account");
      const { isDemoAccountEmail, isDemoTenantOrganization } = await import("@/domain/local-demo-access");
      if (!isDemoAccountEmail(account.emailNormalized) && !account.emailVerifiedAt)
        throw new AuthorizationError("verified applicant email");
      if (isDemoAccountEmail(account.emailNormalized) !== isDemoTenantOrganization(program.organizationId))
        throw new AuthorizationError("applicant school environment");
      const [person] = await tx.select({ id: people.id }).from(people).where(and(
        eq(people.id, actor.actorPersonId), eq(people.active, true),
      )).for("share");
      if (!person) throw new AuthorizationError("active applicant identity");
      const [existing] = await tx.select().from(accountPersonGrants).where(and(
        eq(accountPersonGrants.accountId, actor.accountId), eq(accountPersonGrants.personId, actor.actorPersonId),
        eq(accountPersonGrants.organizationId, program.organizationId),
        program.siteId ? eq(accountPersonGrants.siteId, program.siteId) : isNull(accountPersonGrants.siteId),
        inArray(accountPersonGrants.role, ["applicant", "guardian"]),
      )).limit(1);
      if (existing) {
        if (!existing.active) throw new AuthorizationError("revoked applicant membership");
        return { grantId: existing.id };
      }
      const [grant] = await tx.insert(accountPersonGrants).values({
        accountId: actor.accountId, personId: actor.actorPersonId, role: "applicant",
        organizationId: program.organizationId, siteId: program.siteId,
      }).returning({ id: accountPersonGrants.id });
      if (!grant) throw new Error("Unable to establish applicant school membership");
      await writeAudit(tx, actor, { action: "admissions.applicant.join", entityType: "account_person_grant",
        entityId: grant.id, scope: { organizationId: program.organizationId, siteId: program.siteId }, after: { role: "applicant" } });
      await emitEvent(tx, { eventType: EventTypes.ApplicantSchoolJoined, aggregateType: "account_person_grant",
        aggregateId: grant.id, actorPersonId: actor.actorPersonId, organizationId: program.organizationId });
      return { grantId: grant.id };
    });
  });

export const listMyApplications = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await applicant();
  if (!actor.scope.programIds?.length) return [];
  const rows = await db.select({
    id: applications.id, programId: applications.programId, program: programs.name,
    stage: applications.stage, metadata: applications.metadata, submittedAt: applications.submittedAt,
    firstName: people.legalFirstName, lastName: people.legalLastName, gradeLevel: studentProfiles.gradeLevel,
    verified: guardianRelationships.canManageEnrollment,
  }).from(applications).innerJoin(programs, eq(programs.id, applications.programId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, applications.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .innerJoin(householdMemberships, and(eq(householdMemberships.householdId, applications.householdId),
      eq(householdMemberships.personId, actor.actorPersonId)))
    .innerJoin(guardianRelationships, and(eq(guardianRelationships.studentPersonId, people.id),
      eq(guardianRelationships.guardianPersonId, actor.actorPersonId)))
    .where(and(eq(applications.submittedByPersonId, actor.actorPersonId),
      inArray(applications.programId, actor.scope.programIds),
      inArray(programs.organizationId, actor.scope.organizationIds ?? []),
      inArray(programs.siteId, actor.scope.siteIds ?? []),
      sql`${applications.metadata}->>'origin' = 'family_application'`))
    .orderBy(applications.createdAt);
  return rows.map(({ metadata, submittedAt, ...row }) => ({
    ...row, submittedAt: submittedAt?.toISOString() ?? null,
    draft: metadata.applicantDraft === true, version: Number(metadata.applicantVersion),
    statement: typeof metadata.applicantStatement === "string" ? metadata.applicantStatement : "",
    packet: readApplicationPacket(metadata),
    waitlisted: metadata.admissionsDisposition === "waitlisted",
  }));
});

export const saveFamilyApplication = createServerFn({ method: "POST" })
  .validator((value: unknown) => draftInput.parse(value))
  .handler(async ({ data }) => {
    const actor = await applicant();
    if (!actor.scope.programIds?.includes(data.programId)) throw new AuthorizationError("application program");
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${actor.actorPersonId}))`);
      const program = await publicIntakeProgram(data.programId, tx);
      if (!actor.scope.organizationIds?.includes(program.organizationId) ||
        !actor.scope.siteIds?.includes(program.siteId)) throw new AuthorizationError("application school scope");
      const details = familyApplicationDetails.parse({
        studentFirstName: data.studentFirstName, studentLastName: data.studentLastName,
        gradeLevel: data.gradeLevel, statement: data.statement,
        packet: data.packet,
      });
      const grades: readonly string[] = applicationGrades;
      if (grades.indexOf(program.gradeRange.min) < 0 || grades.indexOf(program.gradeRange.max) < 0 ||
        grades.indexOf(details.gradeLevel) < grades.indexOf(program.gradeRange.min) ||
        grades.indexOf(details.gradeLevel) > grades.indexOf(program.gradeRange.max))
        throw new Error("Choose an entering grade offered by this program");
      const key = `family-application:${actor.actorPersonId}:${data.requestId}`;
      const [existing] = await tx.select().from(applications).where(
        data.applicationId ? eq(applications.id, data.applicationId) : eq(applications.idempotencyKey, key),
      ).for("update").limit(1);
      if (existing) {
        const [membership] = await tx.select({ id: householdMemberships.id }).from(householdMemberships)
          .where(and(eq(householdMemberships.householdId, existing.householdId),
            eq(householdMemberships.personId, actor.actorPersonId))).limit(1);
        if (!membership || existing.programId !== data.programId ||
          existing.submittedByPersonId !== actor.actorPersonId || existing.metadata.origin !== "family_application")
          throw new AuthorizationError("owned family application");
        if (!data.applicationId) {
          const initial = familyApplicationDetails.safeParse(existing.metadata.initialDetails);
          if (!initial.success || JSON.stringify(initial.data) !== JSON.stringify(details))
            throw new Error("Request key was already used for different application details");
          return { applicationId: existing.id, version: Number(existing.metadata.applicantVersion) };
        }
        if (existing.stage !== "inquiry" || existing.metadata.applicantDraft !== true)
          throw new Error("Submitted applications cannot be edited; contact admissions");
        if (data.expectedVersion === undefined || data.expectedVersion !== existing.metadata.applicantVersion)
          throw new Error("This draft changed in another session. Reload before saving.");
        const [student] = await tx.select().from(studentProfiles).where(eq(studentProfiles.id, existing.studentProfileId));
        if (!student) throw new Error("Student profile unavailable");
        const version = data.expectedVersion + 1;
        const packet = details.packet ?? readApplicationPacket(existing.metadata);
        await tx.update(people).set({ legalFirstName: details.studentFirstName,
          legalLastName: details.studentLastName, updatedAt: new Date() }).where(eq(people.id, student.personId));
        await tx.update(studentProfiles).set({ gradeLevel: details.gradeLevel, updatedAt: new Date() })
          .where(eq(studentProfiles.id, student.id));
        await tx.update(applications).set({ metadata: { ...existing.metadata,
          applicantStatement: details.statement, applicantVersion: version,
          ...(packet ? { applicationPacket: packet } : {}) }, updatedAt: new Date() })
          .where(eq(applications.id, existing.id));
        if (packet) await syncApplicationPacketJourney(tx, actor, {
          applicationId: existing.id, organizationId: program.organizationId, siteId: program.siteId,
          programId: program.id, packet, statement: details.statement, revision: version,
        });
        await writeAudit(tx, actor, { action: "admissions.application.draft_saved", entityType: "application",
          entityId: existing.id, scope: { programId: program.id }, before: { version: data.expectedVersion }, after: { version } });
        await emitEvent(tx, { eventType: EventTypes.ApplicationDraftSaved, aggregateType: "application",
          aggregateId: existing.id, actorPersonId: actor.actorPersonId, organizationId: program.organizationId, programId: program.id });
        return { applicationId: existing.id, version };
      }
      if (data.applicationId) throw new AuthorizationError("owned family application");
      const [duplicate] = await tx.select({ id: applications.id }).from(applications)
        .innerJoin(studentProfiles, eq(studentProfiles.id, applications.studentProfileId))
        .innerJoin(people, eq(people.id, studentProfiles.personId))
        .where(and(eq(applications.submittedByPersonId, actor.actorPersonId), eq(applications.programId, program.id),
          inArray(applications.stage, ["inquiry", "application", "eligibility", "accepted"]),
          sql`lower(${people.legalFirstName}) = lower(${details.studentFirstName})`,
          sql`lower(${people.legalLastName}) = lower(${details.studentLastName})`)).limit(1);
      if (duplicate) throw new Error("An application for this student and program already exists. Continue that application.");
      const [contact] = await tx.select().from(people).where(and(eq(people.id, actor.actorPersonId), eq(people.active, true)));
      if (!contact) throw new AuthorizationError("active applicant");
      const ownApplications = await tx.select({ householdId: applications.householdId, stage: applications.stage })
        .from(applications).innerJoin(programs, eq(programs.id, applications.programId))
        .where(and(eq(applications.submittedByPersonId, actor.actorPersonId),
          eq(programs.organizationId, program.organizationId),
          sql`${applications.metadata}->>'origin' = 'family_application'`));
      if (ownApplications.length >= 20) throw new Error("Contact admissions before creating additional applications");
      let householdId = ownApplications[0]?.householdId;
      if (householdId) {
        const [membership] = await tx.select().from(householdMemberships).where(and(
          eq(householdMemberships.householdId, householdId), eq(householdMemberships.personId, actor.actorPersonId)));
        if (!membership) throw new AuthorizationError("current household membership");
      } else {
        const [household] = await tx.insert(households).values({
          displayName: contact.legalLastName + " Household", primaryEmail: contact.email,
        }).returning({ id: households.id });
        if (!household) throw new Error("Unable to create family household");
        householdId = household.id;
        await tx.insert(householdMemberships).values({
          householdId, personId: actor.actorPersonId, relationshipLabel: "guardian", isPrimaryContact: true,
        });
      }
      const student = await createProspectiveStudent(tx, { householdId, guardianPersonId: actor.actorPersonId,
        firstName: details.studentFirstName, lastName: details.studentLastName, gradeLevel: details.gradeLevel, origin: "family_application" });
      const [application] = await tx.insert(applications).values({
        householdId, studentProfileId: student.studentProfileId, programId: program.id,
        submittedByPersonId: actor.actorPersonId, stage: "inquiry", idempotencyKey: key,
        metadata: { origin: "family_application", source: "family_online", contactPersonId: actor.actorPersonId,
          applicantDraft: true, applicantVersion: 1, applicantStatement: details.statement, initialDetails: details,
          ...(details.packet ? { applicationPacket: details.packet } : {}) },
      }).returning({ id: applications.id });
      if (!application) throw new Error("Unable to save application");
      if (details.packet) await syncApplicationPacketJourney(tx, actor, {
        applicationId: application.id, organizationId: program.organizationId, siteId: program.siteId,
        programId: program.id, packet: details.packet, statement: details.statement, revision: 1,
      });
      await writeAudit(tx, actor, { action: "admissions.application.draft_created", entityType: "application",
        entityId: application.id, scope: { organizationId: program.organizationId, programId: program.id },
        after: { studentProfileId: student.studentProfileId, householdId, version: 1 } });
      await emitEvent(tx, { eventType: EventTypes.ApplicationDraftCreated, aggregateType: "application",
        aggregateId: application.id, actorPersonId: actor.actorPersonId, organizationId: program.organizationId, programId: program.id });
      return { applicationId: application.id, version: 1 };
    });
  });

export const submitFamilyApplication = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    applicationId: uuid, expectedVersion: z.number().int().min(1), confirmed: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await applicant();
    return db.transaction(async tx => {
      const { lockAdmissionsApplication } = await import("@/domain/admissions-application-lock");
      await lockAdmissionsApplication(tx, data.applicationId);
      const [app] = await tx.select().from(applications).where(eq(applications.id, data.applicationId)).for("update");
      if (!app || app.submittedByPersonId !== actor.actorPersonId ||
        app.metadata.origin !== "family_application" || !actor.scope.programIds?.includes(app.programId))
        throw new AuthorizationError("owned family application");
      const [membership] = await tx.select().from(householdMemberships).where(and(
        eq(householdMemberships.householdId, app.householdId), eq(householdMemberships.personId, actor.actorPersonId)));
      if (!membership) throw new AuthorizationError("current applicant household");
      if (data.expectedVersion !== app.metadata.applicantVersion) throw new Error("Draft changed. Reload before submitting.");
      if (app.submittedAt) return { applicationId: app.id };
      const program = await publicIntakeProgram(app.programId, tx);
      if (!actor.scope.organizationIds?.includes(program.organizationId) ||
        !actor.scope.siteIds?.includes(program.siteId)) throw new AuthorizationError("application school scope");
      if (app.stage !== "inquiry" || app.metadata.applicantDraft !== true) throw new Error("Application is not a draft");
      if (typeof app.metadata.applicantStatement !== "string" || !app.metadata.applicantStatement.trim())
        throw new Error("Explain your interest in this program before submitting");
      const packet = readApplicationPacket(app.metadata);
      const missing = Object.values(applicationPacketProgress(packet, app.metadata.applicantStatement)).flat();
      if (!packet || missing.length) throw new Error("Complete the application packet before submitting: " + missing.join("; "));
      await syncApplicationPacketJourney(tx, actor, {
        applicationId: app.id, organizationId: program.organizationId, siteId: program.siteId,
        programId: program.id, packet, statement: app.metadata.applicantStatement, revision: data.expectedVersion,
      });
      await tx.update(applications).set({ stage: "application", submittedAt: new Date(), updatedAt: new Date(),
        metadata: { ...app.metadata, applicantDraft: false } }).where(eq(applications.id, app.id));
      await writeAudit(tx, actor, { action: "admissions.application.submitted", entityType: "application",
        entityId: app.id, scope: { organizationId: program.organizationId, programId: program.id },
        before: { stage: app.stage }, after: { stage: "application" } });
      await emitEvent(tx, { eventType: EventTypes.ApplicationSubmitted, aggregateType: "application", aggregateId: app.id,
        actorPersonId: actor.actorPersonId, organizationId: program.organizationId, programId: program.id });
      return { applicationId: app.id };
    });
  });

export const setOnlineApplications = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ programId: uuid, open: z.boolean() }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    assertCapability(actor, "enrollment.decide");
    if (actor.role !== "registrar" || !actor.scope.programIds?.includes(data.programId))
      throw new AuthorizationError("admissions program management");
    return db.transaction(async tx => {
      const [program] = await tx.select().from(programs).where(eq(programs.id, data.programId)).for("update");
      if (!program || !actor.scope.organizationIds?.includes(program.organizationId) ||
        !program.siteId || !actor.scope.siteIds?.includes(program.siteId))
        throw new AuthorizationError("admissions school scope");
      if (data.open && program.status !== "active") throw new Error("Only active programs may accept applications");
      if ((program.metadata.admissionsOpen === true) === data.open) return { open: data.open };
      await tx.update(programs).set({ metadata: { ...program.metadata, admissionsOpen: data.open }, updatedAt: new Date() })
        .where(eq(programs.id, program.id));
      await writeAudit(tx, actor, { action: "admissions.online_intake.configure", entityType: "program",
        entityId: program.id, scope: { organizationId: program.organizationId, siteId: program.siteId },
        before: { open: program.metadata.admissionsOpen === true }, after: { open: data.open } });
      await emitEvent(tx, { eventType: EventTypes.OnlineApplicationsConfigured, aggregateType: "program",
        aggregateId: program.id, actorPersonId: actor.actorPersonId, organizationId: program.organizationId, payload: { open: data.open } });
      return { open: data.open };
    });
  });
