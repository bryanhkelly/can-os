import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { ClassParticipationAcknowledgments } from "@/components/learning/ClassParticipationAcknowledgments";
import { declineNativeClassInvitation } from "@/modules/classes/native-class-invitations.functions";
import { enrollCurrentPersonInClass } from "@/modules/classes/native-class-entry";
import type { NativeInvitation } from "./types";

export function InvitationCard({item,onChanged}:{item:NativeInvitation;onChanged:()=>Promise<void>}){
  const [adult,setAdult]=useState(false);
  const [consent,setConsent]=useState(false);
  const mutation=useMutationFeedback(onChanged);
  const busy=mutation.pending||mutation.refreshFailed;
  const pending=item.state==="pending";
  const expires=new Date(item.expiresAt).toLocaleString();
  async function accept(){
    if(!pending||!adult||!consent||!item.consentText||busy)return;
    await mutation.run(
      ()=>enrollCurrentPersonInClass({data:{
        classOfferingVersionId:item.classOfferingVersionId,
        invitationId:item.invitationId,
        creditMode:item.creditMode,adultAttested:true,consentAccepted:true,
      }}),
      {
        successMessage:"Invitation accepted. Your Class and learning record are ready.",
        commandErrorMessage:"The invitation could not be accepted.",
        refreshErrorMessage:"The invitation was accepted, but the Class list could not refresh. Retry refresh before another action.",
      },
    );
  }
  async function decline(){
    if(!pending||busy)return;
    await mutation.run(
      ()=>declineNativeClassInvitation({data:{invitationId:item.invitationId}}),
      {
        successMessage:"Invitation declined. No Enrollment was created.",
        commandErrorMessage:"Unable to decline this invitation.",
        refreshErrorMessage:"The invitation was declined, but the list could not refresh. Retry refresh before another action.",
      },
    );
  }
  return <article className="border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      Verified native Class invitation · {item.state}
    </p>
    <h3 className="mt-2 font-serif text-xl">{item.title}</h3>
    <p className="mt-2 text-sm text-muted-foreground">
      {pending?"Accept before "+expires:"Invitation expired or already resolved."}
      {" "}An invitation does not reserve a seat or establish enrollment.
    </p>
    {pending&&<>
      <div className="mt-4 border border-border bg-muted/20 p-3">
        <p className="text-sm font-semibold">Published participation and data-use terms</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
          {item.consentText??"Published consent unavailable. Acceptance will be denied."}
        </p>
      </div>
      <ClassParticipationAcknowledgments className="mt-4"
        adultChecked={adult} onAdultChange={setAdult}
        consentChecked={consent} onConsentChange={setConsent}
        adultLabel="I confirm that I am at least 18. Class admission requires a separately verified adult learner identity." consentLabel="I accept the current participation and data-use terms." />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={!adult||!consent||busy||!item.consentText}
          onClick={()=>void accept()}>{busy?"Processing…":"Accept invitation"}</Button>
        <Button variant="outline" disabled={busy} onClick={()=>void decline()}>
          Decline invitation
        </Button>
      </div>
    </>}
    <MutationFeedback state={{...mutation,retryRefresh:mutation.retryRefresh}}
      pendingMessage="Saving invitation decision…" className="mt-3"/>
  </article>;
}

