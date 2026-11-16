/**
 * WS3 completion references for WS1 Participation Read Model v1 and WS6.
 *
 * Pure projection of already authorized source rows, never a substitute
 * for authenticated source reads or the canonical DB decision validity gate.
 * Class Outcomes lack a pinned completion-policy authority on the baseline.
 */
export type NoncreditCompletionDecisionRef = {
  id: string;
  registrationId: string;
  outcome: "completed" | "not_yet_completed" | "voided";
  supersedesId: string | null;
  decidedAt: Date;
};
export type CurrentCompletionReference =
  | { state: "unavailable"; reason: "invalid_history" }
  | { state: "not_decided"; decisionId: null; completedAt: null; outcome: null }
  | {
      state: "completed" | "not_yet_completed" | "voided";
      decisionId: string;
      completedAt: string | null;
      outcome: { label: string; referenceId: string };
    };

/** Status changes never erase prior verified decision history; the latest
 * authoritative, unambiguous decision chain controls current validity.
 */
export function projectCurrentNoncreditCompletion(
  registrationId: string,
  source: readonly NoncreditCompletionDecisionRef[],
): CurrentCompletionReference {
  const decisions = source.filter(r => r.registrationId === registrationId);
  if (!registrationId || decisions.length !== source.length)
    return { state: "unavailable", reason: "invalid_history" };
  if (decisions.length === 0)
    return { state: "not_decided", decisionId: null, completedAt: null, outcome: null };
  const byId = new Map<string, NoncreditCompletionDecisionRef>();
  const replacementCounts = new Map<string, number>();
  for (const row of decisions) {
    if (!row.id || byId.has(row.id) ||
        !(row.decidedAt instanceof Date) ||
        !Number.isFinite(row.decidedAt.getTime()) ||
        (row.supersedesId !== null && row.supersedesId === row.id))
      return { state: "unavailable", reason: "invalid_history" };
    byId.set(row.id, row);
    if (row.supersedesId)
      replacementCounts.set(row.supersedesId, (replacementCounts.get(row.supersedesId) ?? 0) + 1);
  }
  for (const row of decisions) {
    if (row.supersedesId && (
      !byId.has(row.supersedesId) ||
      (replacementCounts.get(row.supersedesId) ?? 0) !== 1 ||
      row.decidedAt.getTime() < byId.get(row.supersedesId)!.decidedAt.getTime()
    )) return { state: "unavailable", reason: "invalid_history" };
  }
  const roots = decisions.filter(r => r.supersedesId === null);
  const heads = decisions.filter(r => !replacementCounts.has(r.id));
  if (roots.length !== 1 || heads.length !== 1)
    return { state: "unavailable", reason: "invalid_history" };
  const seen = new Set<string>();
  let node: NoncreditCompletionDecisionRef | undefined = heads[0]!;
  while (node) {
    if (seen.has(node.id)) return { state: "unavailable", reason: "invalid_history" };
    seen.add(node.id);
    node = node.supersedesId ? byId.get(node.supersedesId) : undefined;
  }
  if (seen.size !== decisions.length)
    return { state: "unavailable", reason: "invalid_history" };
  const head = heads[0]!;
  const labels = {
    completed: "Verified completion",
    not_yet_completed: "Not yet completed",
    voided: "Completion voided",
  } as const;
  return {
    state: head.outcome,
    decisionId: head.id,
    completedAt: head.outcome === "completed" ? head.decidedAt.toISOString() : null,
    outcome: { label: labels[head.outcome], referenceId: head.id },
  };
}

/** WS1 outcome projection remains null until an independently approved,
 * enrollment-pinned native Class completion authority exists.
 */
export function projectUnverifiedClassOutcome(): {
  outcome: null; completedAt: null; reason: "class_completion_authority_unavailable";
} {
  return {
    outcome: null,
    completedAt: null,
    reason: "class_completion_authority_unavailable",
  };
}

/** For WS6, count distinct current canonical decisions rather than revisions.
 * Invalid or competing histories fail the aggregate closed.
 */
export function countCurrentNoncreditCompletions(
  byRegistration: ReadonlyMap<string, readonly NoncreditCompletionDecisionRef[]>,
): { verifiedCompletions: number; undeterminedRegistrations: string[] } {
  let verifiedCompletions = 0;
  const undeterminedRegistrations: string[] = [];
  for (const [registrationId, rows] of byRegistration) {
    const decision = projectCurrentNoncreditCompletion(registrationId,rows);
    if (decision.state === "unavailable") undeterminedRegistrations.push(registrationId);
    else if (decision.state === "completed") verifiedCompletions++;
  }
  return { verifiedCompletions, undeterminedRegistrations };
}
