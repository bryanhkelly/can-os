import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
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
  if(sourceError&&source===null)return <WorkspaceNotice tone="danger">
    <p>Your learning activities could not be loaded. No course progress was changed.</p>
    <Button className="mt-3" type="button" variant="outline" size="sm"
      onClick={()=>setRetryRevision(revision=>revision+1)}>Retry learning activities</Button>
  </WorkspaceNotice>;
  if(source===null)return <p role="status" className="text-sm">Loading your course activities…</p>;
  if(source!=="noncredit")return null;
  return <div className="space-y-5" aria-label="Noncredit learning activities">
    <section className="border border-border bg-card p-5" aria-label="Your learning journey">
      <h2 className="font-serif text-2xl">Your learning journey</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Complete your published lessons, take the authorized knowledge check,
        respond to any invited feedback survey, and review your completion.
        Your progress remains your own if you switch recorded instructors.
      </p>
      <nav aria-label="Training steps" className="mt-4 flex flex-wrap gap-4 text-sm">
        <a href="#course-recorded-lessons" className="font-semibold text-primary underline">1. Recorded lessons</a>
        <a href="#course-knowledge-check" className="font-semibold text-primary underline">2. Knowledge check</a>
        <a href="#course-feedback" className="font-semibold text-primary underline">3. Feedback survey</a>
        <a href="#course-progress" className="font-semibold text-primary underline">4. Completion</a>
      </nav>
      {readiness&&<div className="mt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <strong>Lesson progress</strong>
          <span className="tabular-nums">{readiness.completedLessons} of {readiness.totalLessons} completed</span>
        </div>
        <progress className="mt-2 h-3 w-full accent-primary"
          value={readiness.completedLessons} max={Math.max(1,readiness.totalLessons)}
          aria-label="Completed course lessons"/>
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
    {hasBaseline&&<CourseAssessmentPanel courseAttemptId={courseAttemptId}
      phase="baseline" onAssessmentCompleted={()=>setAssessmentRevision(revision=>revision+1)}/>}
    {hasFinal&&<CourseAssessmentPanel courseAttemptId={courseAttemptId}
      phase="final" onAssessmentCompleted={()=>setAssessmentRevision(revision=>revision+1)}/>} 
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
        <p className="text-sm" role="status">
          {readinessError?"Completion information is temporarily unavailable.":"Loading completion requirements..."}
        </p>}
      {readinessError&&<Button type="button" size="sm" variant="outline"
        onClick={()=>setRetryRevision(revision=>revision+1)}>Retry completion status</Button>}
    </section>
  </div>;
}
