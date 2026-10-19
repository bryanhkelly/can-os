type FamilyNeed = { kind: string; priority?: string; dueAt?: string | null };

export function prioritizeFamilyNeeds<T extends FamilyNeed>(items: T[], now: number): T[] {
  const rank = (item: FamilyNeed) => {
    if (item.dueAt && Date.parse(item.dueAt) < now) return 0;
    if (item.priority === "urgent" || item.priority === "high") return 1;
    if (item.kind === "excuse") return 2;
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
