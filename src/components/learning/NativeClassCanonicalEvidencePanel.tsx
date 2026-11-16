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
      <section aria-label="Learning and completion checklist" className="space-y-3">
        <h3 className="font-serif text-xl">Your learning checklist</h3>
        <p className="text-sm text-muted-foreground">
          These are your recorded learning facts, not all independently verified outcomes
          and not a substitute for the published completion policy. The provider
          determines which requirements apply.
        </p>
        <ol className="divide-y divide-border border border-border">
          <li className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Lessons and practice</p>
              <p className="text-sm text-muted-foreground">
                {query.data.completedLessons} of {query.data.totalLessons} lesson milestones recorded
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {query.data.totalLessons>0&&query.data.completedLessons===query.data.totalLessons
                ?"All recorded":"In progress"}
            </span>
          </li>
          <li className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Knowledge check</p>
              <p className="text-sm text-muted-foreground">
                {query.data.finalizedPassed>0
                  ?`${query.data.finalizedPassed} independently confirmed passing result(s)`
                  :query.data.finalizedAssessments>0
                    ?`${query.data.finalizedAssessments} independently confirmed result(s), none passing`
                    :query.data.currentAssessmentGrants>0
                      ?"Authorized knowledge check available below"
                      :"No approved knowledge check is currently assigned"}
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {query.data.finalizedPassed>0?"Passed":"Not confirmed"}
            </span>
          </li>
          <li className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Participation and attendance</p>
              <p className="text-sm text-muted-foreground">
                If your published Course policy requires it, staff verify this
                evidence separately. Viewing a projected lesson or checking off
                a lesson does not prove attendance minutes.
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">Provider review</span>
          </li>
          <li className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <p className="font-semibold">Course completion decision</p>
              <p className="text-sm text-muted-foreground">
                {query.data.classCompletionOutcomeRecorded
                  ?"An authorized Class completion outcome has been recorded."
                  :"No authorized Class completion outcome has been recorded yet."}
              </p>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {query.data.classCompletionOutcomeRecorded?"Recorded":"Pending"}
            </span>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Quiz results and lesson milestones do not automatically issue Course
          completion, academic credit, grades or certificates.
        </p>
      </section>
      <p className="text-sm text-muted-foreground">
        {query.data.currentAssessmentGrants>0
          ?"An approved canonical Course assessment grant is available. Open your knowledge check below. Final results require the responsible provider's independent confirmation."
          :"No currently authorized knowledge check is assigned to this Course Attempt. Your provider can grant access to a published Class knowledge check. Your existing lesson progress remains available."}
      </p>
      {query.data.currentAssessmentGrants>0&&<section
        className="border-t border-border pt-4" aria-label="Authorized Course knowledge check">
        <CourseAssessmentPanel courseAttemptId={query.data.courseAttemptId}
          phase="final" context="class" onAssessmentCompleted={()=>void query.refetch()}/>
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
