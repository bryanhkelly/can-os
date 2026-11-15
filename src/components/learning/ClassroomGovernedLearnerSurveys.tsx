import { useEffect, useState } from "react";
import { CourseSurveyPanel } from "@/components/learning/CourseSurveyPanel";
import { getClassroomLearnerSurveys } from "@/modules/learning/classroom-surveys.functions";

type Listing=Awaited<ReturnType<typeof getClassroomLearnerSurveys>>;

/**
 * Only personally invited, identified noncredit Course surveys are shown.
 * School, anonymous, confidential, safety-triage and complex branching flows
 * stay with their own approved survey workflows and are not broadened here.
 */
export function ClassroomGovernedLearnerSurveys({
  facilitatedSessionId,courseAttemptId,
}:{facilitatedSessionId:string;courseAttemptId:string}){
  const [data,setData]=useState<Listing|null>(null);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let active=true;
    setError(false);setData(null);
    void getClassroomLearnerSurveys({data:{
      facilitatedSessionId,courseAttemptId,
    }}).then(result=>{
      if(active)setData(result);
    }).catch(()=>{if(active)setError(true);});
    return ()=>{active=false;};
  },[facilitatedSessionId,courseAttemptId]);
  if(error)return null; // Other survey modes do not use this limited identified route.
  if(!data?.surveys.length)return null;
  return <section className="mt-6 border border-border bg-card p-5"
    aria-label="Approved classroom surveys">
    <h2 className="font-serif text-xl font-semibold">Approved session surveys</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Your individual invitation and the survey's consent rules determine
      whether you can respond. Answers are separate from classroom
      practice, feedback ratings, academic grades and attendance.
    </p>
    {data.surveys.map(survey=><article key={survey.campaignId+survey.stage}
      className="mt-4 border-t border-border pt-4">
      <h3 className="text-sm font-semibold">
        {survey.stage==="entry"?"Before the lesson":
          survey.stage==="pulse"?"During the course":"After the lesson"}: {survey.title}
      </h3>
      <CourseSurveyPanel courseAttemptId={courseAttemptId}
        campaignId={survey.campaignId}/>
    </article>)}
  </section>;
}
