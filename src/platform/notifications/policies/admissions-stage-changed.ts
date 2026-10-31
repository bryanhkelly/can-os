import { eq } from "drizzle-orm";
import {
  applications,
  guardianRelationships,
  people,
  studentProfiles,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import type {
  DomainEventRecord,
  NotificationPlan,
  NotificationPolicy,
  PolicyTx,
} from "@/platform/notifications/policy";

/**
 * Policy for EventTypes.AdmissionsStageChanged: the applicant's guardians
 * with verified enrollment authority are notified of the stage decision.
 * Recipient resolution mirrors the admission-offer flow — a boolean
 * relationship flag is not proof of verified authority, so the shared
 * guardianRelationshipPredicate enrollment predicate applies. The event is
 * skipped when the application aggregate is gone.
 */
export type AdmissionsStageChangedContext = {
  applicationId: string;
  programId: string;
  stage: string;
  decision: string | null;
  fromStage: string | null;
  studentPersonId: string;
  studentName: string;
  guardianPersonIds: string[];
};

function decisionCopy(context: AdmissionsStageChangedContext): { title: string; body: string } {
  switch (context.decision) {
    case "accept":
      return {
        title: `${context.studentName}'s application was accepted`,
        body: "An enrollment offer is being prepared. Review it under Admission offers.",
      };
    case "decline":
      return {
        title: `${context.studentName}'s application was declined`,
        body: "The school declined this application. Open the application workspace for details.",
      };
    case "withdraw":
      return {
        title: `${context.studentName}'s application was withdrawn`,
        body: "This application is no longer active. Open the application workspace for details.",
      };
    case "waitlist":
      return {
        title: `${context.studentName}'s application was waitlisted`,
        body: "The school placed this application on the waitlist. Open the application workspace for details.",
      };
    default:
      return {
        title: `Admissions update for ${context.studentName}`,
        body: context.fromStage && context.fromStage !== context.stage
          ? `The application moved from ${context.fromStage.replaceAll("_", " ")} to ${context.stage.replaceAll("_", " ")}.`
          : "The application status was updated. Open the application workspace for details.",
      };
  }
}

export const admissionsStageChangedPolicy: NotificationPolicy<AdmissionsStageChangedContext> = {
  eventType: EventTypes.AdmissionsStageChanged,

  async load(tx: PolicyTx, event: DomainEventRecord) {
    if (event.aggregateType !== "application") return null;

    const [record] = await tx
      .select({
        applicationId: applications.id,
        programId: applications.programId,
        stage: applications.stage,
        studentPersonId: studentProfiles.personId,
        studentPreferredName: people.preferredName,
        studentLegalFirstName: people.legalFirstName,
      })
      .from(applications)
      .innerJoin(studentProfiles, eq(studentProfiles.id, applications.studentProfileId))
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .where(eq(applications.id, event.aggregateId))
      .limit(1);

    if (!record) return null;

    const guardians = await tx
      .select({ personId: guardianRelationships.guardianPersonId })
      .from(guardianRelationships)
      .where(
        guardianRelationshipPredicate({
          studentPersonId: record.studentPersonId,
          access: "enrollment",
        }),
      );

    const payload = (event.payload ?? {}) as Record<string, unknown>;

    return {
      applicationId: record.applicationId,
      programId: record.programId,
      stage: record.stage,
      decision: typeof payload.decision === "string" ? payload.decision : null,
      fromStage: typeof payload.from === "string" ? payload.from : null,
      studentPersonId: record.studentPersonId,
      studentName: record.studentPreferredName ?? record.studentLegalFirstName,
      guardianPersonIds: guardians.map((row) => row.personId),
    };
  },

  plans(context: AdmissionsStageChangedContext): NotificationPlan[] {
    const copy = decisionCopy(context);
    return [...new Set(context.guardianPersonIds)].map((recipientPersonId) => ({
      recipientPersonId,
      type: "admissions_stage_changed",
      title: copy.title,
      body: copy.body,
      resourceType: "application",
      resourceId: context.applicationId,
    }));
  },
};
