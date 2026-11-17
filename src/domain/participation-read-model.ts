/**
 * WS1 Participation Read Model v1.0.0.
 * Display-only projection. Source domain identifiers, enrollment decisions,
 * attendance, grades, outcomes and grants stay authoritative in their services.
 * NEVER grant access from a displayed Site, Organization, status or URL.
 */
export const PARTICIPATION_READ_MODEL_VERSION = "1.1.0" as const;

export type ParticipationSource =
  | "school_section" | "school_program" | "calendar_event"
  | "native_class" | "noncredit_course" | "family_enrichment";
export type ParticipationOpportunitySource = "noncredit_waitlist";
export type ActivitySource = ParticipationSource | ParticipationOpportunitySource;
export type SourceCoverage = "complete" | "partial" | "unknown" | "not_applicable";
export type ParticipationKind = "learning" | "program" | "event" | "other";
export type ParticipationStatus =
  | "active" | "scheduled" | "pending" | "completed"
  | "withdrawn" | "cancelled" | "waitlisted" | "invited" | "unknown";
export type ParticipationBucket = "current" | "upcoming" | "history";
export type ActivitySourceState = "ready" | "unavailable" | "not_applicable";

export interface ParticipationSourceReferences {
  enrollmentId?: string;
  sectionId?: string;
  classId?: string;
  classEnrollmentId?: string;
  courseAttemptId?: string;
  registrationId?: string;
  programId?: string;
  calendarEventId?: string;
  calendarEventParticipantId?: string;
  releaseId?: string;
  seasonId?: string;
  studentProfileId?: string;
}
export interface ParticipationRecord {
  /** Namespaced by source, never a replacement canonical enrollment ID. */
  key: string;
  source: ParticipationSource;
  sourceId: string;
  refs: ParticipationSourceReferences;
  kind: ParticipationKind;
  bucket: ParticipationBucket;
  status: ParticipationStatus;
  /** Source-specific state, retained for auditing interpretation, not permission. */
  sourceStatus: string;
  title: string;
  detail: string | null;
  organizationName: string | null;
  organizationId: string | null;
  siteName: string | null;
  siteId: string | null;
  subject: { kind: "self" | "dependent"; displayName: string | null };
  startAt: string | null;
  endAt: string | null;
  nextAt: string | null;
  progress: { label: string; completed: number; total: number } | null;
  outcome: { label: string; referenceId?: string } | null;
  action: { label: string; href: string } | null;
}
/** Waitlists and invitations are enrollment opportunities, never enrollments. */
export interface ParticipationOpportunity {
  /** Release-scoped, per authorized viewer; not an enrollment or waitlist row ID. */
  key: string;
  source: ParticipationOpportunitySource;
  releaseId: string;
  state: "waiting" | "invited" | "expired" | "unknown";
  sourceStatus: string;
  title: string;
  joinedAt: string | null;
  expiresAt: string | null;
  action: { label: string; href: string } | null;
}

export interface ParticipationReadModel {
  version: typeof PARTICIPATION_READ_MODEL_VERSION;
  generatedAt: string;
  /** Active, verified grant only. An account is NOT a cross-grant authorization. */
  viewerRole: string;
  activeGrantId: string;
  records: ParticipationRecord[];
  /** Not included in participation counts or official completion reporting. */
  opportunities: ParticipationOpportunity[];
  sources: Array<{
    source: ActivitySource;
    state: ActivitySourceState;
    coverage: SourceCoverage;
    /** Generic diagnostic; do not reveal unauthorized record existence. */
    message: string | null;
  }>;
}

const historical = new Set<ParticipationStatus>(["completed", "withdrawn", "cancelled"]);
export function activityBucket(
  status: ParticipationStatus,
  startAt: string | null,
  now: Date,
): ParticipationBucket {
  if (historical.has(status)) return "history";
  if (status === "pending" || status === "waitlisted" || status === "invited")
    return "upcoming";
  const start = startAt ? Date.parse(startAt) : NaN;
  if (status === "scheduled" && (!Number.isFinite(start) || start > now.getTime()))
    return "upcoming";
  if (Number.isFinite(start) && start > now.getTime()) return "upcoming";
  return "current";
}

export function activityStatus(raw: string | null | undefined): ParticipationStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "active": case "enrolled": case "in_progress": return "active";
    case "registered": case "scheduled": return "scheduled";
    case "pending": case "requested": return "pending";
    case "completed": case "complete": case "approved_complete": return "completed";
    case "withdrawn": case "dropped": return "withdrawn";
    case "cancelled": case "canceled": return "cancelled";
    case "waiting": case "waitlisted": return "waitlisted";
    case "invited": return "invited";
    default: return "unknown";
  }
}
export function activityStatusLabel(status: ParticipationStatus): string {
  const labels: Record<ParticipationStatus, string> = {
    active: "In progress", scheduled: "Registered", pending: "Pending",
    completed: "Completed", withdrawn: "Withdrawn", cancelled: "Cancelled",
    waitlisted: "Waiting for a place", invited: "Invitation available",
    unknown: "Status pending verification",
  };
  return labels[status];
}

/** Sort without inventing schedule dates or silently dropping undated records. */
export function sortParticipation(records: readonly ParticipationRecord[]): ParticipationRecord[] {
  const order: Record<ParticipationBucket, number> = {current: 0, upcoming: 1, history: 2};
  return [...records].sort((a, b) => {
    const bucket = order[a.bucket] - order[b.bucket];
    if (bucket) return bucket;
    const aTime = Date.parse(a.nextAt ?? a.startAt ?? a.endAt ?? "");
    const bTime = Date.parse(b.nextAt ?? b.startAt ?? b.endAt ?? "");
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime)
      return a.bucket === "history" ? bTime - aTime : aTime - bTime;
    if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
    return a.key.localeCompare(b.key);
  });
}

export function resolveActivityFilters(
  records: readonly ParticipationRecord[],
  bucket: ParticipationBucket,
  kind: ParticipationKind | "all",
): ParticipationRecord[] {
  return records.filter(record => record.bucket === bucket &&
    (kind === "all" || record.kind === kind));
}

export function assertUniqueParticipationKeys(records: readonly ParticipationRecord[]): void {
  const keys = new Set<string>();
  for (const record of records) {
    if (keys.has(record.key)) throw new Error("Duplicate participation source identity");
    keys.add(record.key);
  }
}

/** Runtime fail-closed contract guard shared by WS1 and downstream consumers.
 * It validates identities and collection separation, never authorizes a read. */
export function assertParticipationReadModel(model: ParticipationReadModel): void {
  if (model.version !== PARTICIPATION_READ_MODEL_VERSION)
    throw new Error("Unsupported participation contract version");
  assertUniqueParticipationKeys(model.records);
  for (const record of model.records) {
    if (!record.sourceId || record.key !== record.source + ":" + record.sourceId)
      throw new Error("Invalid participation source identity");
    const authoritative = record.source === "native_class" ? record.refs.classEnrollmentId
      : record.source === "school_section" || record.source === "school_program"
        ? record.refs.enrollmentId
      : record.source === "calendar_event" ? record.refs.calendarEventParticipantId
      : record.refs.registrationId;
    if (authoritative !== record.sourceId)
      throw new Error("Participation identity must be authoritative enrollment or registration");
  }
  const opportunities = new Set<string>();
  for (const item of model.opportunities) {
    if (!item.releaseId || item.key !== "noncredit_waitlist_release:" + item.releaseId)
      throw new Error("Invalid enrollment opportunity display identity");
    if (opportunities.has(item.key))
      throw new Error("Duplicate enrollment opportunity");
    opportunities.add(item.key);
  }
  const sources = new Set<ActivitySource>();
  for (const source of model.sources) {
    if (sources.has(source.source)) throw new Error("Duplicate participation source coverage");
    sources.add(source.source);
    if (source.state !== "ready" && source.coverage === "complete")
      throw new Error("Unavailable source cannot claim complete coverage");
    if (source.state === "not_applicable" && source.coverage !== "not_applicable")
      throw new Error("Not-applicable source has inconsistent coverage");
  }
}
