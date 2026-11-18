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



/** Reconcile a bounded operator report against the same complete correction
 * chain used by the canonical completion-review workflow. Any ambiguous
 * chain must stop publication of counts rather than guessing by timestamp.
 */
export function currentNoncreditCompletionStates(
  registrationIds: readonly string[],
  source: readonly NoncreditCompletionDecisionRef[],
): {
  states: ReadonlyMap<string, CurrentCompletionReference["state"]>;
  invalidRegistrations: string[];
} {
  const registrationSet = new Set(registrationIds);
  const grouped = new Map<string, NoncreditCompletionDecisionRef[]>();
  const invalidRegistrations: string[] = [];
  for (const row of source) {
    if (!registrationSet.has(row.registrationId)) {
      invalidRegistrations.push(row.registrationId);
      continue;
    }
    const own = grouped.get(row.registrationId) ?? [];
    own.push(row);
    grouped.set(row.registrationId, own);
  }
  const states = new Map<string, CurrentCompletionReference["state"]>();
  for (const registrationId of registrationSet) {
    const projected = projectCurrentNoncreditCompletion(
      registrationId, grouped.get(registrationId) ?? [],
    );
    states.set(registrationId, projected.state);
    if (projected.state === "unavailable")
      invalidRegistrations.push(registrationId);
  }
  return { states, invalidRegistrations };
}

/**
 * WS1 v1 native Class outcome extension. The authoritative boolean is computed
 * by the canonical SQL function v301_ws3_class_completion_is_current, which
 * rechecks original policy and current lesson/Session/assessment evidence.
 * Never interpret raw Class Outcome result_code as verified completion.
 */
export type NativeClassGovernedOutcomeRef={
  id:string;
  classEnrollmentId:string;
  resultCode:"completed"|"not_yet_completed"|"voided";
  sourceKind:string;
  completionPolicyVersionId:string|null;
  supersedesOutcomeId:string|null;
  /** SQL authority, never a browser-supplied flag. */
  currentValidity:boolean;
};
export type NativeClassCompletionProjection=
  | {state:"not_decided";outcome:null;decisionId:null;verifiedCompletion:false}
  | {state:"unavailable";outcome:null;decisionId:null;verifiedCompletion:false}
  | {state:"completed"|"not_yet_completed"|"voided"|"source_invalid";
      outcome:{label:string;referenceId:string};
      decisionId:string;verifiedCompletion:boolean};

export function projectCurrentNativeClassCompletion(
  classEnrollmentId:string,
  rows:readonly NativeClassGovernedOutcomeRef[],
):NativeClassCompletionProjection{
  if(!classEnrollmentId||rows.some(row=>
      row.classEnrollmentId!==classEnrollmentId||
      row.sourceKind!=="ws3_governed"||!row.id||
      !row.completionPolicyVersionId))
    return {state:"unavailable",outcome:null,decisionId:null,verifiedCompletion:false};
  if(!rows.length)return {state:"not_decided",outcome:null,
    decisionId:null,verifiedCompletion:false};
  const byId=new Map(rows.map(row=>[row.id,row]));
  if(byId.size!==rows.length)
    return {state:"unavailable",outcome:null,decisionId:null,verifiedCompletion:false};
  const superseded=new Set(rows.flatMap(row=>row.supersedesOutcomeId?
    [row.supersedesOutcomeId]:[]));
  const heads=rows.filter(row=>!superseded.has(row.id));
  const roots=rows.filter(row=>row.supersedesOutcomeId===null);
  if(heads.length!==1||roots.length!==1||
     rows.some(row=>row.supersedesOutcomeId &&
       (!byId.has(row.supersedesOutcomeId)||
        row.supersedesOutcomeId===row.id)))
    return {state:"unavailable",outcome:null,decisionId:null,verifiedCompletion:false};
  const seen=new Set<string>();
  let next:NativeClassGovernedOutcomeRef|undefined=heads[0]!;
  while(next){
    if(seen.has(next.id))
      return {state:"unavailable",outcome:null,decisionId:null,verifiedCompletion:false};
    seen.add(next.id);
    next=next.supersedesOutcomeId?byId.get(next.supersedesOutcomeId):undefined;
  }
  if(seen.size!==rows.length)
    return {state:"unavailable",outcome:null,decisionId:null,verifiedCompletion:false};
  const head=heads[0]!;
  const verified=head.resultCode==="completed"&&head.currentValidity===true;
  const state=head.resultCode==="completed"&&!verified?
    "source_invalid":head.resultCode;
  const label=state==="completed"?"Verified Class completion":
    state==="voided"?"Class completion voided":
    state==="not_yet_completed"?"Requirements not yet completed":
    "Completion requires independent revalidation";
  return {state,decisionId:head.id,
    outcome:{label,referenceId:head.id},verifiedCompletion:verified};
}
