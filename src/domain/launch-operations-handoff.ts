import { shortUuidHref } from "@/domain/opaque-url-id";
/** Successful server activation leads to the operating workspace, never back to setup. */
export function postLaunchOperationsDestination(input: { programId: string; siteId: string | null }): string {
  if (input.siteId) return shortUuidHref("/sites/", input.siteId);
  return shortUuidHref("/launch/school/", input.programId);
}

/** Existing active Programs use the same launch-to-operations destination on reload. */
export function activeProgramOperationsHref(input: { programId: string; siteId: string | null; status: string }): string {
  return input.status === "active" && input.siteId
    ? shortUuidHref("/sites/", input.siteId)
    : shortUuidHref("/launch/school/", input.programId);
}
