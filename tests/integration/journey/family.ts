/**
 * Family journey chain — the canonical GF22→GF2 path: a distinct verified
 * guardian starts a real application for the journey Program, the registrar
 * independently verifies the relationship, the family signs the configured
 * consent, the school issues/accepts/activates the offer, and the student is
 * placed in the journey Section. No administrative seed shortcuts: every
 * state change goes through the actual guardian/registrar commands.
 */
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { first, type JourneyTools } from "./harness";
import { createPersona, type JourneyPersona } from "./personas";
import type { JourneySchool } from "./school";

export type JourneyFamily = {
  guardian: JourneyPersona;
  applicationId: string;
  studentProfileId: string;
  studentPersonId: string;
  offerId: string;
  enrollmentId: string;
};

/** Guardian account + canonical application for the journey Program. */
export async function startJourneyFamilyApplication(
  journey: JourneyTools,
  school: JourneySchool,
  input: { key: string; studentFirstName: string; studentLastName: string; gradeLevel: string },
) {
  const guardian = await createPersona(journey.tx, {
    key: input.key,
    role: "guardian",
    organizationId: school.school.id,
    siteId: school.site.id,
    firstName: "Journey",
    lastName: "Family Guardian",
    suffix: school.suffix,
    emailVerified: true,
    programIds: [school.program.id],
  });
  const familyApplications = await import("@/modules/enrollment/guardian-family-applications.functions");
  journey.setActor(guardian.actor);
  const application = await familyApplications.startGuardianFamilyApplication({ data: {
    programId: school.program.id,
    requestId: crypto.randomUUID(),
    studentFirstName: input.studentFirstName,
    studentLastName: input.studentLastName,
    gradeLevel: input.gradeLevel,
  } });
  return { guardian, applicationId: application.applicationId };
}

/**
 * Registrar independently verifies the guardian relationship. Self-asserted
 * parenthood never authorizes enrollment forms.
 */
export async function verifyJourneyGuardian(
  journey: JourneyTools,
  school: JourneySchool,
  applicationId: string,
) {
  const { verifyAdmissionsGuardianRelationship } = await import(
    "@/modules/enrollment/admissions-intake.functions");
  journey.setActor(school.operatorScoped);
  await verifyAdmissionsGuardianRelationship({ data: {
    applicationId,
    method: "verified_school_record" as const,
    evidenceNote: "Synthetic school record independently checked for this journey family.",
  } });
}

/** Registrar review + guardian signature + registrar acceptance of the form. */
export async function completeJourneyEnrollmentRequirements(
  journey: JourneyTools,
  school: JourneySchool,
  guardian: JourneyPersona,
  applicationId: string,
) {
  const familyReadiness = await import("@/modules/enrollment/family-readiness.functions");
  const familyForms = await import("@/modules/enrollment/enrollment-form.functions");
  const familyChecklist = await import("@/modules/enrollment/guardian-enrollment-checklist.functions");
  const applicationJourney = first(await journey.tx.select().from(s.journeys).where(and(
    eq(s.journeys.participantType, "application"),
    eq(s.journeys.participantId, applicationId),
  )));
  const requirements = await journey.tx.select().from(s.journeyRequirements)
    .where(eq(s.journeyRequirements.journeyId, applicationJourney.id));
  const review = first(requirements.filter(x => x.key === "school-review"));
  const form = first(requirements.filter(x => x.key === "school-consent"));

  journey.setActor(school.operatorScoped);
  await familyReadiness.setFamilyRequirement({ data: {
    applicationId,
    requirementId: review.id,
    complete: true,
  } });

  journey.setActor(guardian.actor);
  const checklist = await familyChecklist.getGuardianEnrollmentChecklist({
    data: { applicationId },
  });
  const configured = first(checklist.requirements.filter(x => x.id === form.id));
  if (!configured.form) throw new Error("School consent form was not configured");
  const signatureId = crypto.randomUUID();
  await familyForms.submitGuardianEnrollmentForm({ data: {
    applicationId,
    requirementId: form.id,
    requestId: signatureId,
    formRevision: configured.form.revision,
    answers: { contact_plan: "Email the family guardian after school." },
    signerName: `${guardian.person.legalFirstName} ${guardian.person.legalLastName}`,
    confirmed: true as const,
  } });

  journey.setActor(school.operatorScoped);
  await familyForms.decideEnrollmentForm({ data: {
    applicationId,
    requirementId: form.id,
    submissionId: signatureId,
    status: "accepted" as const,
    reason: "Synthetic consent independently reviewed by the school.",
    confirmed: true as const,
  } });
}

/** Offer issued by the registrar, accepted by the guardian, activated, placed. */
export async function offerAcceptActivatePlace(
  journey: JourneyTools,
  school: JourneySchool,
  guardian: JourneyPersona,
  applicationId: string,
): Promise<JourneyFamily> {
  const offerCommands = await import("@/modules/enrollment/admissions-offer.functions");
  const placements = await import("@/modules/enrollment/course-placement.functions");

  journey.setActor(school.operatorScoped);
  const offer = await offerCommands.issueAdmissionOffer({ data: {
    applicationId,
    schoolYearId: school.time.schoolYear.id,
  } });
  journey.setActor(guardian.actor);
  await offerCommands.respondToAdmissionOffer({ data: {
    offerId: offer.offerId,
    decision: "accept",
  } });
  journey.setActor(school.operatorScoped);
  const activated = await offerCommands.activateOfferedEnrollment({ data: {
    offerId: offer.offerId,
  } });
  await placements.placeEnrolledStudent({ data: {
    applicationId,
    sectionId: school.section.id,
  } });

  const applicationRow = first(await journey.tx.select().from(s.applications)
    .where(eq(s.applications.id, applicationId)));
  const profile = first(await journey.tx.select().from(s.studentProfiles)
    .where(eq(s.studentProfiles.id, applicationRow.studentProfileId)));
  const sectionSeat = first(await journey.tx.select().from(s.enrollments).where(and(
    eq(s.enrollments.studentProfileId, profile.id),
    eq(s.enrollments.programId, school.program.id),
    eq(s.enrollments.kind, "section"),
    eq(s.enrollments.sectionId, school.section.id),
    eq(s.enrollments.status, "active"),
  )));
  return {
    guardian,
    applicationId,
    studentProfileId: profile.id,
    studentPersonId: profile.personId,
    offerId: offer.offerId,
    enrollmentId: activated.enrollmentId ?? sectionSeat.id,
  };
}

/** The complete family chain, composed from the steps above. */
export async function enrollJourneyFamily(
  journey: JourneyTools,
  school: JourneySchool,
  input: { key: string; studentFirstName: string; studentLastName: string; gradeLevel: string },
): Promise<JourneyFamily> {
  const { guardian, applicationId } = await startJourneyFamilyApplication(journey, school, input);
  await verifyJourneyGuardian(journey, school, applicationId);
  await completeJourneyEnrollmentRequirements(journey, school, guardian, applicationId);
  return offerAcceptActivatePlace(journey, school, guardian, applicationId);
}
