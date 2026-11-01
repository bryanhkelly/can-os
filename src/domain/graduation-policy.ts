export type ApplicablePolicy = { id:string; academicYear:string; cohortStart:string|null; cohortEnd:string|null; supersedesRequirementSetId:string|null };
/** Resolve only institution-approved cohort policies; never guess from the current school year. */
export function resolveGraduationPolicy<T extends ApplicablePolicy>(policies: readonly T[], entryCohort:string):T {
 if(!entryCohort || !/^[0-9]{4}$/.test(entryCohort)) throw new Error("Documented student entry cohort required");
 const ids=new Set(policies.map(p=>p.id));
 if(ids.size!==policies.length) throw new Error("Duplicate graduation policy identities");
 const superseders=new Set<string>();
 for(const p of policies){
  if(p.supersedesRequirementSetId===p.id)throw new Error("Policy cannot supersede itself");
  if(p.supersedesRequirementSetId && superseders.has(p.supersedesRequirementSetId))throw new Error("Competing graduation policy supersession");
  if(p.supersedesRequirementSetId)superseders.add(p.supersedesRequirementSetId);
 }
 const replaced=new Set(policies.map(p=>p.supersedesRequirementSetId).filter((v):v is string=>Boolean(v)));
 for(const p of policies) {
  if(p.supersedesRequirementSetId && !ids.has(p.supersedesRequirementSetId)) throw new Error("Graduation policy supersession chain is incomplete");
  if((p.cohortStart===null)!==(p.cohortEnd===null)) throw new Error("Partially classified graduation policy cohort range");
  if(p.cohortStart!==null && p.cohortEnd!==null && (!/^[0-9]{4}$/.test(p.cohortStart) || !/^[0-9]{4}$/.test(p.cohortEnd) || p.cohortStart>p.cohortEnd)) throw new Error("Invalid graduation policy cohort range");
 }
 for(const p of policies){
  const traversed=new Set<string>();
  let node:typeof p|undefined=p;
  while(node?.supersedesRequirementSetId){
   if(traversed.has(node.id))throw new Error("Graduation policy supersession cycle");
   traversed.add(node.id);
   node=policies.find(other=>other.id===node!.supersedesRequirementSetId);
  }
 }
 // A legacy active policy without an attested cohort window may overlap any
 // classified policy. Never treat it as out-of-scope merely because bounds are NULL.
 const active=policies.filter(p=>!replaced.has(p.id));
 if(active.some(p=>p.cohortStart===null || p.cohortEnd===null))
   throw new Error("Unclassified active graduation policy requires registrar review");
 const candidates=active.filter(p=>p.cohortStart!==null && p.cohortEnd!==null && p.cohortStart<=entryCohort && p.cohortEnd>=entryCohort);
 if(candidates.length!==1) throw new Error("No unambiguous institution-approved graduation policy applies to this student's entry cohort");
 return candidates[0]!;
}


/**
 * One-time registrar-attested classification of a pre-cohort policy.
 * Other unknown policies may be classified separately, but the resolver
 * continues to fail closed until every active unknown policy is resolved.
 */
export function validateLegacyGraduationCohortClassification(
 policies: readonly ApplicablePolicy[],
 targetId: string,
 cohortStart: string,
 cohortEnd: string,
): void {
 if (!/^[0-9]{4}$/.test(cohortStart) || !/^[0-9]{4}$/.test(cohortEnd) || cohortStart > cohortEnd)
  throw new Error("Invalid legacy graduation cohort range");
 const target = policies.find(p => p.id === targetId);
 if (!target) throw new Error("Legacy graduation policy not found");
 if (target.cohortStart !== null || target.cohortEnd !== null)
  throw new Error("Graduation policy is already cohort classified");
 const replaced = new Set(policies.map(p => p.supersedesRequirementSetId).filter((id): id is string => Boolean(id)));
 // Revisions must keep cohort bounds exactly, not widen eligibility.
 for (const related of policies.filter(p => p.id === target.supersedesRequirementSetId || p.supersedesRequirementSetId === target.id)) {
  if (!related.cohortStart || !related.cohortEnd) continue; // still unresolved and fail-closed
  if (related.cohortStart !== cohortStart || related.cohortEnd !== cohortEnd)
   throw new Error("Legacy policy supersession cohort bounds conflict");
 }
 if (!replaced.has(targetId)) {
  for (const other of policies.filter(p => p.id !== targetId && !replaced.has(p.id))) {
   if (other.cohortStart === null || other.cohortEnd === null) continue;
   if (other.cohortStart <= cohortEnd && other.cohortEnd >= cohortStart)
    throw new Error("Legacy policy classification overlaps another active policy");
  }
 }
}
