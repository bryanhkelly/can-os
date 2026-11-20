import { useQuery } from "@tanstack/react-query";
import { CourseAssessmentPanel } from "@/components/learning/CourseAssessmentPanel";
import { getNativeClassKnowledgeCheckAvailability } from
  "@/modules/classes/native-class-knowledge-check-availability.functions";

/** Reuses the existing objective assessment player and its independent
 * published-form, access-grant and scoring gates. No draft is playable. */
export function NativeClassKnowledgeCheckPanel({courseAttemptId}:{courseAttemptId:string}){
  const readiness=useQuery({
    queryKey:["native-class-knowledge-check-availability",courseAttemptId],
    queryFn:()=>getNativeClassKnowledgeCheckAvailability({data:{courseAttemptId}}),
    retry:false,
  });
  return <section aria-label="Class knowledge check" className="space-y-4 border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Knowledge checks</h2>
    <p className="text-sm text-muted-foreground">
      These practice checks are separate from homework, academic grades and
      official credit. Only your provider's published, individually assigned
      checks can be started.
    </p>
    {readiness.isPending&&<p role="status" className="text-sm">
      Checking your published assessment access…
    </p>}
    {readiness.isError&&<p role="alert" className="text-sm">
      Assessment access could not be verified for your active Class.
    </p>}
    {readiness.data&&!readiness.data.available&&<p role="status" className="text-sm">
      No approved knowledge check is currently available for this Class.
      Your Course lessons and written homework remain available.
    </p>}
    {readiness.data?.available&&
      <CourseAssessmentPanel courseAttemptId={courseAttemptId} context="class" phase="final"/>}
  </section>;
}
