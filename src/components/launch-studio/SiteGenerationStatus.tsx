import type {GenerationEligibility} from "@/domain/site-generation-status";
import {AsyncOperationStatus,type OperationState} from "@/components/workspace/action-state";
import {Button} from "@/components/ui/button";

export type GenerationFeedback={kind:"ready"|"processing"|"blocked"|"failed"|"refresh-required";message:string};

/** View-only projection of the existing server eligibility contract.
 * Ready means reusable stored content, not publication or applied editor changes. */
export function SiteGenerationStatus({eligibility,pending=false,readError="",feedback=null,onReload,disabled=false}:{
 eligibility?:GenerationEligibility|null;pending?:boolean;readError?:string;
 feedback?:GenerationFeedback|null;onReload:()=>void;disabled?:boolean;
}){
 const state:OperationState=pending?{kind:"running"}:
  readError?{kind:"unavailable",detail:readError}:
  eligibility?.code==="processing"?{kind:"running"}:
  !eligibility?{kind:"unavailable",detail:"Checking generation availability. You can edit wording manually."}:
  eligibility.code==="ready"?{kind:"succeeded"}:
  eligibility.allowed?eligibility.code==="retry"?{kind:"failed",detail:eligibility.message}:{kind:"idle"}:
  {kind:"unavailable",detail:eligibility.message};
 const result:OperationState|null=feedback?.kind==="refresh-required"?{kind:"partial",detail:feedback.message}:
  feedback?.kind==="failed"?{kind:"failed",detail:feedback.message}:
  feedback?.kind==="blocked"?{kind:"unavailable",detail:feedback.message}:
  feedback?.kind==="processing"?{kind:"running"}:
  feedback?.kind==="ready"?{kind:"succeeded"}:null;
 return <div className="min-w-0 space-y-2">
  <AsyncOperationStatus title="Site content generation" state={state}/>
  {eligibility&&<p className="text-xs text-muted-foreground">Attempts: {eligibility.attempts}{eligibility.retryAt?" · Retry after "+new Date(eligibility.retryAt).toISOString():""}. Manual editing remains available when permitted.</p>}
  {!pending&&result&&<AsyncOperationStatus title="Last request" state={result}/>}
  {!pending&&feedback&&(feedback.kind==="ready"||feedback.kind==="processing")&&<p className="text-sm text-muted-foreground">{feedback.message}</p>}
  <Button type="button" variant="ghost" disabled={disabled||pending} onClick={onReload}>Reload generation status</Button>
 </div>;
}
