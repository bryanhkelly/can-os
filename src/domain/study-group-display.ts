import type { getCanonicalGroupWorkspace } from "@/modules/study-groups/canonical-workspace.functions";

type Workspace = Awaited<ReturnType<typeof getCanonicalGroupWorkspace>>;
export type StudyGroupRecord = Workspace["groups"][number];

export function groupKindLabel(kind: StudyGroupRecord["kind"]): string {
  return kind === "course" ? "Course group" : "Interest group";
}

/** Pick the next scheduled, non-cancelled group session without changing
 * membership or session authority. The clock can be supplied for tests.
 */
export function nextGroupSession(
  group: StudyGroupRecord,
  now = Date.now(),
): StudyGroupRecord["sessions"][number] | null {
  return group.sessions.find(
    session => !session.cancelled && new Date(session.startsAt).getTime() > now,
  ) ?? null;
}
