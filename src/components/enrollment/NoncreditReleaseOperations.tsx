import {Link} from "@tanstack/react-router";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {
  attachClassroomPlanToNoncreditRelease,getNoncreditReleaseOperations,
  releaseWithdrawnNoncreditSeat,inviteNextNoncreditWaitlist,
  attachFourWeekCohortPlans,
} from "@/modules/enrollment/noncredit-cohort-operations.functions";
import {normalizeClientError} from "@/lib/client-error";

export function NoncreditReleaseOperations({releaseId}:{releaseId:string}){
  const client=useQueryClient();
  const [busy,setBusy]=useState<string|null>(null);
  const [message,setMessage]=useState("");
  const [seatTarget,setSeatTarget]=useState<string|null>(null);
  const [seatReason,setSeatReason]=useState("");
  const query=useQuery({
    queryKey:["noncredit-cohort-ops",releaseId],
    queryFn:()=>getNoncreditReleaseOperations({data:{releaseId}}),
    retry:false,staleTime:15_000,
  });
  async function attach(planId:string){
    if(busy)return;setBusy(planId);setMessage("");
    try{
      await attachClassroomPlanToNoncreditRelease({data:{releaseId,planId}});
      await client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
      setMessage("This scheduled meeting now belongs to the selected cohort.");
    }catch(cause){
      setMessage(normalizeClientError(cause,"Could not assign the meeting to this enrollment release.").message);
    }finally{setBusy(null);}
  }
  async function attachFourWeeks(planIds:string[]){
    if(busy||!planIds.length)return;setBusy("attach-four");setMessage("");
    try{
      const result=await attachFourWeekCohortPlans({data:{releaseId,planIds}});
      await client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
      setMessage(result.attached+" meetings assigned to this one cohort; no registrations or attendance were generated.");
    }catch(cause){
      setMessage(normalizeClientError(cause,"All four assignments were rolled back. Check that every meeting is still authorized, future-dated and unallocated.").message);
    }finally{setBusy(null);}
  }
  async function invite(){
    if(busy)return;setBusy("invite");setMessage("");
    try{
      const result=await inviteNextNoncreditWaitlist({data:{releaseId}});
      await client.invalidateQueries({queryKey:["noncredit-cohort-ops",releaseId]});
      await client.invalidateQueries({queryKey:["noncredit-open-releases"]});
      setMessage(result.invited?
        "Next waiting adult has a reserved place for up to 48 hours. The invitation is visible in their CAN account; no outbound message has been sent.":
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
      <button type="button" className="ml-2 underline" onClick={()=>void query.refetch()}>Retry</button>
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
        ].map(([label,value])=><div key={label} className="border border-border p-3">
          <div className="font-serif text-3xl">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>)}
      </div>
      <div className="mt-5 border-t border-border pt-4">
        <h3 className="text-base font-semibold">Waiting list</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {query.data.metrics.waiting} waiting · {query.data.metrics.invitations} active invitations · {query.data.seatsAvailable} unheld seats.
          Invitations follow queue order and reserve capacity temporarily. The participant must accept personally.
        </p>
        <Button type="button" className="mt-3" variant="outline" disabled={busy!==null||
          query.data.metrics.waiting===0||query.data.seatsAvailable<=0}
          onClick={()=>void invite()}>{busy==="invite"?"Reserving…":"Invite next waiting adult"}</Button>
      </div>
      <h3 className="mt-7 text-base font-semibold">Dated classroom sessions</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Facilitators schedule approved courses in <Link to="/canonical/lab/facilitated" className="text-primary underline">Facilitated learning</Link>.
        Attach a scheduled meeting here to include it in this cohort's learner-facing calendar.
      </p>
      {query.data.deliveryMode==="independent"&&<p className="mt-3 text-sm">Self-paced training has no required in-person cohort.</p>}
      {query.data.deliveryMode==="facilitated"&&query.data.sessions.some(s=>!s.linked&&s.state==="scheduled")&&
        <div className="mt-3 border border-border bg-muted/20 p-3">
          <p className="text-sm">Assign up to four upcoming, unallocated meetings to this cohort in one operation. Each meeting must belong to this exact approved Site and Course.</p>
          <Button type="button" className="mt-3" variant="outline" disabled={busy!==null}
            onClick={()=>void attachFourWeeks(query.data.sessions
              .filter(s=>!s.linked&&s.state==="scheduled"&&Date.parse(s.startsAt)>Date.now())
              .slice(0,4).map(s=>s.planId))}>
            {busy==="attach-four"?"Assigning meetings…":"Attach next four meetings"}
          </Button>
        </div>}
      <div className="mt-3 divide-y divide-border border border-border">
        {query.data.sessions.map(session=><div key={session.planId} className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div><p className="text-sm font-medium">{new Date(session.startsAt).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Ends {new Date(session.endsAt).toLocaleString()} · {session.state}</p>
          </div>
          {session.linked?<span className="text-xs text-muted-foreground">Assigned to this cohort</span>:
          <Button size="sm" variant="outline" disabled={busy!==null} onClick={()=>void attach(session.planId)}>
            {busy===session.planId?"Assigning…":"Attach meeting"}
          </Button>}
        </div>)}
        {!query.data.sessions.length&&<p className="p-3 text-sm text-muted-foreground">No scheduled meetings at this authorized Site yet.</p>}
      </div>
      <h3 className="mt-7 text-base font-semibold">Participant roster</h3>
      <p className="mt-1 text-xs text-muted-foreground">Named records are visible only to the authorized provider. Classroom pairing is not attendance.</p>
      <div className="mt-3 overflow-x-auto border border-border">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-border bg-muted/30">
            <th scope="col" className="p-3">Participant</th>
            <th scope="col" className="p-3">Registration</th>
            <th scope="col" className="p-3">Attendance</th>
            <th scope="col" className="p-3">Completion</th>
          </tr></thead>
          <tbody>
            {query.data.roster.map(person=><tr key={person.registrationId} className="border-b border-border">
              <td className="p-3">{person.displayName}</td>
              <td className="p-3">
                {person.status}
                {person.seatReleased&&<p className="text-xs text-muted-foreground">Seat released</p>}
                {["withdrawn","cancelled"].includes(person.status)&&!person.seatReleased&&
                  person.completionOutcome!=="completed"&&
                  <div className="mt-2">
                    <button type="button" className="text-xs text-primary underline"
                      onClick={()=>{setSeatTarget(person.registrationId);setSeatReason("");}}>
                      Review capacity release
                    </button>
                    {seatTarget===person.registrationId&&<div className="mt-2 space-y-2 border border-border p-2">
                      <label className="block text-xs font-medium">Reason for releasing the seat
                        <textarea value={seatReason} maxLength={500} onChange={event=>setSeatReason(event.target.value)}
                          className="mt-2 w-full min-w-48 border border-border bg-background p-2" rows={2}
                          placeholder="Describe verified withdrawal and seat-release reason"/>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy!==null||seatReason.trim().length<15}
                          onClick={()=>void releaseSeat(person.registrationId)}>Confirm release</Button>
                        <Button size="sm" variant="outline" disabled={busy!==null}
                          onClick={()=>setSeatTarget(null)}>Cancel</Button>
                      </div>
                    </div>}
                  </div>}
              </td>
              <td className="p-3">{person.attendedLinkedSession?"Present at linked session":"Not verified"}</td>
              <td className="p-3">{person.completionOutcome??"No final decision"}</td>
            </tr>)}
          </tbody>
        </table>
        {!query.data.roster.length&&<p className="p-3 text-sm text-muted-foreground">No participants registered for this release.</p>}
      </div>
      {query.data.partial&&<p role="alert" className="mt-3 text-sm">The roster or evidence query was truncated. Do not use these figures as complete network totals.</p>}
      <p className="mt-3 text-xs leading-6 text-muted-foreground">{query.data.evidenceNote}</p>
    </>}
  </section>;
}
