/** A Site may be planned for only when its canonical lifecycle is known.
 * This is not permission or opening authorization; readers still enforce
 * current capability, resource scope and operating relationship separately. */
export function isCanonicalSiteDiscoverable(
  status: "planning" | "active" | "closed" | null | undefined,
): boolean {
  return status === "planning" || status === "active";
}
