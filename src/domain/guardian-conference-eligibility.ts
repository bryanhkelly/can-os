/**
 * Mirror conference-service's active Program + optional Section eligibility
 * for choosing a child in the guardian UI. Booking still rechecks the database
 * in its transaction; these read-side candidates are not authorization.
 */
export type ConferenceProgramMember = {
  studentPersonId: string;
  studentProfileId: string;
  programId: string;
  siteId: string | null;
};
export type ConferenceSectionMember = {
  studentProfileId: string;
  sectionId: string;
  programId: string;
  siteId: string | null;
};
export function eligibleGuardianConferenceStudents(
  slot: { siteId: string; sectionId: string | null },
  programs: readonly ConferenceProgramMember[],
  sections: readonly ConferenceSectionMember[],
): string[] {
  return [...new Set(programs.filter(member =>
    member.siteId === slot.siteId &&
    (!slot.sectionId || sections.some(section =>
      section.studentProfileId === member.studentProfileId &&
      section.sectionId === slot.sectionId &&
      section.programId === member.programId &&
      section.siteId === slot.siteId,
    )),
  ).map(member => member.studentPersonId))];
}
