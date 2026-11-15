import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import { getMyNoncreditSelfEnrollments } from "@/modules/enrollment/noncredit-self-enrollment.functions";
import { openMyNoncreditCourse } from "@/modules/enrollment/noncredit-self-enrollment-resume.functions";
import { withdrawMyNoncreditRegistration } from "@/modules/enrollment/noncredit-self-enrollment-withdraw.functions";
import { normalizeClientError } from "@/lib/client-error";

export const Route=createFileRoute("/learn/my-courses")({
  loader:async({context,location})=>{
    const value=await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if(!value.session?.authenticated)throw redirect({to:"/access",search:{returnTo:location.href}});
  },
  component:MyNoncreditCourses,
});

function MyNoncreditCourses(){
  const client=useQueryClient();
  const [withdrawConfirm,setWithdrawConfirm]=useState<string|null>(null);
  const [withdrawBusy,setWithdrawBusy]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const query=useQuery({queryKey:["my-noncredit-self-enrollments"],
    queryFn:()=>getMyNoncreditSelfEnrollments(),retry:false,staleTime:15_000});
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  async function open(courseAttemptId:string) {
    if(busy)return;
    setBusy(courseAttemptId);setError("");
    try{
      await openMyNoncreditCourse({data:{courseAttemptId}});
      window.location.assign("/learn/course/"+encodeURIComponent(courseAttemptId));
    }catch(e){
      setError(normalizeClientError(e,"Could not open the current learner course.").message);
      setBusy(null);
    }
  }
  async function withdraw(registrationId:string) {
    if(withdrawConfirm!==registrationId||withdrawBusy)return;
    setWithdrawBusy(registrationId);
    setError("");setNotice("");
    try {
      const result=await withdrawMyNoncreditRegistration({data:{
        registrationId,confirm:true,
      }});
      setWithdrawConfirm(null);
      await client.invalidateQueries({queryKey:["my-noncredit-self-enrollments"]});
      setNotice(result.alreadyWithdrawn
        ?"This registration was already withdrawn."
        :"Registration withdrawn. Your learning history and original consent record were retained.");
    } catch (cause) {
      setError(normalizeClientError(cause,"We could not withdraw this registration.").message);
    } finally {
      setWithdrawBusy(null);
    }
  }
  return <WorkspaceShell eyebrow="My CAN" width="wide" title="My courses"
    subtitle="Your noncredit course registrations and learning history are tied to your own verified CAN identity."
    actions={<Link to="/learn/enroll" search={{}} className="text-sm font-semibold text-primary underline underline-offset-4">Explore training</Link>}>
    {query.isPending && <p role="status" className="mt-6 border border-border bg-card p-5 text-sm">Loading your courses…</p>}
    {query.isError && <p role="alert" className="mt-6 border border-border bg-card p-5 text-sm">
      Your course records are temporarily unavailable. <button type="button" onClick={()=>void query.refetch()} className="font-semibold text-primary underline">Try again</button>
    </p>}
    {error && <p role="alert" className="mt-4 border border-border bg-card p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-4 border border-border bg-card p-4 text-sm">{notice}</p>}
    {query.data && <div className="mt-6 space-y-3">
      {query.data.map(course=><article key={course.courseAttemptId} className="border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {course.registrationStatus} · {course.attemptStatus}
            </p>
            <h2 className="mt-2 font-serif text-2xl">{course.trainingTitle}</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {course.deliveryMode==="facilitated"
                ? "Facilitated at "+(course.siteName??"an approved learning center")
                : "Independent online learning"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Registered {new Date(course.registeredAt).toLocaleDateString()}</p>
          </div>
          <div className="flex flex-col items-start gap-3">
            {["registered","active"].includes(course.registrationStatus)&&course.attemptStatus==="active"?
              <Button type="button" disabled={busy!==null||withdrawBusy!==null}
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
                    <Button type="button" variant="destructive" disabled={withdrawBusy!==null}
                      onClick={()=>void withdraw(course.registrationId)}>
                      {withdrawBusy===course.registrationId?"Withdrawing…":"Confirm withdrawal"}
                    </Button>
                    <Button type="button" variant="outline" disabled={withdrawBusy!==null}
                      onClick={()=>setWithdrawConfirm(null)}>Keep registration</Button>
                  </div>
                </div>:
                <button type="button" className="text-xs font-semibold text-muted-foreground underline underline-offset-4"
                  onClick={()=>{setNotice("");setWithdrawConfirm(course.registrationId);}}>
                  Withdraw registration
                </button>)}
          </div>
        </div>
      </article>)}
      {!query.data.length&&<div className="border border-border bg-card p-6">
        <h2 className="font-serif text-2xl">Your learning starts here</h2>
        <p className="mt-3 text-sm text-muted-foreground">You have no noncredit registrations yet. Find a published training and enroll when it opens.</p>
        <Link to="/learn/enroll" search={{}} className="mt-4 inline-block font-semibold text-primary underline underline-offset-4">Explore courses</Link>
      </div>}
    </div>}
  </WorkspaceShell>;
}
