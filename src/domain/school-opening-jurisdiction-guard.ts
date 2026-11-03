/** Canonical approval is bound to the exact independently verified school scope.
 * This does not authorize an opening by itself: source review and all other
 * school-opening requirements are re-read by the server on every operation.
 */
export type OpeningJurisdictionStamp = {
  scopeFingerprint: string;
  profileVersionId: string;
};

export function matchesCurrentOpeningJurisdiction(
  approved: OpeningJurisdictionStamp | null | undefined,
  current: OpeningJurisdictionStamp,
): boolean {
  return Boolean(approved &&
    approved.scopeFingerprint.length > 0 &&
    approved.profileVersionId.length > 0 &&
    approved.scopeFingerprint === current.scopeFingerprint &&
    approved.profileVersionId === current.profileVersionId);
}
