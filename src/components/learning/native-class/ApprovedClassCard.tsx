import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { ClassParticipationAcknowledgments } from "@/components/learning/ClassParticipationAcknowledgments";
import { enrollCurrentPersonInClass } from "@/modules/classes/native-class-entry";
import { creditName, type CreditMode, type NativeApproval } from "./types";

export function ApprovedClassCard({item,onChanged}:{item:NativeApproval;onChanged:()=>Promise<void>}){
  const [mode,setMode]=useState<CreditMode>((item.allowedCreditModes[0]??"not_applicable") as CreditMode);
  const [adult,setAdult]=useState(false);
  const [consent,setConsent]=useState(false);
  const mutation=useMutationFeedback(onChanged);
  const busy=mutation.pending||mutation.refreshFailed;
  const eligible=item.state==="approved"&&!item.acceptedEnrollmentId;
  async function accept(){
    if(!eligible||!adult||!consent||busy)return;
    await mutation.run(
      ()=>enrollCurrentPersonInClass({data:{
        classOfferingVersionId:item.classOfferingVersionId,
        approvalRequestId:item.approvalRequestId,
        creditMode:mode,adultAttested:true,consentAccepted:true,
      }}),
      {
        successMessage:"Approved Class enrollment accepted. Your Course Attempt is ready.",
        commandErrorMessage:"Could not accept Class approval.",
        refreshErrorMessage:"Your approved place was accepted, but the list could not refresh. Retry refresh rather than accepting again.",
      },
    );
  }
  return <article className="border border-border bg-card p-5">
    <h3 className="font-serif text-lg">{item.title}</h3>
    <p className="mt-2 text-sm">Approval status: {item.state}</p>
    {eligible&&<>
      <p className="mt-2 text-sm">Approval expires {new Date(item.expiresAt).toLocaleString()}. A seat is not reserved.</p>
      <Label className="mt-3 block text-sm font-semibold">Participation mode
        <Select value={mode} onChange={e=>setMode(e.target.value as CreditMode)}
          className="mt-2 min-h-11">
          {item.allowedCreditModes.map(m=><option key={m} value={m}>{creditName[m]}</option>)}
        </Select>
      </Label>
      <p className="mt-3 whitespace-pre-wrap text-sm">{item.consentText}</p>
      <ClassParticipationAcknowledgments className="mt-3"
        adultChecked={adult} onAdultChange={setAdult}
        consentChecked={consent} onConsentChange={setConsent}
        adultLabel="I confirm that I am at least 18." consentLabel="I accept the current Class participation and data-use terms." />
      <Button className="mt-4" disabled={!adult||!consent||busy}
        onClick={()=>void accept()}>{busy?"Accepting…":"Accept approved place"}</Button>
    </>}
    <MutationFeedback state={{...mutation,retryRefresh:mutation.retryRefresh}}
      pendingMessage="Accepting approved place…" className="mt-3"/>
  </article>;
}
