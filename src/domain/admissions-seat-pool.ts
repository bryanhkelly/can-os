/**
 * A seat pool may pair a Program with a SchoolYear only when the year belongs to
 * the program's organization and either is program-specific to it or is the
 * host site's calendar. Shared by pool configuration and offer issuance.
 */
export type SchoolYearScope = { programId: string | null; organizationId: string; siteId: string | null };
export type ProgramScope = { id: string; organizationId: string; siteId: string | null };

export function schoolYearServesProgram(year: SchoolYearScope, program: ProgramScope): boolean {
  if (year.organizationId !== program.organizationId) return false;
  if (year.programId !== null) return year.programId === program.id && (program.siteId === null || year.siteId === program.siteId);
  return program.siteId !== null && year.siteId === program.siteId;
}
