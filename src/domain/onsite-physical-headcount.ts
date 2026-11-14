/**
 * Deduplicated staff-observed attendance, NOT a live building occupancy count.
 * A learner can be rostered in several programs. A witnessed arrival does not
 * establish continued presence after pickup, departure or a supervision gap.
 */
export type OnsiteHeadcountRow = {
  studentProfileId: string;
  programId: string;
  status: string;
  attendanceEventId: string | null;
};

const onsiteMarks = new Set(["present", "tardy"]);
const awayMarks = new Set(["absent", "excused"]);
const validMarks = new Set([...onsiteMarks, ...awayMarks]);

export function deriveOnsiteObservedHeadcount(rows: readonly OnsiteHeadcountRow[]) {
  const byStudent = new Map<string, { expected: number; observed: boolean; away: boolean; unmarked: boolean }>();
  for (const row of rows) {
    // Invalid or anonymous identifiers must not manufacture a distinct person.
    if (!row.studentProfileId) continue;
    const entry = byStudent.get(row.studentProfileId) ?? {
      expected: 0, observed: false, away: false, unmarked: false,
    };
    entry.expected += 1;
    const marked = Boolean(row.attendanceEventId) && validMarks.has(row.status);
    entry.observed ||= marked && onsiteMarks.has(row.status);
    entry.away ||= marked && awayMarks.has(row.status);
    entry.unmarked ||= !marked;
    byStudent.set(row.studentProfileId, entry);
  }
  const people = [...byStudent.values()];
  const conflictingObservations = people.filter(person => person.observed && person.away).length;
  return {
    scopedRosterEntries: rows.length,
    distinctExpectedStudents: people.length,
    observedOnsiteStudents: people.filter(person => person.observed).length,
    recordedAwayOnlyStudents: people.filter(person => person.away && !person.observed && !person.unmarked).length,
    studentsWithIncompleteMarks: people.filter(person => person.unmarked).length,
    conflictingObservations,
    sharedProgramStudents: people.filter(person => person.expected > 1).length,
    // True current occupancy needs a separately witnessed arrival/departure ledger.
    currentPhysicalHeadcountVerified: false as const,
  };
}
