/** An enrollment permission bit alone cannot stand in for verified parent/guardian authority.
 * Registrar-created or self-asserted prospective relationships may exist with defaults.
 */
export function isVerifiedEnrollmentGuardian(
  relationship: {canManageEnrollment:boolean; metadata:Record<string,unknown>} | null | undefined,
): boolean {
  return relationship?.canManageEnrollment === true &&
    relationship.metadata.verification === "verified";
}

export function verifiedEnrollmentStudentIds(
  relationships: readonly {
    studentPersonId: string;
    canManageEnrollment: boolean;
    metadata: Record<string, unknown>;
  }[],
): string[] {
  return [...new Set(relationships
    .filter(isVerifiedEnrollmentGuardian)
    .map(relation => relation.studentPersonId))];
}
