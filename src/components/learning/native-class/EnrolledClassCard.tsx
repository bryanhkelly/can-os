import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getMyNativeClassCalendar } from "@/modules/classes/native-class-calendar.functions";
import { classSessionCalendarUid, renderCalendarInvitation } from "@/domain/calendar-invitations";
import { downloadBlob } from "@/lib/download";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge, MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { ClassParticipationAcknowledgments } from "@/components/learning/ClassParticipationAcknowledgments";
import { transferMyNativeClassEnrollment } from "@/modules/classes/native-class-transfers.functions";
import { withdrawMyNativeClassEnrollment } from "@/modules/classes/native-class-lifecycle.functions";
import { canNativeSelfTransferTo, nativeSelfTransferCreditModes, type NativeSelfTransferCreditMode } from "@/domain/native-class-transfer-choices";
import { creditName, type EnrolledClass, type Item } from "./types";

export function EnrolledClassCard({item,onChanged,destinations}:{item:EnrolledClass;onChanged:()=>Promise<void>;destinations:Item[]}){
  const [confirm,setConfirm]=useState(false);
  const [calendarBusy,setCalendarBusy]=useState(false);
  const [calendarError,setCalendarError]=useState<string|null>(null);
  async function downloadCalendar(){
    if(calendarBusy||item.status!=="active")return;
    setCalendarBusy(true);setCalendarError(null);
    try{
      const snapshot=await getMyNativeClassCalendar({data:{classEnrollmentId:item.classEnrollmentId}});
      if(!snapshot.sessions.length){
        setCalendarError("No upcoming Class Sessions are scheduled yet.");
        return;
      }
      const body=renderCalendarInvitation(snapshot.sessions.map(session=>({
        uid:classSessionCalendarUid(session.id),
        summary:snapshot.classTitle,
        description:"Sign in to CAN OS My Classes for meeting access and learning materials.",
        startsAt:new Date(session.startsAt),endsAt:new Date(session.endsAt),
      })),"REQUEST");
      downloadBlob(new Blob([body],{type:"text/calendar;charset=utf-8"}),
        "can-os-class-schedule.ics");
    }catch{
      setCalendarError("The verified Class schedule could not be exported. Please try again.");
    }finally{setCalendarBusy(false);}
  }
  const mutation=useMutationFeedback(onChanged);
  const busy=mutation.pending||mutation.refreshFailed;
  const [transferVersion,setTransferVersion]=useState("");
  const [transferCredit,setTransferCredit]=useState<NativeSelfTransferCreditMode|"">("");
  const [transferAdult,setTransferAdult]=useState(false);
  const [transferConsent,setTransferConsent]=useState(false);
  const eligibleDestinations=destinations.filter(row=>canNativeSelfTransferTo(item.classId,row));
  const target=eligibleDestinations.find(row=>row.classOfferingVersionId===transferVersion);
  const allowedTransferModes=target?nativeSelfTransferCreditModes(target.allowedCreditModes):[];
  async function transfer(){
    if(item.status!=="active"||!target||!transferAdult||!transferConsent||
       !transferCredit||!allowedTransferModes.includes(transferCredit)||busy)return;
    const outcome=await mutation.run(
      ()=>transferMyNativeClassEnrollment({data:{
        sourceClassEnrollmentId:item.classEnrollmentId,
        targetClassOfferingVersionId:target.classOfferingVersionId,
        creditMode:transferCredit,adultAttested:true,consentAccepted:true,
        requestId:crypto.randomUUID(),
      }}),
      {
        successMessage:"Transfer completed. Old Class history was preserved.",
        commandErrorMessage:"Class transfer was not completed.",
        refreshErrorMessage:"The transfer was saved, but the Class list could not refresh. Retry refresh before submitting another change.",
      },
    );
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      setTransferVersion("");setTransferCredit("");
      setTransferAdult(false);setTransferConsent(false);
    }
  }
  async function withdraw(){
    if(!confirm||busy)return;
    const outcome=await mutation.run(
      ()=>withdrawMyNativeClassEnrollment({data:{classEnrollmentId:item.classEnrollmentId}}),
      {
        successMessage:"Participation withdrawn. Your learning history is preserved.",
        commandErrorMessage:"Unable to withdraw from Class.",
        refreshErrorMessage:"Withdrawal was saved, but the Class list could not refresh. Retry refresh before submitting another change.",
      },
    );
    if(outcome.status==="saved"||outcome.status==="refresh-failed")
      setConfirm(false);
  }
  const current=item.status==="active"||item.status==="pending";
  return <article className="border border-border bg-card p-5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <StatusBadge tone={item.status==="active"||item.status==="completed"?"success":item.status==="pending"?"attention":"neutral"}>{item.status.replace("_"," ")}</StatusBadge> · {item.creditMode.replace("_"," ")}
    </p>
    <h3 className="mt-2 font-serif text-xl">{item.title}</h3>
    <p className="mt-2 text-sm text-muted-foreground">{item.deliveryMode.replace("_"," ")}</p>
    {item.courseAttemptId&&["active","completed"].includes(item.status)&&
      <Link to="/class/$classId" params={{classId:item.classId}}
        search={{view:"learn",tab:"lessons"}}
        className="mt-4 inline-block text-sm font-semibold text-primary underline underline-offset-4">
        Open Class
      </Link>}
    {item.status==="active"&&["scheduled","facilitated","hybrid"].includes(item.deliveryMode)&&
      <div className="mt-3">
        <Button type="button" size="sm" variant="outline" disabled={calendarBusy}
          onClick={()=>void downloadCalendar()}>
          {calendarBusy?"Preparing calendar…":"Download Class schedule (.ics)"}
        </Button>
        {calendarError&&<p role="status" className="mt-2 text-sm text-muted-foreground">{calendarError}</p>}
      </div>}
    {item.status==="active"&&eligibleDestinations.length>0&&
      <details className="mt-4 border border-border p-3">
        <summary className="cursor-pointer text-sm font-semibold">Transfer to another Class</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Transfers are only available to public Classes accepting adult self-enrollment.
          The destination seat and current terms are checked again before moving you.
        </p>
        <Label className="mt-3 block text-sm font-semibold" htmlFor={"transfer-"+item.classEnrollmentId}>
          Destination Class
        </Label>
        <Select id={"transfer-"+item.classEnrollmentId} value={transferVersion}
          onChange={e=>{
            const next=eligibleDestinations.find(row=>row.classOfferingVersionId===e.target.value);
            setTransferVersion(e.target.value);
            setTransferCredit(next?nativeSelfTransferCreditModes(next.allowedCreditModes)[0]??"":"");
            setTransferAdult(false);
            setTransferConsent(false);
          }}
          className="mt-2">
          <option value="">Select a destination</option>
          {eligibleDestinations.map(row=>
            <option key={row.classOfferingVersionId} value={row.classOfferingVersionId}>
              {row.classTitle}
            </option>)}
        </Select>
        {target&&<>
          <Label className="mt-3 block text-sm font-semibold">Participation
            <Select value={transferCredit}
              onChange={e=>setTransferCredit(e.target.value as NativeSelfTransferCreditMode)}
              className="mt-2">
              {allowedTransferModes.map(m=><option key={m} value={m}>{creditName[m]}</option>)}
            </Select>
          </Label>
          <p className="mt-3 whitespace-pre-wrap border border-border bg-muted/20 p-3 text-sm">
            {target.consentText}
          </p>
          <ClassParticipationAcknowledgments className="mt-3"
            adultChecked={transferAdult} onAdultChange={setTransferAdult}
            consentChecked={transferConsent} onConsentChange={setTransferConsent}
            adultLabel="I confirm I am at least 18." consentLabel="I accept the destination Class terms and understand my current Class access ends." />
          <Button size="sm" className="mt-3" disabled={busy||!transferAdult||!transferConsent||
            !transferCredit||!allowedTransferModes.includes(transferCredit)}
            onClick={()=>void transfer()}>{busy?"Transferring…":"Confirm transfer"}</Button>
        </>}
      </details>}
    {current&&<div className="mt-4">
      {!confirm?<Button type="button" size="sm" variant="outline"
        onClick={()=>setConfirm(true)}>
        {item.status==="pending"?"Cancel request":"Withdraw from Class"}
      </Button>:<div className="border border-border bg-muted/20 p-3">
        <p className="text-sm">This releases your place and ends future Class access.
          Previous results and attendance are retained.</p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={()=>void withdraw()}>
            {busy?"Saving…":"Confirm withdrawal"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy}
            onClick={()=>setConfirm(false)}>Keep my place</Button>
        </div>
      </div>}
    </div>}
    <MutationFeedback state={{...mutation,retryRefresh:mutation.retryRefresh}}
      pendingMessage="Saving Class change…" className="mt-3"/>
  </article>;
}

