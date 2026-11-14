import { useEffect, useState } from "react";
import { CourseAssessmentPanel } from "./CourseAssessmentPanel";
import { getLearnerCourseParticipationKind } from "@/modules/learning/noncredit-learning.functions";
import { getNoncreditCompletionReadiness } from "@/modules/learning/noncredit-completion.functions";

type Readiness = Awaited<ReturnType<typeof getNoncreditCompletionReadiness>>;

/**
 * This content depends only on canonical course participation.
 * No recorded teacher, presentation, or instructional track is required.
 */
export function NoncreditCourseActivities({courseAttemptId}:{courseAttemptId:string}) {
  return <NoncreditActivitiesSession key={courseAttemptId} courseAttemptId={courseAttemptId}/>;
}
function NoncreditActivitiesSession({courseAttemptId}:{courseAttemptId:string}) {
  const [source,setSource]=useState<"school"|"noncredit"|null>(null);
  const [readiness,setReadiness]=useState<Readiness|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;
    setSource(null);setReadiness(null);setError(false);
    void getLearnerCourseParticipationKind({data:{courseAttemptId}}).then(result=>{
      if(!active)return;
      setSource(result.source);
      if(result.source!=="noncredit")return;
      return getNoncreditCompletionReadiness({data:{courseAttemptId}}).then(status=>{
        if(active)setReadiness(status);
      }).catch(()=>{if(active)setError(true);});
    }).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[courseAttemptId]);
  if(source!=="noncredit")return null;
  return <div className="space-y-4" aria-label="Noncredit learning activities">
    <CourseAssessmentPanel courseAttemptId={courseAttemptId}/>
    <section className="space-y-2 border bg-card p-4">
      <h3 className="font-serif text-lg font-semibold">Training completion</h3>
      {readiness?
        <>
          <p className="text-sm">
            {readiness.completedLessons} of {readiness.totalLessons} lessons marked complete
            {readiness.lessonsRequired?" (required)":" (learning progress)"}.
          </p>
          <p className="text-sm">
            {readiness.countedMinutes} of {readiness.requiredMinutes} verified participation minutes
            {readiness.requiredMinutes?" required.":" required by this policy."}
          </p>
          <p className="text-sm">
            {readiness.recordedCompletion?"Training completion recorded.":
              readiness.eligible?"Completion requirements satisfied; provider decision pending.":
                "Some completion requirements remain outstanding."}
          </p>
          <p className="text-xs text-muted-foreground">
            Marking a lesson complete does not verify video playback or attendance.
            Knowledge checks are separate from academic grades and credit.
          </p>
        </>:
        <p className="text-sm" role="status">
          {error?"Completion information is temporarily unavailable.":"Loading completion requirements..."}
        </p>}
    </section>
  </div>;
}
