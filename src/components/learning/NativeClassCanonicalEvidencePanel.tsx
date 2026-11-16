import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { CourseAssessmentPanel } from "@/components/learning/CourseAssessmentPanel";
import { NoncreditCourseSurveys } from "@/components/learning/NoncreditCourseSurveys";
import { getNativeClassCanonicalEvidence } from "@/modules/classes/native-class-canonical-evidence.functions";

/** Existing canonical evidence only. No parallel Class quiz or completion authority. */
export function NativeClassCanonicalEvidencePanel({classEnrollmentId}:{
  classEnrollmentId:string;
}){
  const query=useQuery({
    queryKey:["native-class-canonical-evidence",classEnrollmentId],
    queryFn:()=>getNativeClassCanonicalEvidence({data:{classEnrollmentId}}),
    retry:false,refetchOnReconnect:true,
  });
  return <section className="space-y-4 border border-border bg-card p-5"
    aria-label="Your Course learning evidence">
    <div>
      <h2 className="font-serif text-2xl">Learning activities and outcomes</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Your Class uses the same Course Attempt, lesson evidence, assessments
        and governed outcome records as other CAN learning experiences.
        Shared-room playback does not prove individual completion.
      </p>
    </div>
    {query.isPending&&<p role="status">Checking your authorized learning evidence…</p>}
    {query.isError&&<div role="alert" className="space-y-3">
      <p>Your canonical learning evidence could not be verified. No progress was changed.</p>
      <Button variant="outline" type="button" onClick={()=>void query.refetch()}>
        Retry evidence check
      </Button>
    </div>}
    {query.data&&<>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="border border-border p-3">
          <p className="text-xs text-muted-foreground">Recorded lesson milestones</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {query.data.completedLessons} / {query.data.totalLessons}
          </p>
        </div>
        <div className="border border-border p-3">
          <p className="text-xs text-muted-foreground">Finalized canonical assessments</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">
            {query.data.finalizedAssessments}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {query.data.finalizedPassed} meeting published thresholds
          </p>
        </div>
        <div className="border border-border p-3">
          <p className="text-xs text-muted-foreground">Class completion outcome</p>
          <p className="mt-2 text-sm font-semibold">
            {query.data.classCompletionOutcomeRecorded?"Recorded":"Not recorded"}
          </p>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        {query.data.currentAssessmentGrants>0
          ?"An approved canonical Course assessment grant is available. Open your knowledge check below. Final results require the responsible provider's independent confirmation."
          :"No currently authorized knowledge check is assigned to this Course Attempt. Your provider can grant access to a published Class knowledge check. Your existing lesson progress remains available."}
      </p>
      {query.data.currentAssessmentGrants>0&&<section
        className="border-t border-border pt-4" aria-label="Authorized Course knowledge check">
        <CourseAssessmentPanel courseAttemptId={query.data.courseAttemptId}
          phase="final" onAssessmentCompleted={()=>void query.refetch()}/>
      </section>}
      <NoncreditCourseSurveys courseAttemptId={query.data.courseAttemptId}/>
      <p className="text-xs text-muted-foreground">{query.data.note}</p>
      <Button variant="outline" type="button"
        disabled={query.isFetching} onClick={()=>void query.refetch()}>
        {query.isFetching?"Checking…":"Refresh my evidence"}
      </Button>
    </>}
  </section>;
}
