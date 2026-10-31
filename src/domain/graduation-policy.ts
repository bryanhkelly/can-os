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
  if(p.cohortStart && p.cohortEnd && p.cohortStart>p.cohortEnd) throw new Error("Invalid graduation policy cohort range");
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
 const candidates=policies.filter(p=>!replaced.has(p.id) && p.cohortStart!==null && p.cohortEnd!==null && p.cohortStart<=entryCohort && p.cohortEnd>=entryCohort);
 if(candidates.length!==1) throw new Error("No unambiguous institution-approved graduation policy applies to this student's entry cohort");
 return candidates[0]!;
}
