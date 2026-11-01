/**
 * A custody hold is a restriction on child release, not an authorization to
 * disclose the reporting guardian's allegations to another legal guardian.
 *
 * All presently authorized pickup guardians must see an ACTIVE release block,
 * but only the person who filed the hold may read its original sensitive reason
 * and resolution text. Other guardians cannot browse its historical details.
 * Site staff have a separate scoped custody workflow with full evidence.
 */
export function projectGuardianPickupHolds<T extends {
  id: string;
  status: string;
  kind: string;
  reason: string;
  createdByPersonId: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}>(rows: readonly T[], viewerPersonId: string) {
  return rows.filter(row =>
    row.status === "active" || row.createdByPersonId === viewerPersonId,
  ).map(row => {
    const reportingGuardian = row.createdByPersonId === viewerPersonId;
    return {
      id: row.id,
      status: row.status,
      kind: reportingGuardian ? row.kind : "restricted",
      reason: reportingGuardian ? row.reason :
        "Release is paused while school staff review a safety restriction. Contact the school through a verified channel.",
      createdAt: reportingGuardian ? row.createdAt.toISOString() : null,
      resolvedAt: reportingGuardian ? row.resolvedAt?.toISOString() ?? null : null,
      resolutionNote: reportingGuardian ? row.resolutionNote : null,
    };
  });
}
