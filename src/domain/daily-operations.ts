import { familyActionWorkspaceLink } from "./family-needs";

export type DailyAttentionCategory =
  | "opening" | "staffing" | "admissions" | "documents"
  | "family" | "academic" | "operations";

export type DailyAttentionItem = {
  id: string;
  category: DailyAttentionCategory;
  title: string;
  detail: string;
  href: string;
  nextStep: string;
  ownerName: string | null;
  dueAt: string | null;
  priority: "critical" | "high" | "normal";
  secondaryHref?: string;
  secondaryLabel?: string;
};

export type DailyOperationsAction = {
  id: string;
  type?: string;
  title: string;
  description?: string | null;
  detail?: string;
  siteId: string | null;
  programId?: string | null;
  ownerPersonId: string | null;
  ownerName?: string | null;
  status: string;
  priority: "critical" | "high" | "normal";
  dueAt: string | null;
  createdAt: string;
  openingHandoff?: boolean;
};

export type DailyStaffingIssue = {
  kind: string;
  sectionId: string;
  programId: string;
  title: string;
  description: string;
};

export type DailyProgramProjection = {
  id: string;
  name: string;
  siteId: string | null;
  counts: {
    incomingApplications: number;
    outstandingEnrollmentRequirements: number;
    activeProgramStudents: number;
    placedStudents: number;
    submittedWork: number;
    unresolvedGuardianResponses: number;
  };
};

const restrictedBroadActionTypes = new Set([
  "support_referral",
  "student_support_request",
  "safeguarding_concern",
  "safeguarding_response_required",
  "coach_outreach",
]);

function actionCategory(action: DailyOperationsAction): DailyAttentionCategory {
  if (action.openingHandoff || action.type === "program_opening_handoff") return "opening";
  if (action.type === "section_waitlist" || action.type === "onsite_coverage_gap") return "staffing";
  if (action.type === "guardian_grade_follow_up") return "family";
  if (action.type === "academic_intervention" || action.type === "missing_work_follow_up") return "academic";
  return "operations";
}

function actionHref(action: DailyOperationsAction): string {
  const query = new URLSearchParams();
  if (action.siteId) query.set("siteId", action.siteId);
  if (action.programId) query.set("programId", action.programId);
  query.set("action", action.id);
  return "/operations?" + query.toString();
}

function actionAttention(action: DailyOperationsAction, role: "registrar" | "site_leader"): DailyAttentionItem {
  const category = actionCategory(action);
  return {
    id: "action:" + action.id,
    category,
    title: action.title,
    detail: action.detail ?? action.description ?? "Review the canonical Action in Operations.",
    href: action.type === "onsite_coverage_gap" && role === "site_leader" && action.siteId
      ? "/sites/" + encodeURIComponent(action.siteId) : actionHref(action),
    nextStep: action.type === "onsite_coverage_gap" && !action.ownerPersonId
      ? "Ask the host registrar to appoint an eligible director and assign this gap"
      : category === "opening" ? "Review the named handoff" :
      category === "family" ? "Review the family question" : "Review action",
    ownerName: action.ownerName ?? null,
    dueAt: action.dueAt,
    priority: action.priority,
  };
}

function programHref(path: string, program: DailyProgramProjection): string {
  const query = new URLSearchParams({ programId: program.id });
  if (program.siteId) query.set("siteId", program.siteId);
  return path + "?" + query.toString();
}

function sortAttention(items: DailyAttentionItem[]): DailyAttentionItem[] {
  const rank = { critical: 0, high: 1, normal: 2 } as const;
  return [...items].sort((a, b) =>
    rank[a.priority] - rank[b.priority] ||
    (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) ||
    a.id.localeCompare(b.id));
}

/**
 * Read-only navigation over canonical Actions and existing operational
 * projections. It does not calculate readiness, interventions or health.
 * Site leaders receive local assigned work and unowned coverage escalations; registrars additionally see
 * student-free admissions and academic aggregates in their verified scope.
 */
export function buildDailyOperationsAttention(input: {
  role: "registrar" | "site_leader";
  actorPersonId: string;
  actions: readonly DailyOperationsAction[];
  staffingIssues?: readonly DailyStaffingIssue[];
  programs?: readonly DailyProgramProjection[];
}): DailyAttentionItem[] {
  const actions = input.actions.filter(action =>
    !restrictedBroadActionTypes.has(action.type ?? "") &&
    (input.role === "registrar" || action.ownerPersonId === input.actorPersonId ||
      action.type === "program_opening_handoff" || action.openingHandoff ||
      (action.type === "onsite_coverage_gap" && action.ownerPersonId === null)));
  const items = actions.map(action => actionAttention(action, input.role));
  if (input.role === "site_leader") return sortAttention(items);

  for (const issue of input.staffingIssues ?? []) {
    items.push({
      id: `staffing:${issue.kind}:${issue.sectionId}`,
      category: "staffing",
      title: issue.title,
      detail: issue.description,
      href: "/operations/launch/" + encodeURIComponent(issue.programId),
      nextStep: issue.kind === "waitlist" ? "Review the section waitlist" : "Review staffing and capacity",
      ownerName: null,
      dueAt: null,
      priority: issue.kind === "unstaffed" ? "high" : "normal",
    });
  }

  for (const program of input.programs ?? []) {
    const c = program.counts;
    if (c.incomingApplications > 0) items.push({
      id: "admissions:" + program.id,
      category: "admissions",
      title: `${c.incomingApplications} incoming application${c.incomingApplications === 1 ? "" : "s"} · ${program.name}`,
      detail: "Review the canonical admissions pipeline and the next decision for each family.",
      href: programHref("/admissions", program),
      nextStep: "Review applications",
      ownerName: null,
      dueAt: null,
      priority: "normal",
    });
    if (c.outstandingEnrollmentRequirements > 0) items.push({
      id: "documents:" + program.id,
      category: "documents",
      title: `${c.outstandingEnrollmentRequirements} enrollment form or document requirement${c.outstandingEnrollmentRequirements === 1 ? "" : "s"} · ${program.name}`,
      detail: "Outstanding blocking Journey requirements may need family submission or registrar review.",
      href: programHref("/admissions/families", program),
      nextStep: "Review enrollment requirements",
      ownerName: null,
      dueAt: null,
      priority: "normal",
    });
    const awaitingPlacement = Math.max(0, c.activeProgramStudents - c.placedStudents);
    if (awaitingPlacement > 0) items.push({
      id: "placement:" + program.id,
      category: "admissions",
      title: `${awaitingPlacement} student${awaitingPlacement === 1 ? "" : "s"} awaiting class placement · ${program.name}`,
      detail: "Use the existing enrollment-to-class workflow for this Program and school year.",
      href: programHref("/admissions", program),
      nextStep: "Review class placement",
      ownerName: null,
      dueAt: null,
      priority: "high",
    });
    if (c.submittedWork > 0) items.push({
      id: "academic:" + program.id,
      category: "academic",
      title: `${c.submittedWork} submission${c.submittedWork === 1 ? "" : "s"} awaiting grading · ${program.name}`,
      detail: "Assigned teachers can review this academic activity in their authorized gradebook.",
      href: programHref("/operations", program),
      nextStep: "Review academic activity",
      ownerName: null,
      dueAt: null,
      priority: "normal",
    });
  }
  return sortAttention(items);
}

export function buildTeacherAttention(data: {
  ungraded: readonly {
    sectionId: string; assessmentId: string; studentProfileId: string;
    studentName: string; assessmentTitle: string; sectionTitle: string; submittedAt: string | null;
  }[];
  missingWork: readonly {
    sectionId: string; assessmentId: string; studentProfileId: string;
    studentName: string; assessmentTitle: string; sectionTitle: string; dueAt: string;
  }[];
  notices: readonly { id: string; title: string; body: string | null; createdAt: string }[];
  guardianQuestions?: readonly { id: string; studentName: string; assessmentTitle: string; status: string }[];
}): DailyAttentionItem[] {
  const classroomHref = (item: { sectionId: string; assessmentId: string; studentProfileId: string }) =>
    `/teacher/gradebook?section=${encodeURIComponent(item.sectionId)}&assessment=${encodeURIComponent(item.assessmentId)}&student=${encodeURIComponent(item.studentProfileId)}`;
  return [
    ...(data.guardianQuestions ?? []).filter(item=>item.status!=="resolved" && item.status!=="cancelled")
      .map(item=>({
        id: "grade-follow-up:" + item.id,
        category: "family" as const,
        title: "Guardian question: " + item.assessmentTitle,
        detail: item.studentName + " · a family is awaiting the school's response to released feedback",
        href: "/teacher?gradeAction=" + encodeURIComponent(item.id) + "#grade-follow-ups",
        nextStep: "Respond to guardian",
        ownerName: "Teaching team",
        dueAt: null,
        priority: "high" as const,
      })),
    ...data.ungraded.map(item => ({
      id: `grading:${item.assessmentId}:${item.studentProfileId}`,
      category: "academic" as const,
      title: item.assessmentTitle,
      detail: `${item.studentName} · ${item.sectionTitle} · submitted work awaits your review`,
      href: classroomHref(item), nextStep: "Review submission", ownerName: "You",
      dueAt: item.submittedAt, priority: "normal" as const,
    })),
    ...data.missingWork.map(item => ({
      id: `missing:${item.assessmentId}:${item.studentProfileId}`,
      category: "academic" as const,
      title: item.assessmentTitle,
      detail: `${item.studentName} · ${item.sectionTitle} · no submission recorded`,
      href: classroomHref(item), nextStep: "Review missing work", ownerName: "You",
      dueAt: item.dueAt, priority: "high" as const,
    })),
    ...data.notices.map(notice => ({
      id: "notice:" + notice.id,
      category: "operations" as const,
      title: notice.title,
      detail: notice.body ?? "Review your assigned operational notice.",
      href: "/notifications?notification=" + encodeURIComponent(notice.id),
      nextStep: "Read notice", ownerName: "You", dueAt: notice.createdAt,
      priority: "normal" as const,
    })),
  ];
}

export function buildGuardianAttention(items: readonly {
  id: string; kind: string; type?: string; title: string; detail?: string;
  href: string; priority?: string; dueAt?: string | null;
}[]): DailyAttentionItem[] {
  return items.map(item => {
    const workspace = familyActionWorkspaceLink(item);
    // Guardian-owned permissions must open their actual decision screen.
    // The generic /actions/:id detail route is staff-only.
    const guardianWorkspace = workspace?.startsWith("/guardian/") ? workspace : null;
    return {
      id: `${item.kind}:${item.id}`,
      category: item.kind === "excuse" ? "family" :
        item.type?.includes("grade") || item.type?.includes("assignment") ? "academic" : "family",
      title: item.title,
      detail: item.detail ?? "",
      href: guardianWorkspace ?? item.href,
      nextStep: item.kind === "excuse" ? "Submit excuse" :
        item.kind === "attendance_review" ? "Review school decision" :
        item.type === "assignment_revision_limit" ? "Review feedback with school" :
        item.kind === "schoolwork" ? "Review assignment" :
        item.kind === "course_approval" ? "Review class request" :
        guardianWorkspace ? "Review permission" : item.kind === "action" ? "Review action" : "View update",
      ownerName: "You",
      dueAt: item.dueAt ?? null,
      priority: item.priority === "urgent" ? "critical" : item.priority === "high" ? "high" : "normal",
      // Do not offer an inaccessible staff-only Action detail as a second CTA.
    };
  });
}
