type RequirementObservation = {
  policyRequirementId: string;
  resultOrder: bigint;
  determination: string;
  verificationLevel: string;
  sourceEvidenceVersionId: string | null;
};

/** Only the latest determination for a requirement counts; older evidence remains historical. */
export function summarizeQualificationObservations(rows: readonly RequirementObservation[]) {
  const latest = new Map<string, RequirementObservation>();
  for (const row of rows) {
    const old = latest.get(row.policyRequirementId);
    if (!old || row.resultOrder > old.resultOrder) latest.set(row.policyRequirementId, row);
  }
  const current = [...latest.values()];
  return {
    requirementsObserved: current.length,
    satisfied: current.filter(row => row.determination === "satisfied").length,
    deficient: current.filter(row => row.determination === "deficient").length,
    pending: current.filter(row => row.determination === "pending").length,
    verified: current.filter(row => row.verificationLevel === "verified").length,
    evidenceLinked: current.filter(row => row.sourceEvidenceVersionId !== null).length,
  };
}
