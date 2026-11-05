import { Link } from "@tanstack/react-router";
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
 return <>
   <article aria-label={showSummary?undefined:"Admissions application actions"} className="rounded-xl border bg-card p-5">
    {showSummary&&<div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-semibold">{r.studentFirst} {r.studentLast}</h3>
     <p className="mt-1 text-xs text-muted-foreground">{r.programName} · {r.disposition??r.stage} · Last updated {new Date(r.updatedAt).toLocaleDateString()}</p></div>
     <span className="rounded-full border px-3 py-1 text-xs">{r.disposition??r.stage}</span>
    </div>}
    <p role="status" className="mt-3 rounded-lg bg-muted p-3 text-sm"><strong>Next admissions step: </strong>{admissionsNextStep(r.stage,r.disposition)}</p>
    <AdmissionsTransferStatus applicationId={r.id} transferOriginStatus={r.transferOriginStatus}
     transferNamedDestination={r.transferNamedDestination} transferRecordsStatus={r.transferRecordsStatus}
     destinationTranscriptConsentRecorded={r.destinationTranscriptConsentRecorded}/>
    <AdmissionsGuardianActions applicationId={r.id} verified={r.guardianVerified}
     loginProvisioned={r.guardianLoginProvisioned} busy={busy}
     onVerify={onVerify} onProvision={onProvision} onInvite={onInvite}/>
    {r.disposition==="ready_for_offer"&&<Link to="/admissions"
      search={{siteId:r.siteId??undefined,programId:r.programId,application:r.id}}
      className="mt-3 inline-block rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background">Issue enrollment offer →</Link>}
    <AdmissionsDecisionActions stage={r.stage} disposition={r.disposition} busy={busy}
     onDecision={(decision,label)=>onDecision(r.id,decision,label)}/>
    <Link to="/admissions" search={{siteId:r.siteId??undefined,programId:r.programId,application:r.id}}
      className="mt-3 inline-block text-xs underline">Review this application's offers and enrollment →</Link>
    <p className="mt-2 text-xs text-muted-foreground">Withdraw unaccepted offers before waitlisting, declining or withdrawing an application.
      Accepted offers and active enrollments require their enrollment workflow and cannot be cancelled here.</p>
   </article>

 </>;
}
