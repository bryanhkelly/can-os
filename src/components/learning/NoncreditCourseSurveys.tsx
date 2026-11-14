import { useEffect, useState } from "react";
import { CourseSurveyPanel } from "./CourseSurveyPanel";
import { listNoncreditCourseSurveys } from "@/modules/learning/course-surveys.functions";

type SurveyListing = Awaited<ReturnType<typeof listNoncreditCourseSurveys>>;

/**
 * Shared completion-feedback collection. The canonical invitation and
 * deployment decide what appears, never a hard-coded partner or route.
 */
export function NoncreditCourseSurveys({courseAttemptId}:{courseAttemptId:string}) {
  return <NoncreditSurveySession key={courseAttemptId} courseAttemptId={courseAttemptId}/>;
}

function NoncreditSurveySession({courseAttemptId}:{courseAttemptId:string}) {
  const [surveys,setSurveys]=useState<SurveyListing>([]);
  const [error,setError]=useState(false);
  useEffect(()=>{
    let current=true;
    setSurveys([]);setError(false);
    void listNoncreditCourseSurveys({data:{courseAttemptId}})
      .then(rows=>{if(current)setSurveys(rows);})
      .catch(()=>{if(current)setError(true);});
    return ()=>{current=false;};
  },[courseAttemptId]);
  if(error)return <p role="status" className="border p-3 text-sm">
    Course feedback is temporarily unavailable.
  </p>;
  if(!surveys.length)return null;
  return <section aria-label="Course feedback" className="space-y-4">
    <div className="border-b pb-3">
      <h3 className="font-serif text-xl font-semibold">Course feedback</h3>
      <p className="text-sm text-muted-foreground">
        Tell the provider what was helpful and how future learning can improve.
        Feedback is separate from your knowledge check and completion result.
      </p>
    </div>
    {surveys.map(survey=><CourseSurveyPanel key={survey.campaignId}
      courseAttemptId={courseAttemptId} campaignId={survey.campaignId}/>)}
  </section>;
}
