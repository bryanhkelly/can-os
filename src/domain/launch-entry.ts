type Program = { id: string; siteId: string | null; status: string };
type Site = { id: string };
export type LaunchEntrySelection = { siteId?: string; programId?: string };

/** Presentation choice over authorized canonical records; never an access grant. */
export function launchEntrySelection(input: {
  programs: Program[];
  sites: Site[];
  selection: LaunchEntrySelection;
}): LaunchEntrySelection | null {
  const { programs, sites, selection } = input;
  // A stale or unauthorized URL must not fall back to another school.
  if (selection.siteId && !sites.some(site => site.id === selection.siteId)) return null;
  if (selection.programId && !programs.some(program => program.id === selection.programId &&
    (!selection.siteId || program.siteId === selection.siteId))) return null;
  const scoped = programs.filter(program =>
    (!selection.siteId || program.siteId === selection.siteId) &&
    (!selection.programId || program.id === selection.programId));
  // Existing operators retain the operations workspace, including closed schools.
  if (scoped.some(program => !["draft", "launching", "ready"].includes(program.status))) return null;
  const only = scoped.length === 1 ? scoped[0] : undefined;
  return {
    siteId: selection.siteId ?? only?.siteId ?? (sites.length === 1 ? sites[0]?.id : undefined),
    programId: only?.id,
  };
}

