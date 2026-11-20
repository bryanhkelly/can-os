/** A Site may be planned for only when its canonical lifecycle is known.
 * This is not permission or opening authorization; readers still enforce
 * current capability, resource scope and operating relationship separately. */
export function isCanonicalSiteDiscoverable(
  status: "planning" | "active" | "closed" | null | undefined,
): boolean {
  return status === "planning" || status === "active";
}

/** A verified CAN owner may privately plan even when an older Site has no
 * classified lifecycle yet. Unknown is not an approval or publication state.
 * A closed Site is never plannable. Callers must also prove the row exists and
 * is owned by the currently verified CAN Site administrator. */
export function isPrivateCanSitePlanningAllowed(
  status: "planning" | "active" | "closed" | null | undefined,
): boolean {
  return status !== "closed";
}
