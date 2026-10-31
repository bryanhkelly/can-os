import { Link } from "@tanstack/react-router";
import { AdmissionsGuardianActions } from "./AdmissionsGuardianActions";
import { AdmissionsDecisionActions,type AdmissionsDecision } from "./AdmissionsDecisionActions";
import { AdmissionsTransferStatus } from "./AdmissionsTransferStatus";
import type { listAdmissionsIntake } from "@/modules/enrollment/admissions-intake.functions";

type Applicant=Awaited<ReturnType<typeof listAdmissionsIntake>>["items"][number];
export function AdmissionsApplicantCard({r,busy,onVerify,onProvision,onInvite,onDecision}:{
 r:Applicant;busy:boolean;
 onVerify:(id:string)=>void;onProvision:(id:string)=>void;onInvite:(id:string)=>void;
 onDecision:(id:string,decision:AdmissionsDecision,label:string)=>void;
}){
 return <>
   <article className="rounded-xl border bg-card p-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h3 className="text-lg font-semibold">{r.studentFirst} {r.studentLast}</h3>
     <p className="mt-1 text-xs text-muted-foreground">{r.programName} · {r.disposition??r.stage} · Last updated {new Date(r.updatedAt).toLocaleDateString()}</p></div>
     <span className="rounded-full border px-3 py-1 text-xs">{r.disposition??r.stage}</span>
    </div>
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
