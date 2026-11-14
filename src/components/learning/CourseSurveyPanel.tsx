import { useEffect, useState } from "react";
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
  useEffect(()=>{
    let active=true;
    setError("");
    setSurvey(null);
    void getCourseSurvey({data:{courseAttemptId,campaignId}})
      .then(result=>{if(active)setSurvey(result);})
      .catch(()=>{if(active)setError("This survey is not available for your registration.");});
    return ()=>{active=false;};
  },[courseAttemptId,campaignId]);
  if(error)return <p role="alert" className="text-sm">{error}</p>;
  if(!survey)return <p role="status" className="text-sm">Loading feedback questions...</p>;
  if(survey.submitted)return <p role="status" className="text-sm">
    Your feedback has been submitted. Thank you.
  </p>;
  return <LearningQuestionnaire title={survey.title} questions={survey.questions}
    submitLabel="Submit feedback" onSubmit={async answers=>{
      await submitCourseSurvey({data:{courseAttemptId,campaignId,answers}});
      setSurvey(current=>current?{...current,submitted:true,questions:[]}:null);
    }}/>;
}
