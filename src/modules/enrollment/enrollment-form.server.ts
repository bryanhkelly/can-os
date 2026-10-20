import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { guardianRelationships, journeyRequirements, journeys } from "@/db/schema";
import { enrollmentFormAnswersSchema, enrollmentFormState, validateEnrollmentFormAnswers, type EnrollmentForm,
  type EnrollmentFormAnswers } from "@/domain/enrollment-form";
import { EventTypes } from "@/domain/event-types";
import { recordAudit, type Actor } from "@/modules/identity/actors.server";
import { emitEvent, notifyMany } from "@/platform/mutation";
import { authorizeEnrollmentApplication } from "./enrollment-access.server";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const enrollmentFormRevision = (form: EnrollmentForm) => digest(form);

async function lockedRequirement(tx: Transaction, applicationId: string, requirementId: string) {
  const [journey] = await tx.select().from(journeys).where(and(
    eq(journeys.participantType, "application"), eq(journeys.participantId, applicationId))).for("update").limit(1);
  if (!journey || ["active", "complete", "cancelled"].includes(journey.status))
    throw new Error("Enrollment journey is closed or unavailable.");
  const [requirement] = await tx.select().from(journeyRequirements).where(and(
    eq(journeyRequirements.id, requirementId), eq(journeyRequirements.journeyId, journey.id))).for("update").limit(1);
  if (!requirement) throw new Error("Requirement does not belong to this application.");
  const state = enrollmentFormState(requirement.metadata, requirement.evidence);
  if (!state) throw new Error("This requirement has no configured enrollment form.");
  return { journey, requirement, state };
}

export async function signEnrollmentForm(actor: Actor, input: {
  applicationId: string; requirementId: string; requestId: string; formRevision: string;
  answers: EnrollmentFormAnswers; signerName: string;
}) {
  if (actor.role !== "guardian") throw new Error("A managing guardian must sign this form.");
  return db.transaction(async tx => {
    const app = await authorizeEnrollmentApplication(actor, input.applicationId, tx);
    if (["withdrawn", "declined"].includes(app.stage)) throw new Error("This application is closed.");
    const { journey, requirement, state } = await lockedRequirement(tx, app.id, input.requirementId);
    if (enrollmentFormRevision(state.form) !== input.formRevision) throw new Error("This form changed. Reload and review before signing.");
    const answers = validateEnrollmentFormAnswers(state.form, input.answers);
    const retry = requirement.evidence.find(item => item.kind === "enrollment_form_submission" && item.id === input.requestId);
    if (retry) {
      if (retry.signerPersonId !== actor.actorPersonId || retry.signerName !== input.signerName ||
          retry.formRevision !== input.formRevision ||
          digest(validateEnrollmentFormAnswers(state.form, enrollmentFormAnswersSchema.parse(retry.answers))) !== digest(answers))
        throw new Error("This signature request was already used with different input.");
      return { submissionId: input.requestId };
    }
    if (requirement.status === "complete" || state.review?.status === "accepted")
      throw new Error("This form has already been approved. Contact admissions for further changes.");
    if (state.submission && !state.review) throw new Error("Your signed form is awaiting registrar review.");
    const submission = { kind: "enrollment_form_submission", id: input.requestId, formRevision: input.formRevision,
      form: state.form, answers, signerPersonId: actor.actorPersonId, signerName: input.signerName,
      signedAt: new Date().toISOString() };
    await tx.update(journeyRequirements).set({ status: "needs_can", completedAt: null, updatedAt: new Date(),
      evidence: [...requirement.evidence, submission] }).where(eq(journeyRequirements.id, requirement.id));
    await tx.update(journeys).set({ status: "in_progress", completedAt: null, updatedAt: new Date() }).where(eq(journeys.id, journey.id));
    await recordAudit(tx, actor, { action: "enrollment.form.sign", resourceType: "journey_requirement",
      resourceId: requirement.id, before: { status: requirement.status },
      after: { status: "needs_can", submissionId: submission.id, formRevision: input.formRevision, submissionDigest: digest(submission) },
      scope: { applicationId: app.id, programId: app.programId } });
    await emitEvent(tx, { eventType: EventTypes.EnrollmentFormSigned, aggregateType: "journey_requirement",
      aggregateId: requirement.id, actorPersonId: actor.actorPersonId, organizationId: app.organizationId,
      siteId: app.siteId, programId: app.programId, payload: { applicationId: app.id, submissionId: submission.id } });
    return { submissionId: submission.id };
  });
}

export async function reviewEnrollmentForm(actor: Actor, input: {
  applicationId: string; requirementId: string; submissionId: string; status: "accepted" | "rejected"; reason: string;
}) {
  if (actor.role !== "registrar") throw new Error("Registrar review is required for enrollment forms.");
  return db.transaction(async tx => {
    const app = await authorizeEnrollmentApplication(actor, input.applicationId, tx);
    if (["withdrawn", "declined"].includes(app.stage)) throw new Error("This application is closed.");
    const { journey, requirement, state } = await lockedRequirement(tx, app.id, input.requirementId);
    if (!state.submission || state.submission.id !== input.submissionId)
      throw new Error("This submission changed. Reload before reviewing.");
    if (state.review) {
      if (state.review.status !== input.status || state.review.reason !== input.reason)
        throw new Error("This submission already has a different review. Corrections require a new signature.");
      return { saved: true };
    }
    if (state.submission.formRevision !== enrollmentFormRevision(state.form))
      throw new Error("The signed form no longer matches this requirement.");
    const guardians = await tx.select({ personId: guardianRelationships.guardianPersonId }).from(guardianRelationships)
      .where(and(eq(guardianRelationships.studentPersonId, app.studentPersonId),
        eq(guardianRelationships.canManageEnrollment, true))).for("share");
    if (input.status === "accepted" && !guardians.some(guardian => guardian.personId === state.submission?.signerPersonId))
      throw new Error("The signer is no longer authorized to manage enrollment. Request a new signature.");
    const now = new Date(), status = input.status === "accepted" ? "complete" : "needs_you";
    const review = { kind: "enrollment_form_review", submissionId: input.submissionId, status: input.status,
      reason: input.reason, reviewerPersonId: actor.actorPersonId, reviewedAt: now.toISOString() };
    await tx.update(journeyRequirements).set({ status, completedAt: status === "complete" ? now : null,
      evidence: [...requirement.evidence, review], updatedAt: now }).where(eq(journeyRequirements.id, requirement.id));
    const requirements = await tx.select({ blocking: journeyRequirements.blocking, status: journeyRequirements.status })
      .from(journeyRequirements).where(eq(journeyRequirements.journeyId, journey.id));
    const ready = requirements.every(item => !item.blocking || item.status === "complete");
    await tx.update(journeys).set({ status: ready ? "ready" : "in_progress", updatedAt: now }).where(eq(journeys.id, journey.id));
    await recordAudit(tx, actor, { action: "enrollment.form.review", resourceType: "journey_requirement",
      resourceId: requirement.id, before: { status: requirement.status },
      after: { status, submissionId: input.submissionId, decision: input.status, reviewDigest: digest(review) },
      scope: { applicationId: app.id, programId: app.programId } });
    await emitEvent(tx, { eventType: EventTypes.EnrollmentFormReviewed, aggregateType: "journey_requirement",
      aggregateId: requirement.id, actorPersonId: actor.actorPersonId, organizationId: app.organizationId,
      siteId: app.siteId, programId: app.programId,
      payload: { applicationId: app.id, submissionId: input.submissionId, status: input.status } });
    if (input.status === "rejected" && guardians.length) await notifyMany(tx, [...new Set(guardians.map(guardian => guardian.personId))]
      .map(recipientPersonId => ({ recipientPersonId, type: "enrollment_form_rejected", status: "unread" as const,
        title: "Enrollment form needs correction", body: "Review the school instructions and sign the corrected enrollment form.",
        resourceType: "application", resourceId: app.id })));
    return { saved: true };
  });
}
