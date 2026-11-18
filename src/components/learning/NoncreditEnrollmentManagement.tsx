import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { getMyNoncreditSelfEnrollments, getMyNoncreditRegistrationById } from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { openMyNoncreditCourse } from "@/modules/enrollment/noncredit-self-enrollment-resume.functions";
import { withdrawMyNoncreditRegistration } from "@/modules/enrollment/noncredit-self-enrollment-withdraw.functions";
import { normalizeClientError } from "@/lib/client-error";
import {getMyNoncreditWaitlist,getMyNoncreditWaitlistByRelease,cancelMyNoncreditWaitlist} from "@/modules/enrollment/noncredit-waitlist.functions";

export function NoncreditEnrollmentManagement({registrationId,releaseId}:{registrationId?:string;releaseId?:string}={}){
  const navigate=useNavigate();
  const {session}=useWorkspaceSession();
  const authorized=!!session?.authenticated;
  const scopeKey=session?.authenticated?session.activeGrantId:"signed-out";
  const client=useQueryClient();
  const [withdrawConfirm,setWithdrawConfirm]=useState<string|null>(null);
  const [cancelWaitlist,setCancelWaitlist]=useState<string|null>(null);

  const query=useQuery({queryKey:["my-noncredit-self-enrollments",scopeKey,registrationId??"all"],
    queryFn:async()=>{
      if(!registrationId)return getMyNoncreditSelfEnrollments();
      const record=await getMyNoncreditRegistrationById({data:{registrationId}});
      return record?[record]:[];
    },enabled:authorized&&!releaseId,retry:false,staleTime:15_000});
  const [busy,setBusy]=useState<string|null>(null);
  const waiting=useQuery({queryKey:["my-noncredit-waitlist",scopeKey,releaseId??"all"],queryFn:async()=>{
    if(!releaseId)return getMyNoncreditWaitlist();
    const entry=await getMyNoncreditWaitlistByRelease({data:{releaseId}});
    return entry?[entry]:[];
  },enabled:authorized&&!registrationId,retry:false,staleTime:15_000});
  const [error,setError]=useState("");
  const mutation=useMutationFeedback(async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:["my-noncredit-self-enrollments"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["my-noncredit-waitlist"]},{throwOnError:true}),
      client.invalidateQueries({queryKey:["my-activity"]},{throwOnError:true}),
    ]);
  });
  const changeBusy=mutation.pending||mutation.refreshFailed;
  async function open(courseAttemptId:string) {
    if(busy)return;
    setBusy(courseAttemptId);setError("");
    try{
      await openMyNoncreditCourse({data:{courseAttemptId}});
      await navigate({to:"/learn/course/$courseAttemptId",params:{courseAttemptId}});
    }catch(e){
      setError(normalizeClientError(e,"Could not open the current learner course.").message);
      setBusy(null);
    }
  }
  async function withdraw(registrationId:string) {
    if(withdrawConfirm!==registrationId||changeBusy||busy!==null)return;
    const outcome=await mutation.run(
      ()=>withdrawMyNoncreditRegistration({data:{registrationId,confirm:true}}),
      {
        successMessage:result=>result.alreadyWithdrawn
          ?"This registration was already withdrawn."
          :"Registration withdrawn. Your learning history and original consent record were retained.",
        commandErrorMessage:"We could not withdraw this registration.",
        refreshErrorMessage:"Withdrawal was saved, but your learning records could not refresh. Retry refresh, not the withdrawal.",
      },
    );
    if(outcome.status==="saved"||outcome.status==="refresh-failed")
      setWithdrawConfirm(null);
  }
  async function leaveWaitlist(releaseId:string) {
    if(cancelWaitlist!==releaseId||changeBusy||busy!==null)return;
    const outcome=await mutation.run(
      ()=>cancelMyNoncreditWaitlist({data:{releaseId}}),
      {
        successMessage:"You left the waiting list. Your enrollment history was not changed.",
        commandErrorMessage:"Unable to cancel your waitlist entry.",
        refreshErrorMessage:"Your waiting-list cancellation was saved, but My Activity could not refresh. Retry refresh instead of cancelling again.",
      },
    );
    if(outcome.status==="saved"||outcome.status==="refresh-failed")
      setCancelWaitlist(null);
  }
  const visibleCourses=releaseId ? [] : query.data;
  const visibleWaitlist=registrationId ? [] : waiting.data;
  if(!authorized)return <p role="status" className="border border-border p-4 text-sm">Sign in with your CAN account to manage training.</p>;
  return <section aria-label="Manage noncredit training registrations" className="space-y-4">
    {!registrationId&&!releaseId&&<div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-serif text-xl">Training registrations and waiting lists</h3><Link to="/learn/enroll" search={{}} className="text-sm font-semibold text-primary underline underline-offset-4">Explore training</Link></div>}
    {!releaseId&&query.isPending && <p role="status" className="mt-6 border border-border bg-card p-5 text-sm">Loading your courses…</p>}
    {!releaseId&&query.isError && <p role="alert" className="mt-6 border border-border bg-card p-5 text-sm">
      Your course records are temporarily unavailable. <button type="button" onClick={()=>void query.refetch()} className="font-semibold text-primary underline">Try again</button>
    </p>}
    {error && <p role="alert" className="mt-4 border border-border bg-card p-4 text-sm">{error}</p>}
    <MutationFeedback state={{...mutation,retryRefresh:mutation.retryRefresh}}
      pendingMessage="Saving enrollment change…" className="mt-4"/>
    {waiting.isError&&<p role="alert" className="text-sm">Your waiting-list status is temporarily unavailable. <button type="button" className="font-semibold underline" onClick={()=>void waiting.refetch()}>Try again</button></p>}
    {waiting.isPending&&!registrationId&&<p role="status" className="text-sm">Loading waiting-list controls…</p>}
    {releaseId&&waiting.isSuccess&&!visibleWaitlist?.length&&<p role="status" className="text-sm">This waiting-list entry is no longer available in your account.</p>}
    {registrationId&&query.isSuccess&&!visibleCourses?.length&&<p role="status" className="text-sm">This registration is no longer available in your account.</p>}
    {waiting.isSuccess&&Boolean(visibleWaitlist?.length)&&<section className="mt-6 border border-border bg-card p-5" aria-label="My training waiting lists">
      {!releaseId&&<h2 className="font-serif text-2xl">Waiting lists and reserved invitations</h2>}
      <p className="mt-2 text-sm text-muted-foreground">A waiting place is not enrollment. Reserved invitations expire and require you to confirm your registration personally.</p>
      <div className="mt-3 divide-y divide-border">
        {visibleWaitlist?.map(item=><article key={item.releaseId} className="py-4">
          {!releaseId&&<h3 className="font-semibold text-sm">{item.title}</h3>}
          <p className="mt-2 text-sm">{item.invitationActive?"A seat is reserved for you":item.status==="expired"?"Invitation expired":"Waiting for an available place"}</p>
          {item.invitationActive&&<p className="mt-1 text-xs text-muted-foreground">Claim before {item.inviteExpiresAt?new Date(item.inviteExpiresAt).toLocaleString():"the invitation expires"}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            {item.invitationActive&&<Link to="/learn/enroll" search={{release:item.releaseId}} className="text-sm underline text-primary">Claim reserved place</Link>}
            {cancelWaitlist===item.releaseId?
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="destructive" disabled={busy!==null||changeBusy}
                  onClick={()=>void leaveWaitlist(item.releaseId)}>Confirm leave waitlist</Button>
                <Button type="button" variant="outline" size="sm" disabled={changeBusy} onClick={()=>setCancelWaitlist(null)}>Keep my place</Button>
              </div>:
              <Button variant="ghost" type="button" size="sm" disabled={changeBusy||busy!==null} className="text-sm underline text-muted-foreground" onClick={()=>setCancelWaitlist(item.releaseId)}>Leave waiting list</Button>}
          </div>
        </article>)}
      </div>
    </section>}
    {visibleCourses && <div className="mt-6 space-y-3">
      {visibleCourses.map(course=><article key={course.courseAttemptId} data-course-attempt-id={course.courseAttemptId} className={registrationId?"p-2":"border border-border bg-card p-5"}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {course.registrationStatus} · {course.attemptStatus}
            </p>
            {!registrationId&&<h2 className="mt-2 font-serif text-2xl">{course.trainingTitle}</h2>}
            <p className="mt-2 text-xs text-muted-foreground">
              {course.deliveryMode==="facilitated"
                ? "Facilitated at "+(course.siteName??"an approved learning center")
                : "Independent online learning"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Registered {new Date(course.registeredAt).toLocaleDateString()}</p>
            {course.upcomingSessions.length>0&&
              <p className="mt-2 text-xs text-muted-foreground">
                Next meeting: {new Date(course.upcomingSessions[0]!.startsAt).toLocaleString()}
                {course.upcomingSessions.length>1?" · "+course.upcomingSessions.length+" upcoming meetings":""}
              </p>}
          </div>
          <div className="flex flex-col items-start gap-3">
            {["registered","active"].includes(course.registrationStatus)&&course.attemptStatus==="active"?
              <Button type="button" disabled={busy!==null||changeBusy}
                onClick={()=>void open(course.courseAttemptId)}>
                {busy===course.courseAttemptId?"Opening…":"Open course"}
              </Button>:
              <p className="text-sm text-muted-foreground">Learning access is not currently active</p>}
            {["registered","active"].includes(course.registrationStatus)&&
              (withdrawConfirm===course.registrationId?
                <div className="border border-border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">Withdraw from {course.trainingTitle}?</p>
                  <p className="mt-2 max-w-sm text-muted-foreground">
                    This ends course access and facilitator-room pairing.
                    Your registration history and consent remain recorded.
                    Your original place is not automatically reassigned.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button type="button" variant="destructive" disabled={changeBusy||busy!==null}
                      onClick={()=>void withdraw(course.registrationId)}>
                      {mutation.pending?"Withdrawing…":"Confirm withdrawal"}
                    </Button>
                    <Button type="button" variant="outline" disabled={changeBusy||busy!==null}
                      onClick={()=>setWithdrawConfirm(null)}>Keep registration</Button>
                  </div>
                </div>:
                <button type="button" className="text-xs font-semibold text-muted-foreground underline underline-offset-4"
                  onClick={()=>setWithdrawConfirm(course.registrationId)} disabled={changeBusy||busy!==null}>
                  Withdraw registration
                </button>)}
          </div>
        </div>
      </article>)}
      {!visibleCourses.length&&!registrationId&&!releaseId&&<div className="border border-border bg-card p-6">
        <h2 className="font-serif text-2xl">Your learning starts here</h2>
        <p className="mt-3 text-sm text-muted-foreground">You have no noncredit registrations yet. Find a published training and enroll when it opens.</p>
        <Link to="/learn/enroll" search={{}} className="mt-4 inline-block font-semibold text-primary underline underline-offset-4">Explore courses</Link>
      </div>}
    </div>}
  </section>;
}
