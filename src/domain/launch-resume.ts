/** Resolve a requested launch without silently changing its school or Program. */
export function resolveLaunchResume<T extends { id: string; siteId: string | null }>(
  launches: T[], selection: { siteId?: string; programId?: string },
): { launches: T[]; launch: T | null; unavailable: boolean } {
  const scoped = launches.filter(item => !selection.siteId || item.siteId === selection.siteId);
  const requested = selection.programId ? scoped.find(item => item.id === selection.programId) : undefined;
  return {
    launches: scoped,
    launch: selection.programId ? requested ?? null : scoped.length === 1 ? scoped[0]! : null,
    unavailable: Boolean(selection.programId && !requested),
  };
}

