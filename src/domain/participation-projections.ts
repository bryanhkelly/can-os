import {
  activityBucket, activityStatus, sortParticipation,
  type ParticipationRecord, type ParticipationStatus, type ParticipationOpportunity,
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
  organizationId?: string|null;organizationName?:string|null;
  siteId?:string|null;siteName?:string|null;
  startsAt?:DateValue;endsAt?:DateValue;
  subject?:{kind:"self"|"dependent";displayName:string|null};
  officialOutcome?:{label:string;referenceId:string}|null;
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
      organizationId: section.organizationId??null,organizationName:section.organizationName??null,
      siteId:section.siteId??null,siteName:section.siteName??null,
      subject:section.subject??{kind:"self",displayName:null},
      startAt:iso(section.startsAt),endAt:iso(section.endsAt),nextAt:null,
      progress: null,
      // A finalized grading-period reference is source-owned evidence, not
      // an inference from the Enrollment status or a claim of course credit.
      outcome:section.officialOutcome??null,
      action:section.subject?.kind==="dependent"
        ?(status==="active"||status==="scheduled"
          ?{label:"View dependent's school",href:"/guardian/students"}:null)
        :status==="active"
        ?{label:"Open school class",href:"/student/courses?section="+hrefId(section.id)}
        :status==="scheduled"
        ?{label:"View course registration",href:"/student/courses?section="+hrefId(section.id)}
        :null,
    }, now);
  });
}

export interface NativeClassActivity {
  classEnrollmentId: string; classId: string; title: string; status: string;
  courseAttemptId: string | null; deliveryMode: string;
  enrolledAt: DateValue; siteId: string | null;siteName?:string|null;
  officialOutcome?: {label:string;referenceId:string}|null;
}
export function projectNativeClasses(
  rows: readonly NativeClassActivity[], now: Date,
  siteChoices: readonly {id: string; name: string}[] = [],
): ParticipationRecord[] {
  return rows.map(item => {
    const status = state(item.status);
    const hasLearningAccess = status === "active" && !!item.courseAttemptId;
    const siteName=item.siteName??siteChoices.find(site=>site.id===item.siteId)?.name??null;
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
      outcome: item.officialOutcome ?? null,
      action: hasLearningAccess ? {
        label: "Open class", href: "/classes/" + hrefId(item.classId) + "?view=learn&tab=lessons",
      } : null,
    }, now);
  });
}

export interface NoncreditCourseActivity {
  registrationId: string; releaseId: string; courseAttemptId: string;
  trainingTitle: string; deliveryMode: string; siteName: string | null;
  siteId?:string|null;organizationId?:string|null;organizationName?:string|null;
  registrationStatus: string; attemptStatus: string; registeredAt: DateValue;
  upcomingSessions: readonly {startsAt: string; endsAt: string}[];
  officialOutcome?: {label:string;referenceId:string}|null;
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
      organizationId:row.organizationId??null,organizationName:row.organizationName??null,
      siteId:row.siteId??null,siteName:row.siteName,
      subject: {kind: "self", displayName: null},
      startAt: null, endAt: null, nextAt: next,
      progress: null,
      outcome: row.officialOutcome ?? null,
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
  organizationId?:string|null;organizationName?:string|null;
  siteId?:string|null;siteName?:string|null;
  subjectKind?:"self"|"dependent";
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
      organizationId:item.organizationId??null,organizationName:item.organizationName??null,
      siteId:item.siteId??null,siteName:item.siteName??null,
      subject: {kind:item.subjectKind??"dependent",displayName:childNames.get(item.studentProfileId) ?? null},
      startAt: iso(item.startsOn), endAt: iso(item.endsOn), nextAt: null,
      progress: null,
      outcome: null,
      action:item.subjectKind==="self"?null:
        {label:"Manage family program",href:"/guardian/enrichment"},
    }, now);
  });
}

export interface NoncreditWaitlistActivity {
  releaseId: string; title: string; status: string;
  joinedAt: DateValue; inviteExpiresAt: DateValue; invitationActive: boolean;
}
/** Waitlist opportunities never enter the participation/enrollment read collection. */
export function projectNoncreditOpportunities(
  rows: readonly NoncreditWaitlistActivity[],
): ParticipationOpportunity[] {
  const seen = new Set<string>();
  return rows.flatMap(item => {
    // The existing personal reader supplies one current row per release, but not
    // its authoritative waitlist row ID. Use a release-scoped display key only.
    if (seen.has(item.releaseId)) return [];
    seen.add(item.releaseId);
    const state: ParticipationOpportunity["state"] = item.invitationActive
      ? "invited" : item.status === "expired" ? "expired"
      : item.status === "waiting" ? "waiting" : "unknown";
    return [{
      key: "noncredit_waitlist_release:" + item.releaseId,
      source: "noncredit_waitlist" as const,
      releaseId: item.releaseId,
      state,
      sourceStatus: item.status,
      title: item.title,
      joinedAt: iso(item.joinedAt),
      expiresAt: iso(item.inviteExpiresAt),
      action: state === "invited" ? {
        label: "Claim invitation", href: "/learn/enroll?release=" + hrefId(item.releaseId),
      } : {
        label: "Manage waiting list", href: "/learn/my-courses",
      },
    }];
  }).sort((a, b) => {
    const rank = {invited: 0, waiting: 1, expired: 2, unknown: 3};
    return rank[a.state] - rank[b.state] || a.title.localeCompare(b.title);
  });
}

export interface SchoolProgramActivity {
  enrollmentId:string;
  programId:string;
  studentProfileId:string;
  title:string;
  status:string;
  organizationId:string;
  organizationName:string|null;
  siteId:string|null;
  siteName:string|null;
  subjectName:string|null;
  subjectKind:"self"|"dependent";
  startsAt:DateValue;
  endsAt:DateValue;
}

/** An existing program Enrollment, never merely a Program visible in a catalog. */
export function projectSchoolPrograms(rows:readonly SchoolProgramActivity[],now:Date):ParticipationRecord[] {
  return rows.map(row=>{
    const status=state(row.status);
    return base({
      source:"school_program",sourceId:row.enrollmentId,
      key:"school_program:"+row.enrollmentId,
      refs:{enrollmentId:row.enrollmentId,programId:row.programId,studentProfileId:row.studentProfileId},
      kind:"program",status,sourceStatus:row.status,
      title:row.title,detail:"School Program enrollment",
      organizationId:row.organizationId,organizationName:row.organizationName,
      siteId:row.siteId,siteName:row.siteName,
      subject:{kind:row.subjectKind,displayName:row.subjectName},
      startAt:iso(row.startsAt),endAt:iso(row.endsAt),nextAt:null,
      progress:null,outcome:null,
      action:status==="active"||status==="scheduled"
        ?{label:"View school program",href:row.subjectKind==="dependent"?"/guardian/students":"/student/my-school"}
        :null,
    },now);
  });
}

export interface AcceptedCalendarEventActivity {
  participantId:string;
  eventId:string;
  title:string;
  startsAt:DateValue;
  endsAt:DateValue;
  organizationId:string|null;
  siteId:string|null;
  programId:string|null;
  cancelled:boolean;
  siteName?:string|null;organizationName?:string|null;
  subject?:{kind:"self"|"dependent";displayName:string|null};
}

/** Explicitly accepted attendance intent. An elapsed event is NOT a completion. */
export function projectAcceptedCalendarEvents(
  rows:readonly AcceptedCalendarEventActivity[],now:Date,
):ParticipationRecord[] {
  return rows.map(row=>{
    const startAt=iso(row.startsAt),endAt=iso(row.endsAt);
    const status:ParticipationStatus=row.cancelled?"cancelled":"scheduled";
    const record=base({
      source:"calendar_event",sourceId:row.participantId,
      key:"calendar_event:"+row.participantId,
      refs:{calendarEventParticipantId:row.participantId,calendarEventId:row.eventId,
        ...(row.programId?{programId:row.programId}:{})},
      kind:"event",status,sourceStatus:row.cancelled?"cancelled":"accepted",
      title:row.title,detail:"Accepted event invitation. Attendance not verified.",
      organizationId:row.organizationId,organizationName:row.organizationName??null,
      siteId:row.siteId,siteName:row.siteName??null,
      subject:row.subject??{kind:"self",displayName:null},
      startAt,endAt,nextAt:null,
      progress:null,outcome:null,
      action:row.cancelled?null:{label:"View event",href:"/calendar?event="+hrefId(row.eventId)},
    },now);
    // Keep elapsed events in history without converting acceptance to attendance.
    const elapsed=endAt??startAt;
    // Elapsed accepted invitations belong to history even if the event has
    // no explicit end time. Neither case implies verified attendance.
    return !row.cancelled&&elapsed&&Date.parse(elapsed)<now.getTime()
      ?{...record,bucket:"history" as const}:record;
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
