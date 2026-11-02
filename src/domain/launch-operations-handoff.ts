/** Successful server activation leads to the operating workspace, never back to setup. */
export function postLaunchOperationsDestination(input: { programId: string; siteId: string | null }): string {
  if (input.siteId) return "/sites/" + encodeURIComponent(input.siteId);
  return "/operations/launch?programId=" + encodeURIComponent(input.programId);
}

/** Existing active Programs use the same launch-to-operations destination on reload. */
export function activeProgramOperationsHref(input: { programId: string; siteId: string | null; status: string }): string {
  return input.status === "active" && input.siteId
    ? "/sites/" + encodeURIComponent(input.siteId)
    : "/operations/launch/" + encodeURIComponent(input.programId);
}
