import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspacePanel, WorkspaceNotice, ActionFooter } from "@/components/workspace";
import { AdmissionsGuardianActions,type GuardianVerification } from "./AdmissionsGuardianActions";
import { AdmissionsDecisionActions,type AdmissionsDecision } from "./AdmissionsDecisionActions";
import { AdmissionsTransferStatus } from "./AdmissionsTransferStatus";
import type { listAdmissionsIntake } from "@/modules/enrollment/admissions-intake.functions";

type Applicant=Awaited<ReturnType<typeof listAdmissionsIntake>>["items"][number];
export function admissionsNextStep(stage:string,disposition:string|null|undefined) {
 if(stage==="inquiry")return "Admissions registrar: begin the application review.";
 if(stage==="application")return "Admissions registrar: begin eligibility review.";
 if(stage==="eligibility"&&disposition==="waitlisted")
  return "Admissions registrar: retain the waitlist or restore this application to eligibility when ready.";
 if(stage==="eligibility"&&disposition==="ready_for_offer")
  return "Admissions registrar: issue the enrollment offer; the guardian responds from their own account.";
 if(stage==="eligibility")return "Admissions registrar: complete eligibility review and record a decision.";
 if(stage==="accepted")return "Admissions registrar: continue the accepted-offer activation and class-placement checklist.";
 if(stage==="declined"||stage==="withdrawn")return "No further admissions action: this application is closed.";
 return "Admissions registrar: review the application record for its next step.";
}
export function AdmissionsApplicantCard({r,busy,onVerify,onProvision,onInvite,onDecision,showSummary=true}:{
 r:Applicant;busy:boolean;
 onVerify:(id:string,verification:GuardianVerification)=>void;onProvision:(id:string)=>void;onInvite:(id:string)=>void;
 onDecision:(id:string,decision:AdmissionsDecision,label:string)=>void;
 showSummary?:boolean;
}){
 return <WorkspacePanel title={showSummary?`${r.studentFirst} ${r.studentLast}`:"Admissions application actions"}
    description={showSummary?`${r.programName} · ${r.disposition??r.stage} · Last updated ${new Date(r.updatedAt).toLocaleDateString()}`:undefined}
    actions={showSummary?<StatusBadge>{r.disposition??r.stage}</StatusBadge>:undefined}>
    <WorkspaceNotice><strong>Next admissions step: </strong>{admissionsNextStep(r.stage,r.disposition)}</WorkspaceNotice>
    <AdmissionsTransferStatus applicationId={r.id} transferOriginStatus={r.transferOriginStatus}
     transferNamedDestination={r.transferNamedDestination} transferRecordsStatus={r.transferRecordsStatus}
     destinationTranscriptConsentRecorded={r.destinationTranscriptConsentRecorded}/>
    <AdmissionsGuardianActions applicationId={r.id} verified={r.guardianVerified}
     loginProvisioned={r.guardianLoginProvisioned} busy={busy}
     onVerify={onVerify} onProvision={onProvision} onInvite={onInvite}/>
    {r.disposition==="ready_for_offer"&&<Button asChild variant="outline" size="sm" className="mt-3">
      <Link to="/admissions" search={{siteId:r.siteId??undefined,programId:r.programId,application:r.id}}>Issue enrollment offer →</Link>
    </Button>}
    <AdmissionsDecisionActions stage={r.stage} disposition={r.disposition} busy={busy}
     onDecision={(decision,label)=>onDecision(r.id,decision,label)}/>
    <ActionFooter layout="inline"><Button asChild variant="outline" size="sm"><Link to="/admissions" search={{siteId:r.siteId??undefined,programId:r.programId,application:r.id}}>Review this application's offers and enrollment</Link></Button></ActionFooter>
    <p className="mt-2 text-xs text-muted-foreground">Withdraw unaccepted offers before waitlisting, declining or withdrawing an application.
      Accepted offers and active enrollments require their enrollment workflow and cannot be cancelled here.</p>
   </WorkspacePanel>;
}
