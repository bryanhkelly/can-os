import { useEffect, useState } from "react";
import { QueryState, WorkspaceNotice } from "@/components/workspace";
import { LearningQuestionnaire } from "./LearningQuestionnaire";
import { getCourseSurvey, submitCourseSurvey } from "@/modules/learning/course-surveys.functions";

type Survey = Awaited<ReturnType<typeof getCourseSurvey>>;

/** Embed in any authorized learning experience; it owns no route or school state. */
export function CourseSurveyPanel({courseAttemptId,campaignId}:{
  courseAttemptId:string;campaignId:string;
}) {
  return <CourseSurveySession key={courseAttemptId+":"+campaignId}
    courseAttemptId={courseAttemptId} campaignId={campaignId}/>;
}
function CourseSurveySession({courseAttemptId,campaignId}:{
  courseAttemptId:string;campaignId:string;
}) {
  const [survey,setSurvey]=useState<Survey|null>(null);
  const [error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    setError("");
    setSurvey(null);
    void getCourseSurvey({data:{courseAttemptId,campaignId}})
      .then(result=>{if(active)setSurvey(result);})
      .catch(()=>{if(active)setError("This survey is not available for your registration.");});
    return ()=>{active=false;};
  },[courseAttemptId,campaignId,retry]);
  if(!survey)return <QueryState loading={!error&&"Loading feedback questions…"} error={error} onRetry={()=>setRetry(value=>value+1)}/>;
  if(survey.submitted)return <WorkspaceNotice tone="success">Your feedback has been submitted. Thank you.</WorkspaceNotice>;
  return <LearningQuestionnaire title={survey.title} questions={survey.questions}
    submitLabel="Submit feedback" onSubmit={async answers=>{
      await submitCourseSurvey({data:{courseAttemptId,campaignId,answers}});
      setSurvey(current=>current?{...current,submitted:true,questions:[]}:null);
    }}/>;
}
