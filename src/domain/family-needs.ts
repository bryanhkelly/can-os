type FamilyNeed = { kind: string; priority?: string; dueAt?: string | null };

// Guardian-owned Action types resolve in their owning workspace, not on a
// generic detail page. Keep this data-driven: add a type only where the
// workspace actually completes that Action.
const familyActionWorkspaces: Record<string, string> = {
  study_group_consent: "/guardian/group-permissions",
  course_registration_request: "/guardian/course-approvals",
};

/**
 * Resolve the workspace link for a selected family need. Only Actions carry
 * an owning workspace; kinds without one (and Actions without an id) render
 * no link. Unknown Action types fall back to the generic action detail page.
 */
export function familyActionWorkspaceLink(item: { kind: string; id?: string; type?: string }): string | null {
  if (item.kind !== "action" || !item.id) return null;
  const workspace = item.type ? familyActionWorkspaces[item.type] : undefined;
  if (workspace === "/guardian/group-permissions")
    return workspace + "?action=" + encodeURIComponent(item.id);
  return workspace ?? "/actions/" + encodeURIComponent(item.id);
}

export function prioritizeFamilyNeeds<T extends FamilyNeed>(items: T[], now: number): T[] {
  const rank = (item: FamilyNeed) => {
    if (item.dueAt && Date.parse(item.dueAt) < now) return 0;
    if (item.priority === "urgent" || item.priority === "high") return 1;
    if (item.kind === "excuse" || item.kind === "attendance_review") return 2;
    return item.kind === "action" ? 3 : 4;
  };
  return [...items].sort((a, b) => {
    const priority = rank(a) - rank(b);
    if (priority) return priority;
    if (!a.dueAt) return b.dueAt ? 1 : 0;
    if (!b.dueAt) return -1;
    return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  });
}
