import { useEffect, useState } from "react";
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
  const [error,setError]=useState(false);
  const [assessmentRevision,setAssessmentRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    setSource(null);
    void getLearnerCourseParticipationKind({data:{courseAttemptId}}).then(result=>{
      if(active){
        setSource(result.source);
        setHasBaseline(result.hasBaseline);
        setHasFinal(result.hasFinal);
      }
    }).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[courseAttemptId]);
  useEffect(()=>{
    if(source!=="noncredit")return;
    let active=true;
    setError(false);
    void getNoncreditCompletionReadiness({data:{courseAttemptId}})
      .then(status=>{if(active)setReadiness(status);})
      .catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[courseAttemptId,source,lessonProgressRevision,assessmentRevision]);
  if(error&&source===null)return <p role="alert" className="border border-border p-4 text-sm">
    Your learning activities could not be loaded. Refresh to retry; no progress has been changed.
  </p>;
  if(source===null)return <p role="status" className="text-sm">Loading your course activities…</p>;
  if(source!=="noncredit")return null;
  return <div className="space-y-5" aria-label="Noncredit learning activities">
    <section className="border border-border bg-card p-5" aria-label="Your learning journey">
      <h2 className="font-serif text-2xl">Your learning journey</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Watch your recorded lessons, take the authorized knowledge check, and track
        your learning progress. Your participation record remains your own even
        if you switch recorded instructors.
      </p>
      <nav aria-label="Training steps" className="mt-4 flex flex-wrap gap-4 text-sm">
        <a href="#course-recorded-lessons" className="font-semibold text-primary underline">1. Recorded lessons</a>
        <a href="#course-knowledge-check" className="font-semibold text-primary underline">2. Knowledge checks</a>
        <a href="#course-progress" className="font-semibold text-primary underline">3. Completion progress</a>
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
      <h2 className="font-serif text-xl">Knowledge checks and feedback</h2>
    {hasBaseline&&<CourseAssessmentPanel courseAttemptId={courseAttemptId}
      phase="baseline" onAssessmentCompleted={()=>setAssessmentRevision(revision=>revision+1)}/>}
    {hasFinal&&<CourseAssessmentPanel courseAttemptId={courseAttemptId}
      phase="final" onAssessmentCompleted={()=>setAssessmentRevision(revision=>revision+1)}/>} 
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
          {error?"Completion information is temporarily unavailable.":"Loading completion requirements..."}
        </p>}
    </section>
  </div>;
}
