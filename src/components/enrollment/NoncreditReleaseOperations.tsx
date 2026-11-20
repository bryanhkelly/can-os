import { Label } from "@/components/ui/label";
import {Link} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/choice";
import { StatCard } from "@/components/workspace";
import {selectedCohortSessionPlanIds} from "@/domain/noncredit-cohort-schedule";
import {
  attachClassroomPlanToNoncreditRelease,getNoncreditReleaseOperations,
  releaseWithdrawnNoncreditSeat,inviteNextNoncreditWaitlist,
  attachCohortSessionPlans,
} from "@/modules/enrollment/noncredit-cohort-operations.functions";
import {normalizeClientError} from "@/lib/client-error";
import {NoncreditDeliveryRecoveryPanel} from "./NoncreditDeliveryRecoveryPanel";
import { NoncreditParticipantRoster } from "./NoncreditParticipantRoster";

export function NoncreditReleaseOperations({releaseId}:{releaseId:string}){
  const client=useQueryClient();
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [seatTarget,setSeatTarget]=useState<string|null>(null);
  const [seatReason,setSeatReason]=useState("");
  const [selectedPlanIds,setSelectedPlanIds]=useState<string[]>([]);
  const query=useQuery({
    queryKey:["noncredit-cohort-ops",releaseId],
    queryFn:()=>getNoncreditReleaseOperations({data:{releaseId}}),
    retry:false,staleTime:15_000,
  });
  const selectedForAttachment=selectedCohortSessionPlanIds(query.data?.sessions??[],selectedPlanIds);
  const linkedMeetingCount=query.data?.sessions.filter(row=>row.linked&&row.state!=="cancelled").length??0;
  async function attach(planId:string){
    if(busy)return;setBusy(planId);setMessage("");
    try{
      await attachClassroomPlanToNoncreditRelease({data:{releaseId,planId}});
      await client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
      setSelectedPlanIds(current=>current.filter(id=>id!==planId));
      setMessage("This scheduled meeting now belongs to the selected cohort.");
    }catch(cause){
      setMessage(normalizeClientError(cause,"Could not assign the meeting to this enrollment release.").message);
    }finally{setBusy(null);}
  }
  async function attachSelectedSessions(){
    if(busy||selectedForAttachment.length===0||
      selectedForAttachment.length!==selectedPlanIds.length)return;
    setBusy("attach-selected");setMessage("");
    try{
      const result=await attachCohortSessionPlans({data:{
        releaseId,planIds:selectedForAttachment,
      }});
      setSelectedPlanIds([]);
      setMessage(result.attached+" selected session"+(result.attached===1?"":"s")+
        " linked to this cohort. Enrollment and attendance records were not changed.");
      try{
        await Promise.all([
          client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]}),
          client.invalidateQueries({queryKey:["noncredit-open-releases"]}),
        ]);
      }catch{
        setMessage("Session assignment was saved, but the list could not refresh. Reload before making another change.");
      }
    }catch(cause){
      setMessage(normalizeClientError(cause,
        "No session assignments were saved. Check each date, current Site permission and existing cohort links.").message);
    }finally{setBusy(null);}
  }
  async function invite(){
    if(busy)return;setBusy("invite");setMessage("");
    try{
      const result=await inviteNextNoncreditWaitlist({data:{releaseId}});
      await client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
      setMessage(result.invited?
        "Next waiting adult has a reserved place for up to 48 hours. The invitation is visible in their CAN account, and an email delivery has been queued. Provider acceptance is tracked separately.":
        "There are no eligible waiting participants to invite.");
    }catch(cause){
      setMessage(normalizeClientError(cause,"Could not reserve the next waiting place.").message);
    }finally{setBusy(null);}
  }
  async function releaseSeat(registrationId:string){
    if(busy||seatReason.trim().length<15)return;
    setBusy(registrationId);setMessage("");
    try{
      await releaseWithdrawnNoncreditSeat({data:{
        releaseId,registrationId,reason:seatReason.trim(),
      }});
      setSeatTarget(null);setSeatReason("");
      await client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
      setMessage("Capacity reconciliation recorded. The original registration, consent and audit history were retained.");
    }catch(cause){
      setMessage(normalizeClientError(cause,"Could not release the withdrawn seat.").message);
    }finally{setBusy(null);}
  }
  return <section className="mt-5 border border-border bg-card p-5" aria-label="Cohort management">
    <h2 className="font-serif text-2xl">Cohort & participant management</h2>
    {query.isPending&&<p role="status" className="mt-4 text-sm">Loading authorized course operations…</p>}
    {query.isError&&<p role="alert" className="mt-4 text-sm">
      Cohort records are unavailable. Check current provider scope and the cohort schema migration.
      <Button variant="ghost" type="button" className="ml-2 underline" onClick={()=>void query.refetch()}>Retry</Button>
    </p>}
    {message&&<p role="status" className="mt-4 border border-border p-3 text-sm">{message}</p>}
    {query.data&&<>
      <p className="mt-2 text-sm text-muted-foreground">{query.data.title} · {query.data.deliveryMode} · {query.data.registrationStatus}</p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Registered",query.data.metrics.registrations],
          ["Active",query.data.metrics.active],
          ["Verified attendees",query.data.metrics.verifiedAttendees],
          ["Completed",query.data.metrics.completed],
        ].map(([label,value])=><StatCard key={label} label={label} value={value}/>)}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-base font-semibold">Waiting list</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {query.data.metrics.waiting} waiting · {query.data.metrics.invitations} active invitations · {query.data.seatsAvailable} unheld seats.
          Invitations follow queue order and reserve capacity temporarily. The participant must accept personally.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Email queued: {query.data.metrics.emailQueued}
          {" · "}Accepted by provider: {query.data.metrics.emailProviderAccepted}
          {" · "}Failed or retrying: {query.data.metrics.emailFailed}
          {" · "}Suppressed: {query.data.metrics.emailSuppressed}.
          Provider acceptance does not mean the email was opened or a seat accepted.
        </p>
        <Button type="button" className="mt-3" variant="outline" disabled={busy!==null||
          query.data.metrics.waiting===0||query.data.seatsAvailable<=0}
          onClick={()=>void invite()}>{busy==="invite"?"Reserving…":"Invite next waiting adult"}</Button>
      </div>
      <NoncreditDeliveryRecoveryPanel releaseId={releaseId}/>
      <h3 className="mt-7 text-base font-semibold">Dated classroom sessions</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Facilitators schedule approved courses in <Link to="/canonical/lab/facilitated" className="text-primary underline">Facilitated learning</Link>.
        Attach a scheduled meeting here to include it in this cohort's learner-facing calendar.
      </p>
      {query.data.deliveryMode==="independent"&&<p className="mt-3 text-sm">Self-paced training has no required in-person cohort.</p>}
      {query.data.deliveryMode==="facilitated"&&<section className="mt-3 border border-border bg-muted/20 p-4"
        aria-label="Cohort session assignments">
        <h4 className="text-sm font-semibold">Linked sessions: {linkedMeetingCount}</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          The COGIC pilot targets four delivered sessions, but they need not occur
          in consecutive weeks. Sites may meet twice weekly, skip holidays, or use
          other authorized dates. Other Programs may have different requirements.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Select up to four unallocated future meetings below, review their dates, and
          attach them to this specific cohort in one transaction.
          Existing linked meetings are preserved. Per-session attendance is independently attested; a booked or opened room is not proof of presence.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{selectedPlanIds.length} selected</span>
          <Button type="button" variant="outline"
            disabled={busy!==null||selectedPlanIds.length===0||
              selectedForAttachment.length!==selectedPlanIds.length}
            onClick={()=>void attachSelectedSessions()}>
            {busy==="attach-selected"?"Attaching sessions…":"Attach selected sessions"}
          </Button>
          {selectedPlanIds.length>0&&<Button type="button" variant="ghost"
            disabled={busy!==null} onClick={()=>setSelectedPlanIds([])}>Clear selection</Button>}
        </div>
        {selectedPlanIds.length>0&&selectedForAttachment.length!==selectedPlanIds.length&&
          <p role="alert" className="mt-2 text-sm text-destructive">
            One or more selected meetings is unavailable or overlaps another selected meeting.
            Review the selection before saving.
          </p>}
        {!query.data.sessions.some(row=>!row.linked&&row.state==="scheduled"&&
          Date.parse(row.startsAt)>Date.now())&&<p role="status" className="mt-2 text-sm text-muted-foreground">
          There are no unallocated upcoming meetings at this authorized Site.
          <Link to="/canonical/lab/facilitated" className="ml-1 text-primary underline">
            Schedule meetings
          </Link> first.
        </p>}
      </section>}
      <div className="mt-3 divide-y divide-border border border-border">
        {query.data.sessions.map(session=><div key={session.planId} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex items-center gap-3">
            {query.data.deliveryMode==="facilitated"&&!session.linked&&
              session.state==="scheduled"&&Date.parse(session.startsAt)>Date.now()&&
              <Label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-xs font-medium">
                <Checkbox checked={selectedPlanIds.includes(session.planId)}
                  disabled={busy!==null||(!selectedPlanIds.includes(session.planId)&&selectedPlanIds.length>=4)}
                  onChange={event=>setSelectedPlanIds(current=>
                    event.target.checked
                      ?current.includes(session.planId)||current.length>=4?current:[...current,session.planId]
                      :current.filter(id=>id!==session.planId))}/>
                Select
              </Label>}
            <div><p className="text-sm font-medium">{new Date(session.startsAt).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Ends {new Date(session.endsAt).toLocaleString()} · {session.state}</p>
            {session.linked&&<p className="mt-1 text-xs text-muted-foreground">
              {session.roomOpened?"Classroom room opened":"Classroom room not opened"}
              {" · "}{session.verifiedAttendees} verified attendee{session.verifiedAttendees===1?"":"s"}
            </p>}
            </div>
          </div>
          {session.linked?<span className="text-xs text-muted-foreground">Assigned to this cohort</span>:
          <Button size="sm" variant="outline" disabled={busy!==null} onClick={()=>void attach(session.planId)}>
            {busy===session.planId?"Assigning…":"Attach meeting"}
          </Button>}
        </div>)}
        {!query.data.sessions.length&&<p className="p-3 text-sm text-muted-foreground">No scheduled meetings at this authorized Site yet.</p>}
      </div>
      <NoncreditParticipantRoster roster={query.data.roster}
        busy={busy!==null} seatTarget={seatTarget} seatReason={seatReason}
        onStartRelease={id=>{setSeatTarget(id);setSeatReason("");}}
        onReasonChange={setSeatReason} onConfirmRelease={releaseSeat}
        onCancelRelease={()=>setSeatTarget(null)} />
      {query.data.partial&&<p role="alert" className="mt-3 text-sm">The roster or evidence query was truncated. Do not use these figures as complete network totals.</p>}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{query.data.evidenceNote}</p>
    </>}
  </section>;
}
