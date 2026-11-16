import {
  activityBucket, activityStatus, sortParticipation,
  type ParticipationRecord, type ParticipationStatus,
} from "./participation-read-model";

type DateValue = Date | string | null | undefined;
function iso(value: DateValue): string | null {
  if (!value) return null;
  // A date-only term is a calendar date, not midnight in the viewer timezone.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function hrefId(value: string): string { return encodeURIComponent(value); }
function state(raw: string | null | undefined): ParticipationStatus {
  if (raw === "confirmed" || raw === "accepted") return "scheduled";
  return activityStatus(raw);
}
function base(input: Omit<ParticipationRecord, "bucket">, now: Date): ParticipationRecord {
  return {...input, bucket: activityBucket(input.status, input.startAt, now)};
}

export interface SchoolSectionActivity {
  id: string; title: string; code: string;
  enrollmentId: string | null; enrollmentStatus: string | null;
}
export function projectSchoolSections(
  sections: readonly SchoolSectionActivity[], now: Date,
): ParticipationRecord[] {
  // The catalog can show Sections not taken by this student. Never project those.
  return sections.filter(section => section.enrollmentId !== null).map(section => {
    const sourceId = section.enrollmentId!;
    const status = state(section.enrollmentStatus);
    return base({
      key: "school_section:" + sourceId, source: "school_section", sourceId,
      refs: {enrollmentId: sourceId, sectionId: section.id},
      kind: "learning", status, sourceStatus: section.enrollmentStatus ?? "unknown",
      title: section.title, detail: section.code,
      organizationId: null, organizationName: null, siteId: null, siteName: null,
      subject: {kind: "self", displayName: null},
      startAt: null, endAt: null, nextAt: null,
      progress: null,
      // Enrollment completion is not a grade or a credential decision.
      outcome: status === "completed" ? {label: "Section marked completed"} : null,
      action: status === "active"
        ? {label: "Open school class", href: "/student/courses?section=" + hrefId(section.id)}
        : {label: "View course registration", href: "/student/courses?section=" + hrefId(section.id)},
    }, now);
  });
}

export interface NativeClassActivity {
  classEnrollmentId: string; classId: string; title: string; status: string;
  courseAttemptId: string | null; deliveryMode: string;
  enrolledAt: DateValue; siteId: string | null;
}
export function projectNativeClasses(
  rows: readonly NativeClassActivity[], now: Date,
  siteChoices: readonly {id: string; name: string}[] = [],
): ParticipationRecord[] {
  return rows.map(item => {
    const status = state(item.status);
    const hasLearningAccess = status === "active" && !!item.courseAttemptId;
    const siteName = siteChoices.find(site => site.id === item.siteId)?.name ?? null;
    return base({
      key: "native_class:" + item.classEnrollmentId, source: "native_class",
      sourceId: item.classEnrollmentId,
      refs: {classId: item.classId, classEnrollmentId: item.classEnrollmentId,
        ...(item.courseAttemptId ? {courseAttemptId: item.courseAttemptId} : {})},
      kind: "learning", status, sourceStatus: item.status, title: item.title,
      detail: item.deliveryMode.replaceAll("_", " "),
      organizationId: null, organizationName: null, siteId: item.siteId, siteName,
      subject: {kind: "self", displayName: null},
      startAt: null, endAt: null, nextAt: null,
      progress: null,
      outcome: status === "completed" ? {label: "Class enrollment marked completed"} : null,
      action: hasLearningAccess ? {
        label: "Open class", href: "/classes/" + hrefId(item.classId) + "?view=learn&tab=lessons",
      } : null,
    }, now);
  });
}

export interface NoncreditCourseActivity {
  registrationId: string; releaseId: string; courseAttemptId: string;
  trainingTitle: string; deliveryMode: string; siteName: string | null;
  registrationStatus: string; attemptStatus: string; registeredAt: DateValue;
  upcomingSessions: readonly {startsAt: string; endsAt: string}[];
}
export function projectNoncreditCourses(
  rows: readonly NoncreditCourseActivity[], now: Date,
): ParticipationRecord[] {
  return rows.map(row => {
    // Revoked registration governs access even if a stale attempt is still active.
    const registration = state(row.registrationStatus);
    const attempt = state(row.attemptStatus);
    const status: ParticipationStatus =
      registration === "withdrawn" || registration === "cancelled" ? registration :
      attempt === "completed" || attempt === "withdrawn" || attempt === "cancelled" ? attempt :
      attempt === "active" ? "active" : registration;
    const next = row.upcomingSessions
      .map(session => iso(session.startsAt))
      .filter((value): value is string => value !== null)
      .sort()[0] ?? null;
    return base({
      key: "noncredit_course:" + row.registrationId, source: "noncredit_course",
      sourceId: row.registrationId,
      refs: {registrationId: row.registrationId, releaseId: row.releaseId,
        courseAttemptId: row.courseAttemptId},
      kind: "learning", status,
      sourceStatus: row.registrationStatus + " / " + row.attemptStatus,
      title: row.trainingTitle,
      detail: row.deliveryMode === "facilitated" ? "Facilitated training" : "Independent online training",
      organizationId: null, organizationName: null, siteId: null,
      siteName: row.siteName,
      subject: {kind: "self", displayName: null},
      startAt: null, endAt: null, nextAt: next,
      progress: null,
      outcome: status === "completed" ? {label: "Course attempt marked completed"} : null,
      // Resume command enforces current native entitlement before a course opens.
      action: status === "active" ? {
        label: "Manage training", href: "/learn/my-courses",
      } : null,
    }, now);
  });
}

export interface FamilyEnrichmentActivity {
  id: string; studentProfileId: string; seasonId: string; status: string;
  offeringName: string; seasonName: string; startsOn: DateValue; endsOn: DateValue;
}
export interface FamilyChildActivity {
  studentProfileId: string; name: string | null; lastName: string | null;
}
export function projectFamilyEnrichment(
  registrations: readonly FamilyEnrichmentActivity[],
  children: readonly FamilyChildActivity[],
  now: Date,
): ParticipationRecord[] {
  const childNames = new Map(children.map(child =>
    [child.studentProfileId, [child.name, child.lastName].filter(Boolean).join(" ")]));
  return registrations.filter(item => childNames.has(item.studentProfileId)).map(item => {
    const status = state(item.status);
    return base({
      key: "family_enrichment:" + item.id, source: "family_enrichment", sourceId: item.id,
      refs: {registrationId: item.id, seasonId: item.seasonId,
        studentProfileId: item.studentProfileId},
      kind: "program", status, sourceStatus: item.status, title: item.offeringName,
      detail: item.seasonName,
      organizationId: null, organizationName: null, siteId: null, siteName: null,
      subject: {kind: "dependent", displayName: childNames.get(item.studentProfileId) ?? null},
      startAt: iso(item.startsOn), endAt: iso(item.endsOn), nextAt: null,
      progress: null,
      outcome: status === "completed" ? {label: "Registration marked completed"} : null,
      action: {label: "Manage family program", href: "/guardian/enrichment"},
    }, now);
  });
}

export interface NoncreditWaitlistActivity {
  releaseId: string; title: string; status: string;
  joinedAt: DateValue; inviteExpiresAt: DateValue; invitationActive: boolean;
}
export function projectNoncreditWaitlists(
  rows: readonly NoncreditWaitlistActivity[], now: Date,
): ParticipationRecord[] {
  return rows.map(item => {
    // A waitlist or invitation is not a Course enrollment, attendance or outcome.
    const status = item.invitationActive ? "invited" as const : state(item.status);
    return base({
      key: "noncredit_waitlist:" + item.releaseId, source: "noncredit_waitlist",
      sourceId: item.releaseId, refs: {releaseId: item.releaseId},
      kind: "program", status, sourceStatus: item.status,
      title: item.title, detail: "Not enrolled · waiting list",
      organizationId: null, organizationName: null, siteId: null, siteName: null,
      subject: {kind: "self", displayName: null},
      startAt: null, endAt: iso(item.inviteExpiresAt), nextAt: null,
      progress: null, outcome: null,
      action: item.invitationActive ? {
        label: "Claim invitation", href: "/learn/enroll?release=" + hrefId(item.releaseId),
      } : {label: "Manage waiting list", href: "/learn/my-courses"},
    }, now);
  });
}
export function assembleParticipation(records: readonly ParticipationRecord[]): ParticipationRecord[] {
  // A repeated read is not permission to show duplicate personal activity.
  const seen = new Set<string>();
  return sortParticipation(records.filter(record => {
    if (seen.has(record.key)) return false;
    seen.add(record.key);
    return true;
  }));
}
