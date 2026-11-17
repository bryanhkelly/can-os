/**
 * WS3 read-only mirror of the proposed SQL Class policy pinning contract.
 * This selects a policy for an original enrollment only; it is NOT an
 * authorization to mutate a pin or record a completion decision.
 */
export type ClassCompletionPolicyCandidate={
  id:string;
  classId:string;
  courseVersionId:string;
  versionNo:number;
  effectiveAt:Date;
  publishedAt:Date;
  authoredByPersonId:string;
  approvedByPersonId:string;
  requireAllLessons:boolean;
  requiredVerifiedSessions:number;
  requirePassingAssessment:boolean;
};

function validAt(date:Date,at:Date):boolean {
  return date instanceof Date && Number.isFinite(date.getTime()) &&
    date.getTime()<=at.getTime();
}

export function eligibleClassPoliciesAtEnrollment(input:{
  classId:string;
  courseVersionId:string;
  enrolledAt:Date;
  policies:readonly ClassCompletionPolicyCandidate[];
}):ClassCompletionPolicyCandidate[] {
  const {classId,courseVersionId,enrolledAt}=input;
  if (!classId || !courseVersionId || !validAt(enrolledAt,enrolledAt))
    return [];
  return input.policies.filter(policy=>
    policy.classId===classId && policy.courseVersionId===courseVersionId &&
    !!policy.id && !!policy.authoredByPersonId && !!policy.approvedByPersonId &&
    policy.authoredByPersonId!==policy.approvedByPersonId &&
    Number.isSafeInteger(policy.versionNo) && policy.versionNo>0 &&
    Number.isSafeInteger(policy.requiredVerifiedSessions) &&
    policy.requiredVerifiedSessions>=0 &&
    (policy.requireAllLessons || policy.requiredVerifiedSessions>0 ||
      policy.requirePassingAssessment) &&
    validAt(policy.publishedAt,enrolledAt) &&
    validAt(policy.effectiveAt,enrolledAt)
  ).sort((a,b)=>b.effectiveAt.getTime()-a.effectiveAt.getTime() ||
    b.versionNo-a.versionNo);
}

export function resolveOriginalClassCompletionPolicy(input:{
  classId:string;
  courseVersionId:string;
  enrolledAt:Date;
  policies:readonly ClassCompletionPolicyCandidate[];
}):{policyId:string|null;source:"original_enrollment";ambiguous:boolean} {
  const eligible=eligibleClassPoliciesAtEnrollment(input);
  const seenVersion=new Set<number>();
  const seenId=new Set<string>();
  for(const policy of eligible){
    if(seenId.has(policy.id)||seenVersion.has(policy.versionNo))
      return {policyId:null,source:"original_enrollment",ambiguous:true};
    seenVersion.add(policy.versionNo);
    seenId.add(policy.id);
  }
  return {policyId:eligible[0]?.id??null,source:"original_enrollment",
    ambiguous:false};
}
