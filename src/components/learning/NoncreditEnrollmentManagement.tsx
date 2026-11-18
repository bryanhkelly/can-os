import { Link, useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ActionDialog, EmptyState, MutationFeedback, QueryState, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { noncreditWaitlistQueryKeys } from "@/domain/noncredit-waitlist-query-keys";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { getMyNoncreditSelfEnrollmentHistoryPage, getMyNoncreditRegistrationById } from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { withdrawMyNoncreditRegistration } from "@/modules/enrollment/noncredit-self-enrollment-withdraw.functions";
import { normalizeClientError } from "@/lib/client-error";
import {getMyNoncreditWaitlistPage,getMyNoncreditWaitlistByRelease,cancelMyNoncreditWaitlist} from "@/modules/enrollment/noncredit-waitlist.functions";

export function NoncreditEnrollmentManagement({registrationId,releaseId}:{registrationId?:string;releaseId?:string}={}){
  const navigate=useNavigate();
  const {session}=useWorkspaceSession();
  const authorized=!!session?.authenticated;
  const scopeKey=session?.authenticated?session.activeGrantId:"signed-out";
  const client=useQueryClient();
  const [withdrawConfirm,setWithdrawConfirm]=useState<string|null>(null);
  const [cancelWaitlist,setCancelWaitlist]=useState<string|null>(null);

  // Keep every registration reachable from its source-owned keyset history.
  // Exact embedded records still use the server's Person-owned ID lookup.
  const query=useInfiniteQuery({
    queryKey:["my-noncredit-self-enrollments",scopeKey,registrationId??"all"],
    initialPageParam:null as {registeredAt:string;registrationId:string}|null,
    queryFn:async({pageParam})=>{
      if(registrationId){
        const record=await getMyNoncreditRegistrationById({data:{registrationId}});
        return {items:record?[record]:[],nextCursor:null};
      }
      return getMyNoncreditSelfEnrollmentHistoryPage({data:{cursor:pageParam}});
    },
    getNextPageParam:last=>last.nextCursor??undefined,
    enabled:authorized&&!releaseId,retry:false,staleTime:15_000,
  });
  const [busy,setBusy]=useState<string|null>(null);
  const waiting=useInfiniteQuery({
    queryKey:noncreditWaitlistQueryKeys.pages(scopeKey,releaseId),
    initialPageParam:null as {joinedAt:string;waitlistId:string}|null,
    queryFn:async({pageParam})=>{
      if(releaseId){
        const entry=await getMyNoncreditWaitlistByRelease({data:{releaseId}});
        return {items:entry?[entry]:[],nextCursor:null};
      }
      return getMyNoncreditWaitlistPage({data:{cursor:pageParam}});
    },
    getNextPageParam:last=>last.nextCursor??undefined,
    enabled:authorized&&!registrationId,retry:false,staleTime:15_000,
  });
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
      // The course workspace restores its verified session for all entry paths.
      await navigate({to:"/learn/course/$courseAttemptId",params:{courseAttemptId}});
    }catch(e){
      setError(normalizeClientError(e,"Could not open the current learner course.").message);
    }finally{
      // A route loader can refuse entry without unmounting this workspace.
      // Do not leave the course action disabled after navigation settles.
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
  const visibleCourses=releaseId ? [] : query.data?.pages.flatMap(page=>page.items);
  const visibleWaitlist=registrationId ? [] : waiting.data?.pages.flatMap(page=>page.items);
  const waitingListToLeave=visibleWaitlist?.find(item=>item.releaseId===cancelWaitlist);
  const registrationToWithdraw=visibleCourses?.find(course=>course.registrationId===withdrawConfirm);
  if(!authorized)return <p role="status" className="border border-border p-4 text-sm">Sign in with your CAN account to manage training.</p>;
  return <section aria-label="Manage noncredit training registrations" className="space-y-4">
    {!registrationId&&!releaseId&&<div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-serif text-xl">Training registrations and waiting lists</h3><Link to="/learn/enroll" search={{}} className="text-sm font-semibold text-primary underline underline-offset-4">Explore training</Link></div>}
    {!releaseId&&<QueryState loading={query.isPending?"Loading your courses…":undefined}
      error={query.isError?"Your course records are temporarily unavailable.":undefined}
      onRetry={()=>void query.refetch()} retrying={query.isFetching}/>}
    {error && <WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
    <MutationFeedback state={{...mutation,retryRefresh:mutation.retryRefresh}}
      pendingMessage="Saving enrollment change…" className="mt-4"/>
    {waiting.isError&&<QueryState error="Your waiting-list status is temporarily unavailable."
      onRetry={()=>void waiting.refetch()} retrying={waiting.isFetching}/>} 
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
            <Button variant="ghost" type="button" size="sm" disabled={changeBusy||busy!==null}
              className="text-sm underline text-muted-foreground"
              onClick={()=>{setWithdrawConfirm(null);setCancelWaitlist(item.releaseId);}}>
              Leave waiting list
            </Button>
          </div>
        </article>)}
      </div>
      {waiting.hasNextPage&&!releaseId&&<div className="mt-4">
        <Button type="button" variant="outline" loading={waiting.isFetchingNextPage}
          disabled={waiting.isFetchingNextPage||changeBusy}
          onClick={()=>void waiting.fetchNextPage()}>
          {waiting.isFetchingNextPage?"Loading older invitations…":"Load older waiting-list entries"}
        </Button>
      </div>}
      {waiting.isFetchNextPageError&&<WorkspaceNotice tone="attention" className="mt-4">
        <span>Older waiting-list entries could not be retrieved. Current entries remain visible.</span>
        <Button type="button" variant="outline" size="sm" className="ml-3"
          onClick={()=>void waiting.fetchNextPage()}>Retry older invitations</Button>
      </WorkspaceNotice>}
    </section>}
    {visibleCourses && <div className="mt-6 space-y-3">
      {visibleCourses.map(course=><article key={course.courseAttemptId} data-course-attempt-id={course.courseAttemptId} className={registrationId?"p-2":"border border-border bg-card p-5"}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2" aria-label="Course status">
              <StatusBadge tone={["registered","active"].includes(course.registrationStatus)?"success":"neutral"}>
                Registration: {course.registrationStatus}
              </StatusBadge>
              <StatusBadge tone={course.attemptStatus==="active"?"info":"neutral"}>
                Course: {course.attemptStatus}
              </StatusBadge>
            </div>
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
              <Button type="button" variant="ghost" size="sm"
                className="text-xs font-semibold text-muted-foreground underline underline-offset-4"
                disabled={changeBusy||busy!==null}
                onClick={()=>{setCancelWaitlist(null);setWithdrawConfirm(course.registrationId);}}>
                Withdraw registration
              </Button>}
          </div>
        </div>
      </article>)}
      {!visibleCourses.length&&!registrationId&&!releaseId&&<EmptyState
        title="Your learning starts here"
        description="You have no noncredit registrations yet. Find a published training and enroll when it opens."
        actions={<Link to="/learn/enroll" search={{}}
          className="font-semibold text-primary underline underline-offset-4">Explore courses</Link>}/>}
      {query.hasNextPage&&!registrationId&&<div className="flex flex-wrap items-center gap-3 pt-3">
        <Button type="button" variant="outline" loading={query.isFetchingNextPage}
          disabled={query.isFetchingNextPage||changeBusy}
          onClick={()=>void query.fetchNextPage()}>
          {query.isFetchingNextPage?"Loading older registrations…":"Load older registrations"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Earlier records remain attached to their original registrations.
        </span>
      </div>}
      {query.isFetchNextPageError&&<WorkspaceNotice tone="attention">
        <span>Older registration records could not be loaded. Previously displayed records remain available.</span>
        <Button type="button" variant="outline" size="sm" className="ml-3"
          onClick={()=>void query.fetchNextPage()}>Retry older records</Button>
      </WorkspaceNotice>}
    </div>}
    <ActionDialog open={Boolean(waitingListToLeave)}
      title="Leave waiting list?"
      description={<p>Leave the waiting list for <strong>{waitingListToLeave?.title??"this training"}</strong>?
        Your place or invitation will be released. Existing learning and registration records are preserved.</p>}
      confirmLabel="Leave waiting list" destructive
      pending={mutation.pending} pendingLabel="Leaving waiting list…"
      confirmDisabled={changeBusy||busy!==null}
      onConfirm={()=>{if(cancelWaitlist)void leaveWaitlist(cancelWaitlist);}}
      onClose={()=>setCancelWaitlist(null)}/>
    <ActionDialog open={Boolean(registrationToWithdraw)}
      title="Withdraw from registration?"
      description={<>
        <p>Withdraw from <strong>{registrationToWithdraw?.trainingTitle??"this training"}</strong>?</p>
        <p className="mt-2">This ends course access and facilitator-room pairing. Your registration
          history and consent remain recorded. Your original place is not automatically reassigned.</p>
      </>}
      confirmLabel="Withdraw registration" destructive
      pending={mutation.pending} pendingLabel="Withdrawing…"
      confirmDisabled={changeBusy||busy!==null}
      onConfirm={()=>{if(withdrawConfirm)void withdraw(withdrawConfirm);}}
      onClose={()=>setWithdrawConfirm(null)}/>
  </section>;
}
