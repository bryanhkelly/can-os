import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, WorkspaceNotice } from "@/components/workspace";
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
  if(error)return <WorkspaceNotice tone="danger">
    <p>Feedback is temporarily unavailable. No survey response was changed.</p>
    <Button type="button" size="sm" variant="outline" className="mt-3"
      onClick={()=>setRetryRevision(revision=>revision+1)}>Retry feedback</Button>
  </WorkspaceNotice>;
  if(surveys===null)return <p role="status" className="text-sm">Checking for invited feedback surveys…</p>;
  if(!surveys.length)return <EmptyState title="No feedback survey available"
    description="Your provider must publish a survey and invite you before it appears here. Contact the organizer if a survey was expected."/>;
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
