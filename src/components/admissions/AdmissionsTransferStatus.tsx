import { WorkspacePanel, WorkspaceNotice } from "@/components/workspace";
import { ReceivingTransferTranscript } from "./ReceivingTransferTranscript";
type TransferProps={
 applicationId:string;
 transferOriginStatus:string|null|undefined;
 transferNamedDestination:string|null|undefined;
 transferRecordsStatus:string|null|undefined;
 destinationTranscriptConsentRecorded:boolean;
};

export function AdmissionsTransferStatus({applicationId,transferOriginStatus,transferNamedDestination,transferRecordsStatus,destinationTranscriptConsentRecorded}:TransferProps){
 return <>
    {transferOriginStatus&&<WorkspacePanel title="Linked transfer application" className="mt-4">
      <div className="space-y-2 text-sm">
      <p className="mt-1">Origin school exit: {transferOriginStatus==="completed"?
        "Institutionally completed":transferOriginStatus==="pending"?
        "Pending — may review and issue an offer; activation must wait":"Requires review before placement"}.</p>
      {transferNamedDestination&&<p className="mt-1">Family's named receiving school: {transferNamedDestination}.
        Confirm that this application is for the intended destination.</p>}
      <p className="mt-1">Origin academic records: <strong>{transferRecordsStatus==="available_in_can"?
        "Official transcript released inside CAN — available below":
        transferRecordsStatus==="released_externally"?
        "External secure delivery attested — no automatic CAN transcript access":
        transferRecordsStatus==="pending_release"?
        "Secure transcript handoff pending":
        transferRecordsStatus==="requires_review"?
        "Origin record authorization requires review":
        "Not yet started"}</strong>.</p>
      <p className="mt-1 text-xs text-muted-foreground">An institutional records handoff is separate from receiving-school admission. This school must independently decide admission, confirm seat capacity, obtain guardian acceptance and activate a real Section.</p>
      {transferRecordsStatus==="available_in_can"&&<ReceivingTransferTranscript
        applicationId={applicationId} consentRequested={destinationTranscriptConsentRecorded}/>}
      {transferRecordsStatus==="available_in_can"&&!destinationTranscriptConsentRecorded&&
        <WorkspaceNotice tone="attention">
          This application predates specific receiving-school transcript consent.
          Request authorization from the verified guardian before accessing the official record.
        </WorkspaceNotice>}
      </div>
    </WorkspacePanel>}

 </>;
}
