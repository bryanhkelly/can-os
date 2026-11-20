import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { ClassParticipationAcknowledgments } from "@/components/learning/ClassParticipationAcknowledgments";
import { requestNativeClassApproval } from "@/modules/classes/native-class-approvals.functions";
import { enrollCurrentPersonInClass } from "@/modules/classes/native-class-entry";
import { creditName, type CreditMode, type Item } from "./types";

export function OfferingCard({item,onJoined}:{item:Item;onJoined:()=>Promise<void>}){
  const [mode,setMode]=useState<CreditMode>((item.allowedCreditModes[0]??"not_applicable") as CreditMode);
  const [adult,setAdult]=useState(false);
  const [consent,setConsent]=useState(false);
  const mutation=useMutationFeedback(onJoined);
  const busy=mutation.pending||mutation.refreshFailed;
  const self=item.enrollmentMethods.includes("self");
  const approvalRequired=!self&&item.enrollmentMethods.includes("approval");
  const full=item.remainingSeats===0;
  async function requestApproval(){
    if(!approvalRequired||busy)return;
    await mutation.run(
      ()=>requestNativeClassApproval({data:{
        classOfferingVersionId:item.classOfferingVersionId,requestId:crypto.randomUUID(),
      }}),
      {
        successMessage:result=>result.duplicate?"Your request was already received.":
          "Request submitted for independent review. No seat is reserved until approval is accepted.",
        commandErrorMessage:"Class approval request was not submitted.",
        refreshErrorMessage:"The request was received, but your Class list could not refresh. Retry refresh before submitting again.",
      },
    );
  }
  async function enroll(){
    if(!self||full||!adult||!consent||busy)return;
    // Server independently validates the CAN account, canonical Person,
    // adulthood, and current learner grant. Never create another identity.
    await mutation.run(
      ()=>enrollCurrentPersonInClass({data:{
        classOfferingVersionId:item.classOfferingVersionId,
        creditMode:mode,adultAttested:true,consentAccepted:true,
      }}),
      {
        successMessage:result=>result.alreadyEnrolled?"You are already enrolled.":
          "Enrollment confirmed. Your Course Attempt is ready.",
        commandErrorMessage:"Class enrollment was not completed.",
        refreshErrorMessage:"Enrollment was saved, but your Class list could not refresh. Retry refresh before submitting again.",
      },
    );
  }
  return <article className="border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {item.deliveryMode.replace("_"," ")} · {item.siteId?"Site hosted":"Online"}
    </p>
    <h3 className="mt-2 font-serif text-xl">{item.classTitle}</h3>
    {full?<p role="status" className="mt-2 text-sm font-semibold">
      Class full. Enrollment is unavailable until a seat is released.
    </p>:item.remainingSeats!==null?
      <p className="mt-2 text-sm text-muted-foreground">
        {item.remainingSeats} of {item.capacity} seats currently available
      </p>:<p className="mt-2 text-sm text-muted-foreground">
        Seats available; no published numerical limit
      </p>}
    {self?<>
      <div className="mt-4">
        <Label className="block text-sm font-semibold" htmlFor={"class-credit-"+item.classOfferingVersionId}>Participation</Label>
        <Select id={"class-credit-"+item.classOfferingVersionId} value={mode}
          onChange={e=>setMode(e.target.value as CreditMode)}
          className="mt-2 min-h-11">
          {item.allowedCreditModes.map(m=><option key={m} value={m}>{creditName[m]}</option>)}
        </Select>
      </div>
      <div className="mt-4 border border-border bg-muted/20 p-3">
        <p className="text-sm font-semibold">Participation and data-use terms</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.consentText}</p>
      </div>
      <ClassParticipationAcknowledgments className="mt-4"
        adultChecked={adult} onAdultChange={setAdult}
        consentChecked={consent} onConsentChange={setConsent}
        adultLabel="I confirm that I am at least 18. Class admission requires a separately verified adult learner identity." consentLabel="I have read and accept these participation and data-use terms." />
      <Button className="mt-4" disabled={!adult||!consent||busy||full} onClick={()=>void enroll()}>
        {busy?"Enrolling…":full?"Class full":"Enroll in Class"}
      </Button>
    </>:approvalRequired?<div className="mt-4">
      <p className="text-sm text-muted-foreground">Approval required. Staff review eligibility independently. A request is not a seat reservation or enrollment.</p>
      <Button className="mt-4" disabled={busy||full} onClick={()=>void requestApproval()}>
        {busy?"Submitting…":"Request approval"}</Button>
    </div>:<p className="mt-4 text-sm text-muted-foreground">
      This Class is available by {item.enrollmentMethods.join(", ")}. Self-enrollment is not enabled.
    </p>}
    <MutationFeedback state={{...mutation,retryRefresh:mutation.retryRefresh}}
      pendingMessage="Saving Class request…" className="mt-3"/>
  </article>;
}
