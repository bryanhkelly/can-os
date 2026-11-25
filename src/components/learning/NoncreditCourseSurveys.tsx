import { useEffect, useState } from "react";
import { EmptyState, QueryState } from "@/components/workspace";
import { CourseSurveyPanel } from "./CourseSurveyPanel";
import { listNoncreditCourseSurveys } from "@/modules/learning/course-surveys.functions";

type SurveyListing = Awaited<ReturnType<typeof listNoncreditCourseSurveys>>;

/**
 * Shared completion-feedback collection. The canonical invitation and
 * deployment decide what appears, never a hard-coded partner or route.
 */
export function NoncreditCourseSurveys({courseAttemptId,knowledgeCheckRevision=0}:{
  courseAttemptId:string;knowledgeCheckRevision?:number;
}) {
  return <NoncreditSurveySession key={courseAttemptId}
    courseAttemptId={courseAttemptId} knowledgeCheckRevision={knowledgeCheckRevision}/>;
}

function NoncreditSurveySession({courseAttemptId,knowledgeCheckRevision}:{
  courseAttemptId:string;knowledgeCheckRevision:number;
}) {
  const [surveys,setSurveys]=useState<SurveyListing|null>(null);
  const [error,setError]=useState(false);
  const [retryRevision,setRetryRevision]=useState(0);
  useEffect(()=>{
    let current=true;
    setSurveys(null);setError(false);
    void listNoncreditCourseSurveys({data:{courseAttemptId}})
      .then(rows=>{if(current)setSurveys(rows);})
      .catch(()=>{if(current)setError(true);});
    return ()=>{current=false;};
  },[courseAttemptId,knowledgeCheckRevision,retryRevision]);
  if(surveys===null)return <QueryState loading={!error&&"Checking for invited feedback surveys…"} error={error&&"Feedback is temporarily unavailable. No survey response was changed."} onRetry={()=>setRetryRevision(revision=>revision+1)}/>;
  if(!surveys.length)return <EmptyState title="No feedback survey available"
    description="If your provider enabled feedback, an invitation may appear after your knowledge check is submitted. Contact the organizer if a survey was expected."/>;
  return <section aria-label="Course feedback" className="space-y-4">
    <div className="border-b pb-3">
      <h3 className="text-base font-semibold">Your invited feedback</h3>
      <p className="text-sm text-muted-foreground">
        Tell the provider what was helpful and how future learning can improve.
        Feedback is separate from your knowledge check and completion result.
      </p>
    </div>
    {surveys.map(survey=><CourseSurveyPanel key={survey.campaignId}
      courseAttemptId={courseAttemptId} campaignId={survey.campaignId}/>)}
  </section>;
}
