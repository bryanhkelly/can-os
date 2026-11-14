/** The acknowledgement belongs to the exact child, household and published form version. */
export function enrichmentConsentContext(studentProfileId: string, householdId: string, permissionVersion: string) {
  return JSON.stringify([studentProfileId, householdId, permissionVersion]);
}
