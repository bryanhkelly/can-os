export type LaunchRequirementState =
  | "needs_you"
  | "needs_can"
  | "waiting_third_party"
  | "blocked"
  | "complete";

export type LaunchGuidanceRecord = {
  id: string;
  status: string;
  journey: { id?: string; status: string } | null;
  requirements: Array<{
    id: string;
    key: string;
    title: string;
    status: string;
    blocking: boolean;
    ownerPersonId?: string | null;
    evidence?: Record<string, unknown>[];
    metadata?: Record<string, unknown>;
  }>;
};

export type LaunchGuidanceTask = {
  id: string;
  title: string;
  description: string;
  state: LaunchRequirementState;
  blocking: boolean;
  requirementId?: string;
  ownerPersonId?: string | null;
  evidenceCount?: number;
  reviewNoteCount?: number;
  rejectedReviewCount?: number;
  latestReviewStatus?: string | null;
  requiresRegistrarReview?: boolean;
  action: "academics" | "admissions" | "orientation" | "opening" | "review" | "none";
};

const requirementStates = new Set<LaunchRequirementState>([
  "needs_you", "needs_can", "waiting_third_party", "blocked", "complete",
]);

function requirementState(status: string): LaunchRequirementState {
  return requirementStates.has(status as LaunchRequirementState)
    ? status as LaunchRequirementState
    : "blocked";
}

function requirementAction(key: string): LaunchGuidanceTask["action"] {
  if (key.includes("orientation")) return "orientation";
  if (key.includes("admission") || key.includes("enrollment")) return "admissions";
  if (key.includes("staff") || key.includes("teacher") || key.includes("academic") || key.includes("section")) {
    return "academics";
  }
  return "review";
}

function nextOwnedTask(tasks: LaunchGuidanceTask[]) {
  return tasks.find(task => task.state === "needs_you")
    ?? tasks.find(task => task.state === "needs_can")
    ?? tasks.find(task => task.state === "waiting_third_party")
    ?? tasks.find(task => task.state === "blocked")
    ?? null;
}

/**
 * Derives the visible launch path from the persisted Program and Launch Journey.
 * There is deliberately no client-side progress or completion state to resume.
 */
export function buildLaunchGuidance(launch: LaunchGuidanceRecord) {
  const requirements = launch.requirements.map(requirement => ({
    id: `requirement:${requirement.id}`,
    requirementId: requirement.id,
    ownerPersonId: requirement.ownerPersonId,
    evidenceCount: requirement.evidence?.length ?? 0,
    reviewNoteCount: requirement.evidence?.filter(item => item.kind === "registrar_note").length ?? 0,
    rejectedReviewCount: requirement.evidence?.filter(item => item.kind === "document_review" && item.status === "rejected").length ?? 0,
    latestReviewStatus: String([...(requirement.evidence ?? [])].reverse().find(item => item.kind === "document_review" && typeof item.status === "string")?.status ?? "") || null,
    requiresRegistrarReview: requirement.metadata?.enrollmentForm !== undefined ||
      requirement.evidence?.some(item => item.kind === "document_review") === true,
    title: requirement.title,
    description: requirement.blocking
      ? "Required before opening. Complete the underlying work; a checklist response is not independent approval."
      : "Recorded in the Launch Journey, but not a blocker to opening.",
    state: requirementState(requirement.status),
    blocking: requirement.blocking,
    action: requirementAction(requirement.key),
  }));
  const pendingBlocking = requirements.filter(task => task.blocking && task.state !== "complete");
  const ready = launch.journey?.status === "ready" && pendingBlocking.length === 0;
  const opening: LaunchGuidanceTask = {
    id: "opening",
    title: launch.status === "active" ? "Opening recorded" : "Review and open the program",
    description: launch.status === "active"
      ? "The canonical Program opening is recorded."
      : ready
        ? "The Launch Journey is ready. Activation still rechecks academic, staffing, institutional and receiving-operator authority."
        : "Opening stays locked until the canonical Launch Journey is ready and the activation service accepts every current prerequisite.",
    state: launch.status === "active" ? "complete" : ready ? "needs_you" : "blocked",
    blocking: true,
    action: launch.status === "active" ? "none" : "opening",
  };
  const tasks: LaunchGuidanceTask[] = [
    {
      id: "school-model",
      title: "School model and launch record",
      description: "The Program, proposed delivery model and Launch Journey are saved in school records.",
      state: "complete",
      blocking: false,
      action: "none",
    },
    ...requirements,
    opening,
  ];
  const nextTask = nextOwnedTask(pendingBlocking)
    ?? (ready && launch.status !== "active" ? opening : null)
    ?? nextOwnedTask(requirements.filter(task => !task.blocking));
  const pending = requirements.filter(task => task.state !== "complete");
  return {
    tasks,
    nextTask,
    pending,
    pendingBlocking,
    ready,
    optionalSetupAvailable: pendingBlocking.length === 0,
  };
}

/** Human-readable responsibility derived only from the canonical requirement state. */
export function launchResponsibility(state: LaunchRequirementState) {
  switch (state) {
    case "needs_you": return "School operator";
    case "needs_can": return "CAN institutional team";
    case "waiting_third_party": return "External party";
    case "blocked": return "Unresolved — inspect requirement";
    case "complete": return "Recorded complete";
  }
}

export function launchOwnershipLabel(state: LaunchRequirementState) {
  switch (state) {
    case "needs_you": return "Needs you";
    case "needs_can": return "Needs CAN";
    case "waiting_third_party": return "Waiting on someone else";
    case "blocked": return "Blocked";
    case "complete": return "Recorded";
  }
}
