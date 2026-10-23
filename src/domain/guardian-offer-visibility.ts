/** An enrollment permission bit alone cannot stand in for verified parent/guardian authority.
 * Registrar-created or self-asserted prospective relationships may exist with defaults.
 */
export function verifiedEnrollmentStudentIds(
  relationships: readonly {
    studentPersonId: string;
    canManageEnrollment: boolean;
    metadata: Record<string, unknown>;
  }[],
): string[] {
  return [...new Set(relationships
    .filter(relation => relation.canManageEnrollment &&
      relation.metadata.verification === "verified")
    .map(relation => relation.studentPersonId))];
}
