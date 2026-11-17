/** Immutable canonical assessment result revision projection for one Person's
 * Course Attempts. This is *not* a new grading or assessment authority.
 * SQL v301_ws3_class_completion_is_current uses the greatest result_revision,
 * not only supersedes_id links, to decide which grading result is current.
 */
export type CanonicalAssessmentRevision={
  id:string;
  attemptId:string;
  resultRevision:number;
  supersedesId:string|null;
};

/** Fail closed on duplicate, invalid, ambiguous latest revisions.
 * Earlier passing grades never survive a later voided/provisional/failing
 * result merely because its supersedes_id link is absent.
 */
export function latestCanonicalAssessmentRevisions<T extends CanonicalAssessmentRevision>(
  rows:readonly T[],
):{current:T[];ambiguousAttemptIds:string[]}{
  const byAttempt=new Map<string,T[]>();
  const ambiguous=new Set<string>();
  for(const row of rows){
    if(!row.id||!row.attemptId||!Number.isSafeInteger(row.resultRevision)||
       row.resultRevision<1){ambiguous.add(row.attemptId||"unknown");continue;}
    const existing=byAttempt.get(row.attemptId)??[];
    existing.push(row);byAttempt.set(row.attemptId,existing);
  }
  const current:T[]=[];
  for(const [attemptId,versions] of byAttempt){
    if(versions.length!==new Set(versions.map(row=>row.id)).size){
      ambiguous.add(attemptId);continue;
    }
    const revisions=versions.map(row=>row.resultRevision);
    if(revisions.length!==new Set(revisions).size){
      ambiguous.add(attemptId);continue;
    }
    const highest=Math.max(...revisions);
    const latest=versions.filter(row=>row.resultRevision===highest);
    if(latest.length!==1){ambiguous.add(attemptId);continue;}
    current.push(latest[0]!);
  }
  return {current,ambiguousAttemptIds:[...ambiguous]};
}
