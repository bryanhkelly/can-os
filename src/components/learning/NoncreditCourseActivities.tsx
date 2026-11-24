import { useEffect, useState } from "react";
import { DashboardProgress, EmptyState, QueryState, WorkspaceLinkNavigation, WorkspaceNotice } from "@/components/workspace";
import { CourseAssessmentPanel } from "./CourseAssessmentPanel";
import { NoncreditCourseSurveys } from "./NoncreditCourseSurveys";
import { getLearnerCourseParticipationKind } from "@/modules/learning/noncredit-learning.functions";
import { getNoncreditCompletionReadiness } from "@/modules/learning/noncredit-completion.functions";

type Readiness = Awaited<ReturnType<typeof getNoncreditCompletionReadiness>>;

/**
 * This content depends only on canonical course participation.
 * No recorded teacher, presentation, or instructional track is required.
 */
export function NoncreditCourseActivities({courseAttemptId,lessonProgressRevision=0}:{
  courseAttemptId:string;lessonProgressRevision?:number;
}) {
  return <NoncreditActivitiesSession key={courseAttemptId}
    courseAttemptId={courseAttemptId} lessonProgressRevision={lessonProgressRevision}/>;
}
function NoncreditActivitiesSession({courseAttemptId,lessonProgressRevision}:{
  courseAttemptId:string;lessonProgressRevision:number;
}) {
  const [source,setSource]=useState<"school"|"noncredit"|"class"|null>(null);
  const [hasBaseline,setHasBaseline]=useState(false);
  const [hasFinal,setHasFinal]=useState(false);
  const [readiness,setReadiness]=useState<Readiness|null>(null);
  const [sourceError,setSourceError]=useState(false);
  const [readinessError,setReadinessError]=useState(false);
  const [retryRevision,setRetryRevision]=useState(0);
  const [assessmentRevision,setAssessmentRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setSource(null);
    setSourceError(false);
    void getLearnerCourseParticipationKind({data:{courseAttemptId}}).then(result=>{
      if(active){
        setSource(result.source);
        setHasBaseline(result.hasBaseline);
        setHasFinal(result.hasFinal);
      }
    }).catch(()=>{if(active)setSourceError(true);});
    return ()=>{active=false;};
  },[courseAttemptId,retryRevision]);
  useEffect(()=>{
    if(source!=="noncredit")return;
    let active=true;
    setReadiness(null);
    setReadinessError(false);
    void getNoncreditCompletionReadiness({data:{courseAttemptId}})
      .then(status=>{if(active)setReadiness(status);})
      .catch(()=>{if(active)setReadinessError(true);});
    return ()=>{active=false;};
  },[courseAttemptId,source,lessonProgressRevision,assessmentRevision,retryRevision]);
  if(source===null)return <QueryState loading={!sourceError&&"Loading your course activities…"} error={sourceError&&"Your learning activities could not be loaded. No course progress was changed."} onRetry={()=>setRetryRevision(revision=>revision+1)}/>;
  if(source!=="noncredit")return null;
  return <div className="space-y-5" aria-label="Noncredit learning activities">
    <section className="border border-border bg-card p-5" aria-label="Your learning journey">
      <h2 className="font-serif text-2xl">Your learning journey</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Complete your published lessons, take the authorized knowledge check,
        respond to any invited feedback survey, and review your completion.
        Your progress remains your own if you switch recorded instructors.
      </p>
      <WorkspaceLinkNavigation label="Training steps" surface="plain" className="mt-4">
        {hasBaseline&&<a href="#course-baseline-check" className="font-semibold text-primary underline">Before learning: knowledge check</a>}
        <a href="#course-recorded-lessons" className="font-semibold text-primary underline">Recorded lessons</a>
        {hasFinal&&<a href="#course-final-check" className="font-semibold text-primary underline">Final knowledge check</a>}
        <a href="#course-feedback" className="font-semibold text-primary underline">Feedback</a>
        <a href="#course-progress" className="font-semibold text-primary underline">Completion</a>
      </WorkspaceLinkNavigation>
      {readiness&&<div className="mt-5">
        {readiness.totalLessons>0?<DashboardProgress label="Lesson progress" value={readiness.completedLessons}
          max={readiness.totalLessons} description={`${readiness.completedLessons} of ${readiness.totalLessons} lessons marked complete`}/>
          :<EmptyState title="No published lessons available."/>}
        <p className="mt-2 text-xs text-muted-foreground">
          {readiness.recordedCompletion?"Training completion confirmed.":
            readiness.eligible?"Learning requirements met; final completion decision is separate.":
            "Continue your approved learning and assessment requirements."}
          {readiness.totalLessons===0?" No published Course lessons are currently available.":""}
        </p>
      </div>}
    </section>
    <section id="course-knowledge-check" className="space-y-4" aria-label="Course knowledge checks">
      <h2 className="font-serif text-xl">Knowledge checks</h2>
    {hasBaseline&&<div id="course-baseline-check"><WorkspaceNotice>For a meaningful comparison, submit your baseline knowledge check before beginning lessons.</WorkspaceNotice><CourseAssessmentPanel courseAttemptId={courseAttemptId}
      phase="baseline" onAssessmentCompleted={()=>setAssessmentRevision(revision=>revision+1)}/></div>}
    {hasFinal&&<div id="course-final-check"><CourseAssessmentPanel courseAttemptId={courseAttemptId}
      phase="final" onAssessmentCompleted={()=>setAssessmentRevision(revision=>revision+1)}/></div>}
    {!hasBaseline&&!hasFinal&&<EmptyState title="No knowledge checks available" description="Only assessments authorized for your course appear here."/>}
    </section>
    <section id="course-feedback" className="space-y-4" aria-label="Training feedback">
      <h2 className="font-serif text-xl">Feedback survey</h2>
      <NoncreditCourseSurveys courseAttemptId={courseAttemptId}
        knowledgeCheckRevision={assessmentRevision}/>
    </section>
    <section id="course-progress" className="space-y-2 border bg-card p-4" aria-label="Course completion progress">
      <h3 className="font-serif text-lg font-semibold">Training completion</h3>
      {readiness?.policyVersion&&<p className="text-xs text-muted-foreground">
        Your requirements are locked to completion policy v{readiness.policyVersion}.
      </p>}
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
              readiness.eligible&&readiness.completionMode==="automatic"
                ?"Completion requirements satisfied; automatic confirmation is processing.":
              readiness.eligible?"Completion requirements satisfied; provider decision pending.":
                "Some completion requirements remain outstanding."}
          </p>
          <p className="text-xs text-muted-foreground">
            Marking a lesson complete does not verify video playback or attendance.
            Knowledge checks are separate from academic grades and credit.
          </p>
        </>:
        <QueryState loading={!readinessError?"Loading completion requirements…":undefined}
          error={readinessError?"Completion information is temporarily unavailable.":undefined}
          onRetry={()=>setRetryRevision(revision=>revision+1)}/>}
    </section>
  </div>;
}
