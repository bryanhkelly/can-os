/**
 * A guardian with current pickup rights can see whether a student was released,
 * and to whom, but a denied attempt is an internal child-safety incident, not
 * a license to disclose a stranger's name or the staff's identity notes.
 *
 * Keep staff observations and denial reasons in the restricted event ledger.
 * The family view is deliberately a separate minimal read model.
 */
export function projectGuardianPickupReleaseEvents<T extends {
  id: string;
  studentProfileId: string;
  householdId: string;
  programId: string;
  status: string;
  presentedName: string;
  denialReason: string | null;
  handoffEvidence: string | null;
  occurredAt: Date;
}>(rows: readonly T[]) {
  return rows.map(row => ({
    id: row.id,
    studentProfileId: row.studentProfileId,
    householdId: row.householdId,
    programId: row.programId,
    status: row.status,
    presentedName: row.status === "released" ? row.presentedName : "Pickup not released",
    denialReason: null,
    handoffEvidence: null,
    occurredAt: row.occurredAt.toISOString(),
  }));
}
