import type { FamilyInvitationWorkspace } from "./family-invitations";

/** Scope presentation to the intended launch; server send/retry checks remain authoritative. */
export function familyInvitationLaunchScope(
  workspace: FamilyInvitationWorkspace | null,
  selection: { siteId?: string; programId?: string },
) {
  const programs = (workspace?.programs ?? []).filter(program =>
    (!selection.siteId || program.siteId === selection.siteId) &&
    (!selection.programId || program.id === selection.programId));
  const batches = (workspace?.batches ?? []).filter(batch =>
    (!selection.siteId || batch.siteId === selection.siteId) &&
    (!selection.programId || batch.programId === selection.programId));
  return {
    programs, batches,
    initialProgram: programs.length === 1 ? programs[0] : undefined,
  };
}

