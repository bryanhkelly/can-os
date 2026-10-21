/**
 * Class assessment evidence intentionally stays distinct from student-reported
 * lesson completion. Neither is, by itself, a mastery or transcript-credit award.
 */
export type ClassAssessment = {
 id:string; title:string; pointsPossible:string|null; status:"published"|"closed"|"draft"|"archived";
 metadata:Record<string,unknown>;
};
export type AssessmentAttempt = {
 assessmentId:string; attemptNumber:number; status:string; score:string|null;
};
export type ClassAssessmentEvidence = {
 id:string; title:string; unitId:string|null; pointsPossible:number|null;
 attemptNumber:number|null; status:"not_submitted"|"submitted"|"graded"|"returned"|"draft";
 score:number|null;
};
const unitIdPattern=/^[A-Za-z0-9_-]{1,100}$/;
function safePoints(value:string|null){
 if(value===null)return null;
 const parsed=Number(value);
 return Number.isFinite(parsed)&&parsed>=0?parsed:null;
}
export function buildClassAssessmentEvidence(
 assessments:ClassAssessment[], attempts:AssessmentAttempt[],
):ClassAssessmentEvidence[]{
 const latest=new Map<string,AssessmentAttempt>();
 for(const attempt of attempts){
  const prior=latest.get(attempt.assessmentId);
  if(!prior||attempt.attemptNumber>prior.attemptNumber)latest.set(attempt.assessmentId,attempt);
 }
 return assessments
  .filter(assessment=>assessment.status==="published"||assessment.status==="closed")
  .map(assessment=>{
   const attempt=latest.get(assessment.id);
   const status=attempt?.status==="submitted"?"submitted":
    attempt?.status==="graded"?"graded":
    attempt?.status==="returned"?"returned":
    attempt?.status==="assigned"?"draft":"not_submitted";
   const score=(status==="graded"||status==="returned")?safePoints(attempt?.score??null):null;
   const unit=assessment.metadata.unitId;
   return {
    id:assessment.id,title:assessment.title,
    unitId:typeof unit==="string"&&unitIdPattern.test(unit)?unit:null,
    pointsPossible:safePoints(assessment.pointsPossible),
    attemptNumber:attempt?.attemptNumber??null,
    status,score,
   };
  });
}
export function summarizeClassAssessmentEvidence(items:ClassAssessmentEvidence[]){
 return {
  assigned:items.length,
  graded:items.filter(item=>(item.status==="graded"||item.status==="returned")&&item.score!==null).length,
  awaitingFeedback:items.filter(item=>item.status==="submitted").length,
  notSubmitted:items.filter(item=>item.status==="not_submitted"||item.status==="draft").length,
 };
}
