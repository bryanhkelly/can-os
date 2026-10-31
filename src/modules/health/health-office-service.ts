import { db } from "@/db/client";
import {
accessAccounts,
accountPersonGrants,
guardianRelationships,
enrollments,
people,
programs,
healthComplianceItems,
healthOfficeVisits,
healthProfiles,
medicationAdministrations,
medicationAuthorizations,
returnToSchoolClearances,
studentProfiles
} from "@/db/schema";
import {
assertCapability,
assertSiteScope,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { emitEvent,notifyMany,writeAudit } from "@/platform/mutation";
import { and,eq,inArray,isNull,or } from "drizzle-orm";
import { AuthorizationError } from "@/domain/command-context";

type HealthTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Medical authority is student + active Program + real Site, never a bare role. */
async function assertCurrentHealthStudentScope(
  tx: HealthTx, context: CommandContext, studentProfileId: string, siteId?: string,
) {
  if (!context.actorPersonId || !context.scope.siteIds?.length ||
      !context.scope.programIds?.length || !context.scope.organizationIds?.length)
    throw new AuthorizationError("current school medical membership");
  if (siteId && !context.scope.siteIds.includes(siteId))
    throw new AuthorizationError("school health Site");
  const [match] = await tx.select({siteId:programs.siteId}).from(enrollments)
    .innerJoin(programs,eq(programs.id,enrollments.programId))
    .where(and(
      eq(enrollments.studentProfileId,studentProfileId),
      eq(enrollments.kind,"program"),eq(enrollments.status,"active"),
      eq(programs.status,"active"),
      inArray(programs.id,context.scope.programIds),
      inArray(programs.siteId,context.scope.siteIds),
      inArray(programs.organizationId,context.scope.organizationIds),
      ...(siteId?[eq(programs.siteId,siteId)]:[]),
    )).limit(1);
  if(!match)throw new AuthorizationError("current student enrollment at authorized health Site");
  return match.siteId;
}


export async function ensureHealthProfile(
  context: CommandContext,
  studentProfileId: string,
): Promise<string> {
  assertCapability(context, "health.manage");

  return db.transaction(async (tx) => {
    await assertCurrentHealthStudentScope(tx, context, studentProfileId);
    const [existing] = await tx
      .select({ id: healthProfiles.id })
      .from(healthProfiles)
      .where(eq(healthProfiles.studentProfileId, studentProfileId))
      .limit(1);

    if (existing) return existing.id;

    const [profile] = await tx
      .insert(healthProfiles)
      .values({
        studentProfileId,
        classification: "medical",
      })
      .returning({ id: healthProfiles.id });

    if (!profile) throw new Error("Failed to create HealthProfile");
    return profile.id;
  });
}

export async function setHealthCompliance(
  context: CommandContext,
  input: {
    studentProfileId: string;
    type: string;
    status: "missing" | "pending_review" | "compliant" | "expired" | "waived";
    dueOn?: string;
    expiresOn?: string;
    documentId?: string;
    notes?: string;
  },
): Promise<string> {
  assertCapability(context, "health.compliance.manage");

  return db.transaction(async (tx) => {
    await assertCurrentHealthStudentScope(tx, context, input.studentProfileId);
    const [existing] = await tx
      .select({ id: healthComplianceItems.id, status: healthComplianceItems.status })
      .from(healthComplianceItems)
      .where(
        and(
          eq(healthComplianceItems.studentProfileId, input.studentProfileId),
          eq(healthComplianceItems.type, input.type),
        ),
      )
      .limit(1);

    const reviewedAt =
      input.status === "compliant" || input.status === "waived"
        ? new Date()
        : undefined;

    let id: string;

    if (existing) {
      await tx
        .update(healthComplianceItems)
        .set({
          status: input.status,
          dueOn: input.dueOn,
          expiresOn: input.expiresOn,
          documentId: input.documentId,
          reviewedByPersonId: reviewedAt ? context.actorPersonId : null,
          reviewedAt,
          notes: input.notes,
          updatedAt: new Date(),
        })
        .where(eq(healthComplianceItems.id, existing.id));
      id = existing.id;
    } else {
      const [created] = await tx
        .insert(healthComplianceItems)
        .values({
          studentProfileId: input.studentProfileId,
          type: input.type,
          status: input.status,
          dueOn: input.dueOn,
          expiresOn: input.expiresOn,
          documentId: input.documentId,
          reviewedByPersonId: reviewedAt ? context.actorPersonId : undefined,
          reviewedAt,
          notes: input.notes,
        })
        .returning({ id: healthComplianceItems.id });

      if (!created) throw new Error("Failed to create Health compliance item");
      id = created.id;
    }

    await emitEvent(tx, {
      eventType: EventTypes.HealthComplianceUpdated,
      aggregateType: "health_compliance_item",
      aggregateId: id,
      actorPersonId: context.actorPersonId,
      payload: {
        studentProfileId: input.studentProfileId,
        type: input.type,
        status: input.status,
      },
    });

    await writeAudit(tx, context, {
      action: "health.compliance.update",
      entityType: "health_compliance_item",
      entityId: id,
      before: existing ? { status: existing.status } : null,
      after: { status: input.status, type: input.type },
      contextExtras: { classification: "medical" },
    });

    return id;
  });
}

export async function createMedicationAuthorization(
  context: CommandContext,
  input: {
    studentProfileId: string;
    medicationName: string;
    instructions: string;
    startsOn: string;
    expiresOn?: string;
    authorizationDocumentId?: string;
    guardianConsentDocumentId?: string;
    emergencyOnly?: boolean;
  },
): Promise<string> {
  assertCapability(context, "medication.authorization.manage");
  if (input.expiresOn && input.expiresOn < input.startsOn) {
    throw new Error("Medication authorization expiry must be after start");
  }

  return db.transaction(async tx => {
    await assertCurrentHealthStudentScope(tx, context, input.studentProfileId);
    const [authorization] = await tx.insert(medicationAuthorizations)
      .values({
        studentProfileId: input.studentProfileId,
        medicationName: input.medicationName,
        instructions: input.instructions,
        status: "active",
        startsOn: input.startsOn,
        expiresOn: input.expiresOn,
        authorizationDocumentId: input.authorizationDocumentId,
        guardianConsentDocumentId: input.guardianConsentDocumentId,
        emergencyOnly: input.emergencyOnly ?? false,
      }).returning({ id: medicationAuthorizations.id });
    if (!authorization) throw new Error("Failed to create medication authorization");
    await writeAudit(tx, context, {
      action: "medication.authorization.create",
      entityType: "medication_authorization",
      entityId: authorization.id,
      after: {
        studentProfileId: input.studentProfileId,
        medicationName: input.medicationName,
        startsOn: input.startsOn,
        expiresOn: input.expiresOn ?? null,
      },
      contextExtras: { classification: "medical" },
    });
    return authorization.id;
  });
}

export async function administerMedication(
  context: CommandContext,
  input: {
    authorizationId: string;
    siteId: string;
    dose?: string;
    result?: "administered" | "refused" | "held" | "missed";
    notes?: string;
    administeredAt?: Date;
  },
): Promise<string> {
  assertCapability(context, "medication.administer");
  assertSiteScope(context, input.siteId);
  if (!context.actorPersonId) throw new Error("Medication administrator is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [authorization] = await tx
      .select()
      .from(medicationAuthorizations)
      .where(eq(medicationAuthorizations.id, input.authorizationId))
      .limit(1);

    if (!authorization) throw new Error("Medication authorization not found");
    // A valid medication authorization is not permission to administer it
    // at an unrelated campus or after the student's withdrawal.
    await assertCurrentHealthStudentScope(tx, context, authorization.studentProfileId, input.siteId);
    if (authorization.status !== "active") {
      throw new Error("Medication authorization is not active");
    }

    const administeredAt = input.administeredAt ?? new Date();
    const administeredOn = administeredAt.toISOString().slice(0, 10);

    if (administeredOn < authorization.startsOn) {
      throw new Error("Medication authorization has not started");
    }
    if (
      authorization.expiresOn &&
      administeredOn > authorization.expiresOn
    ) {
      throw new Error("Medication authorization has expired");
    }

    const [record] = await tx
      .insert(medicationAdministrations)
      .values({
        authorizationId: input.authorizationId,
        siteId: input.siteId,
        administeredByPersonId: actorPersonId,
        administeredAt,
        dose: input.dose,
        result: input.result ?? "administered",
        notes: input.notes,
      })
      .returning({ id: medicationAdministrations.id });

    if (!record) throw new Error("Failed to record medication administration");

    await emitEvent(tx, {
      eventType: EventTypes.MedicationAdministered,
      aggregateType: "medication_administration",
      aggregateId: record.id,
      actorPersonId,
      payload: {
        authorizationId: input.authorizationId,
        studentProfileId: authorization.studentProfileId,
        siteId: input.siteId,
        result: input.result ?? "administered",
      },
    });

    await writeAudit(tx, context, {
      action: "medication.administer",
      entityType: "medication_administration",
      entityId: record.id,
      scope: { siteId: input.siteId },
      after: {
        authorizationId: input.authorizationId,
        result: input.result ?? "administered",
      },
      contextExtras: { classification: "medical" },
    });

    return record.id;
  });
}

export async function recordHealthOfficeVisit(
  context: CommandContext,
  input: {
    studentProfileId: string;
    siteId: string;
    reason: string;
    disposition?: string;
    sentHome?: boolean;
    notes?: string;
    requireReturnClearance?: boolean;
  },
): Promise<{
  visitId: string;
  returnClearanceId?: string;
}> {
  assertCapability(context, "health.visit.manage");
  assertSiteScope(context, input.siteId);
  if (!context.actorPersonId) throw new Error("Health office actor is required");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    await assertCurrentHealthStudentScope(tx, context, input.studentProfileId, input.siteId);
    const [visit] = await tx
      .insert(healthOfficeVisits)
      .values({
        studentProfileId: input.studentProfileId,
        siteId: input.siteId,
        reason: input.reason,
        disposition: input.disposition,
        sentHome: input.sentHome ?? false,
        handledByPersonId: actorPersonId,
        notes: input.notes,
        checkedOutAt: input.sentHome ? new Date() : undefined,
      })
      .returning({ id: healthOfficeVisits.id });

    if (!visit) throw new Error("Failed to create health office visit");

    let returnClearanceId: string | undefined;

    if (input.sentHome) {
      const [student] = await tx
        .select({ personId: studentProfiles.personId })
        .from(studentProfiles)
        .where(eq(studentProfiles.id, input.studentProfileId))
        .limit(1);

      if (!student) throw new Error("StudentProfile not found");

      // Medical notifications require a CURRENT verified guardian and an
      // active Program enrollment at this health-office Site. Do not notify
      // an unverified applicant or someone whose child has transferred away.
      const guardians = await tx
        .select({ personId: guardianRelationships.guardianPersonId })
        .from(guardianRelationships)
        .innerJoin(enrollments, and(
          eq(enrollments.studentProfileId, input.studentProfileId),
          eq(enrollments.kind, "program"),
          eq(enrollments.status, "active"),
        ))
        .innerJoin(programs, and(
          eq(programs.id, enrollments.programId),
          eq(programs.siteId, input.siteId),
          eq(programs.status, "active"),
        ))
        .innerJoin(accountPersonGrants, and(
          eq(accountPersonGrants.personId,guardianRelationships.guardianPersonId),
          eq(accountPersonGrants.role,"guardian"),
          eq(accountPersonGrants.active,true),
          eq(accountPersonGrants.isSynthetic,false),
          eq(accountPersonGrants.organizationId,programs.organizationId),
          or(isNull(accountPersonGrants.siteId),eq(accountPersonGrants.siteId,input.siteId)),
        ))
        .innerJoin(accessAccounts,and(
          eq(accessAccounts.id,accountPersonGrants.accountId),
          eq(accessAccounts.disabled,false),
        ))
        .innerJoin(people,and(
          eq(people.id,guardianRelationships.guardianPersonId),
          eq(people.active,true),
        ))
        .where(guardianRelationshipPredicate({
          studentPersonId: student.personId,
          access: "enrollment",
        }));

      if (guardians.length > 0) {
        await notifyMany(
          tx,
          [...new Set(guardians.map(row => row.personId))].map(personId => ({
            recipientPersonId: personId,
            type: "student_sent_home_ill",
            title: "Health office update",
            body: input.requireReturnClearance
              ? "Your student was sent home. Return-to-school clearance is required before return."
              : "Your student was sent home by the health office.",
            resourceType: "health_office_visit",
            resourceId: visit.id,
          })),
        );
      }

      await emitEvent(tx, {
        eventType: EventTypes.StudentSentHomeIll,
        aggregateType: "health_office_visit",
        aggregateId: visit.id,
        actorPersonId,
        payload: {
          studentProfileId: input.studentProfileId,
          siteId: input.siteId,
          requireReturnClearance: input.requireReturnClearance ?? false,
        },
      });

      if (input.requireReturnClearance) {
        const [clearance] = await tx
          .insert(returnToSchoolClearances)
          .values({
            studentProfileId: input.studentProfileId,
            healthOfficeVisitId: visit.id,
            status: "required",
          })
          .returning({ id: returnToSchoolClearances.id });

        if (!clearance) throw new Error("Failed to create return clearance");
        returnClearanceId = clearance.id;
      }
    }

    await writeAudit(tx, context, {
      action: "health.visit.record",
      entityType: "health_office_visit",
      entityId: visit.id,
      scope: { siteId: input.siteId },
      after: {
        reason: input.reason,
        sentHome: input.sentHome ?? false,
      },
      contextExtras: { classification: "medical" },
    });

    return returnClearanceId
      ? { visitId: visit.id, returnClearanceId }
      : { visitId: visit.id };
  });
}

export async function clearReturnToSchool(
  context: CommandContext,
  input: {
    clearanceId: string;
    documentId?: string;
    notes?: string;
  },
): Promise<void> {
  assertCapability(context, "health.clearance.manage");
  if (!context.actorPersonId) throw new Error("Clearance actor is required");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(returnToSchoolClearances)
      .where(eq(returnToSchoolClearances.id, input.clearanceId))
      .limit(1);

    if (!current) throw new Error("Return-to-school clearance not found");
    await assertCurrentHealthStudentScope(tx, context, current.studentProfileId);
    if (current.status === "cleared") return;

    const clearedAt = new Date();

    await tx
      .update(returnToSchoolClearances)
      .set({
        status: "cleared",
        documentId: input.documentId,
        clearedByPersonId: context.actorPersonId,
        clearedAt,
        notes: input.notes,
        updatedAt: clearedAt,
      })
      .where(eq(returnToSchoolClearances.id, input.clearanceId));

    await emitEvent(tx, {
      eventType: EventTypes.ReturnToSchoolCleared,
      aggregateType: "return_to_school_clearance",
      aggregateId: input.clearanceId,
      actorPersonId: context.actorPersonId,
      payload: {
        studentProfileId: current.studentProfileId,
      },
    });

    await writeAudit(tx, context, {
      action: "health.return_clearance",
      entityType: "return_to_school_clearance",
      entityId: input.clearanceId,
      before: { status: current.status },
      after: { status: "cleared" },
      contextExtras: { classification: "medical" },
    });
  });
}

export async function getHealthCase(
  context: CommandContext,
  studentProfileId: string,
) {
  assertCapability(context, "health.read");

  return db.transaction(async (tx) => {
    await assertCurrentHealthStudentScope(tx, context, studentProfileId);
    const [profile] = await tx
      .select()
      .from(healthProfiles)
      .where(eq(healthProfiles.studentProfileId, studentProfileId))
      .limit(1);

    const [compliance, authorizations, visits, clearances] = await Promise.all([
      tx
        .select()
        .from(healthComplianceItems)
        .where(eq(healthComplianceItems.studentProfileId, studentProfileId)),
      tx
        .select()
        .from(medicationAuthorizations)
        .where(eq(medicationAuthorizations.studentProfileId, studentProfileId)),
      tx
        .select()
        .from(healthOfficeVisits)
        .where(eq(healthOfficeVisits.studentProfileId, studentProfileId)),
      tx
        .select()
        .from(returnToSchoolClearances)
        .where(eq(returnToSchoolClearances.studentProfileId, studentProfileId)),
    ]);

    await writeAudit(tx, context, {
      action: "health.read",
      entityType: "student_profile",
      entityId: studentProfileId,
      contextExtras: { classification: "medical" },
    });

    return {
      profile: profile ?? null,
      compliance,
      authorizations,
      visits,
      clearances,
    };
  });
}
