import {useQuery} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {QueryState, StatusBadge} from "@/components/workspace";
import {useWorkspaceSession} from "@/components/shell/WorkspaceSession";
import {getNoncreditTrainingReadiness} from "@/modules/enrollment/noncredit-enrollment-publication.functions";

/** Shared 6.1 pre-publication inventory for any authorized noncredit Course.
 * This is not a partner-specific template or a certificate of launch approval.
 */
export type NoncreditTrainingSelection={
  deploymentId:string;
  adoptionId:string;
  trainingVersionId:string;
  courseVersionId:string;
};
export function NoncreditTrainingReadiness({selection}:{
  selection:NoncreditTrainingSelection;
}){
  const {session,error}=useWorkspaceSession();
  const scope=session?.authenticated&&!error?JSON.stringify([session.activeGrantId,session.activeContext,session.ownerDelegation??null]):null;
  const query=useQuery({
    queryKey:["noncredit-training-readiness",scope,
      selection.deploymentId,selection.adoptionId,
      selection.trainingVersionId,selection.courseVersionId],
    queryFn:()=>getNoncreditTrainingReadiness({data:selection}),
    enabled:scope!==null,retry:false,staleTime:15_000,
  });
  const data=scope!==null&&!query.isError?query.data:undefined;
  const checks=data?[
    {
      label:"Published Course lessons",
      detail:data.lessonCount+" lesson"+(data.lessonCount===1?"":"s"),
      ready:data.lessonCount>0,
    },
    {
      label:"Published knowledge-check questions",
      detail:data.knowledgeQuestionCount+" question"+(data.knowledgeQuestionCount===1?"":"s"),
      ready:data.publishedKnowledgeCheck,
    },
    {
      label:"Knowledge-check attempt window",
      detail:data.knowledgeCheckOpen?"Open to eligible learners now":"Not currently open",
      ready:data.knowledgeCheckOpen,
    },
    {
      label:"Approved feedback campaign",
      detail:data.activeFeedbackCampaign
        ?data.feedbackQuestionCount+" active survey question"+(data.feedbackQuestionCount===1?"":"s")
        :"No active, matching, permissioned survey",
      ready:data.activeFeedbackCampaign,
    },
  ]:[];
  return <section aria-label="Noncredit training preparation" className="border border-border bg-muted/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 className="text-base font-semibold">Training content preflight</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          The selected Course and Deployment are already approved for this operator.
          Review content and invitation readiness before opening registration.
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" disabled={query.isFetching}
        loading={query.isFetching} onClick={()=>void query.refetch()}>
        Refresh checks
      </Button>
    </div>
    <QueryState
      loading={query.isPending?"Checking published lessons, assessments and feedback…":undefined}
      error={query.isError?"Training content readiness could not be verified. Do not treat this as approval.":undefined}
      onRetry={()=>void query.refetch()} retrying={query.isFetching}/>
    {data&&<dl className="mt-4 grid gap-3 sm:grid-cols-2">
      {checks.map(check=><div key={check.label} className="border border-border bg-card p-3">
        <dt className="text-xs text-muted-foreground">{check.label}</dt>
        <dd className="mt-1 text-sm font-semibold">{check.detail}</dd>
        <p className="mt-1 text-xs text-muted-foreground">
          <StatusBadge tone={check.ready?"success":"attention"}>{check.ready?"Configuration found":"Requires review before pilot activation"}</StatusBadge>
        </p>
      </div>)}
    </dl>}
    <p className="mt-3 text-xs leading-5 text-muted-foreground">
      Counts must match the approved training brief. This read-only check does not
      prove playback, assessment submission, automatic invitations, completion
      decisions, or a successful end-to-end learner journey. Enrollment publication
      remains independently governed.
    </p>
  </section>;
}
