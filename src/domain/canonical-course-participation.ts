import { AuthorizationError } from "./command-context";

/**
 * Course attempts are the single learner participation identity, independent
 * of whether the source is a school Enrollment or a noncredit Registration.
 * Never authorize from a Site, network membership, role name or client-supplied
 * learner ID alone. Read every input from the canonical database.
 */
export type CanonicalCourseAttempt = {
  id: string;
  enrollmentId: string | null;
  noncreditRegistrationId: string | null;
  deploymentId: string;
  adoptionId: string;
  offeringVersionId: string;
  courseVersionId: string;
  sectionId: string | null;
  status: "planned" | "active" | "completed" | "withdrawn";
};
export type CanonicalEnrollmentSource = {
  id: string;
  deploymentId: string;
  learnerPersonId: string;
  status: "pending" | "active" | "completed" | "withdrawn" | "cancelled";
};
export type CanonicalNoncreditSource = {
  id: string;
  deploymentId: string;
  adoptionId: string;
  offeringVersionId: string;
  participantPersonId: string;
  learnerId: string | null;
  trainingVersionId: string;
  status: "registered" | "active" | "completed" | "withdrawn" | "cancelled";
};
export type CanonicalTrainingRelease = {
  id: string;
  offeringVersionId: string;
  state: "draft" | "published";
};
export type CanonicalDeliveryAuthority = {
  deploymentId: string;
  deploymentStatus: "planning" | "review" | "authorized" | "active" | "suspended" | "closed";
  adoptionId: string;
  adoptionStatus: "proposed" | "approved" | "suspended" | "ended";
  adoptionValidFrom: Date;
  adoptionValidThrough: Date | null;
  coursePublished: boolean;
  offeringPublished: boolean;
};
export type CanonicalParticipationAccess = {
  courseAttemptId: string;
  courseVersionId: string;
  deploymentId: string;
  sectionId: string | null;
  source: "school" | "noncredit";
  participantPersonId: string;
  noncreditRegistrationId: string | null;
};

export function resolveCanonicalCourseParticipation(input: {
  actorPersonId: string | null;
  attempt: CanonicalCourseAttempt | null;
  enrollment?: CanonicalEnrollmentSource | null;
  registration?: CanonicalNoncreditSource | null;
  training?: CanonicalTrainingRelease | null;
  authority: CanonicalDeliveryAuthority | null;
  now: Date;
  allowCompletedHistory?: boolean;
}): CanonicalParticipationAccess {
  const { actorPersonId, attempt, authority, now, allowCompletedHistory = false } = input;
  const deny = (): never => { throw new AuthorizationError("current learner course participation"); };
  if (!actorPersonId || !attempt || !authority || !Number.isFinite(now.getTime())) return deny();
  if (attempt.status !== "active" && !(allowCompletedHistory && attempt.status === "completed")) return deny();
  if (authority.deploymentId !== attempt.deploymentId ||
      !["authorized", "active"].includes(authority.deploymentStatus) ||
      authority.adoptionId !== attempt.adoptionId ||
      authority.adoptionStatus !== "approved" ||
      !authority.coursePublished || !authority.offeringPublished ||
      !Number.isFinite(authority.adoptionValidFrom.getTime()) ||
      authority.adoptionValidFrom > now ||
      (authority.adoptionValidThrough !== null &&
       (!Number.isFinite(authority.adoptionValidThrough.getTime()) || authority.adoptionValidThrough <= now))) return deny();
  if (Boolean(attempt.enrollmentId) === Boolean(attempt.noncreditRegistrationId)) return deny();

  if (attempt.enrollmentId) {
    const enrollment = input.enrollment;
    if (!enrollment || enrollment.id !== attempt.enrollmentId ||
        enrollment.deploymentId !== attempt.deploymentId ||
        enrollment.learnerPersonId !== actorPersonId ||
        (enrollment.status !== "active" && !(allowCompletedHistory && enrollment.status === "completed"))) return deny();
    return {
      courseAttemptId: attempt.id, courseVersionId: attempt.courseVersionId,
      deploymentId: attempt.deploymentId, sectionId: attempt.sectionId,
      source: "school", participantPersonId: actorPersonId, noncreditRegistrationId: null,
    };
  }

  const registration = input.registration;
  const training = input.training;
  if (attempt.sectionId !== null || !registration || !training ||
      registration.id !== attempt.noncreditRegistrationId ||
      registration.deploymentId !== attempt.deploymentId ||
      registration.adoptionId !== attempt.adoptionId ||
      registration.offeringVersionId !== attempt.offeringVersionId ||
      registration.participantPersonId !== actorPersonId ||
      (registration.status !== "registered" && registration.status !== "active" &&
       !(allowCompletedHistory && registration.status === "completed")) ||
      training.id !== registration.trainingVersionId ||
      training.offeringVersionId !== attempt.offeringVersionId ||
      training.state !== "published") return deny();
  return {
    courseAttemptId: attempt.id, courseVersionId: attempt.courseVersionId,
    deploymentId: attempt.deploymentId, sectionId: null,
    source: "noncredit", participantPersonId: actorPersonId,
    noncreditRegistrationId: registration.id,
  };
}
