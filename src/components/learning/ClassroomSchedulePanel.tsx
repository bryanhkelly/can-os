import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { MutationFeedback, StatusBadge, ActionDialog } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { fourSessionSchedulePreset, validClassroomScheduleWindow, validClassroomSessionWindows, type FourSessionCadence } from "@/domain/classroom-scheduling";

import {
  cancelClassroomPlan, getClassroomSchedule, openScheduledClassroom,
  rescheduleClassroom, scheduleClassroom, scheduleFourClassroomSessions,
} from "@/modules/learning/classroom-scheduling.functions";

type Choice={
  deploymentId:string;courseVersionId:string;siteId:string;
  courseTitle:string;deploymentName:string;
};
function localTime(date:Date):string{
  const local=new Date(date.getTime()-date.getTimezoneOffset()*60_000);
  return local.toISOString().slice(0,16);
}
function iso(value:string):string|null{
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toISOString():null;
}
export function ClassroomSchedulePanel({choices,onRoomStarted}:{
  choices:Choice[];
  onRoomStarted:(value:{
    roomId:string;pairingCode:string;pairingExpiresAt:string;
  })=>Promise<void>|void;
}){
  const schedule=useQuery({
    queryKey:["classroom-plans"],
    queryFn:()=>getClassroomSchedule(),
    staleTime:0,refetchInterval:60_000,retry:false,
  });
  const requestIds=useRef<Record<string,string>>({});
  const [selected,setSelected]=useState("");
  const [startsAt,setStartsAt]=useState("");
  const [endsAt,setEndsAt]=useState("");
  const [showSessionPlanner,setShowSessionPlanner]=useState(false);
  const [batchMeetings,setBatchMeetings]=useState<{start:string;end:string}[]>([]);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const feedback=useMutationFeedback(()=>schedule.refetch({throwOnError:true}));
  const blocked=Boolean(busy)||feedback.refreshFailed;
  const [cancelPlanId,setCancelPlanId]=useState<string|null>(null);
  const [edit,setEdit]=useState<{
    planId:string;start:string;end:string;
  }|null>(null);
  useEffect(()=>{
    const tomorrow=new Date(Date.now()+24*60*60_000);
    tomorrow.setMinutes(0,0,0);
    setStartsAt(localTime(tomorrow));
    setEndsAt(localTime(new Date(tomorrow.getTime()+60*60_000)));
  },[]);
  const choice=choices.find(row=>selected===
    row.deploymentId+":"+row.courseVersionId+":"+row.siteId);
  const batchReady=batchMeetings.length===4&&
    validClassroomSessionWindows(batchMeetings.map(row=>({startsAt:row.start,endsAt:row.end})))&&
    batchMeetings.every(row=>validClassroomScheduleWindow(
      new Date(row.start),new Date(row.end),new Date(),
    ));
  function fillSessionDates(cadence:FourSessionCadence){
    try{
      const windows=fourSessionSchedulePreset(startsAt,endsAt,cadence);
      setBatchMeetings(windows.map(window=>({
        start:localTime(new Date(window.startsAt)),
        end:localTime(new Date(window.endsAt)),
      })));
      setShowSessionPlanner(true);
      setError("");
    }catch{
      setError("Choose a valid first meeting and end time before filling the four-session calendar.");
    }
  }
  async function run(key:string,action:()=>Promise<void>){
    if(blocked)return;
    setBusy(key);setError("");
    try{
      await feedback.run(action,{
        successMessage:"Classroom calendar updated. Learner Course attempts remain unchanged.",
        commandErrorMessage:"The calendar action could not be confirmed. Check your Site authority and the meeting window.",
        refreshErrorMessage:"The calendar action was saved, but the latest schedule could not be loaded. Retry the refresh before taking another action.",
      });
    }finally{setBusy("");}
  }
  return <section className="mt-5 border border-border bg-card p-5"
    aria-label="Plan recurring classroom meetings">
    <h2 className="font-serif text-xl font-semibold">Classroom calendar</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Schedule each teaching meeting against the existing CAN delivery calendar.
      Booking a meeting does not enroll learners or record attendance.
      Meetings can be weekly, twice per week, Monday through Thursday, or on individually selected dates with holiday breaks.
      A schedule does not create a new Course or enroll anyone.
    </p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Label className="block text-sm font-medium sm:col-span-2">
        Authorized Site and Course
        <Select className="mt-2 min-h-10 w-full border border-border bg-background p-2"
          value={selected} onChange={e=>{
            setSelected(e.target.value);
            setShowSessionPlanner(false);
            setBatchMeetings([]);
          }}>
          <option value="">Choose an approved Course</option>
          {choices.map(row=><option
            key={row.deploymentId+":"+row.courseVersionId+":"+row.siteId}
            value={row.deploymentId+":"+row.courseVersionId+":"+row.siteId}>
            {row.deploymentName} · {row.courseTitle} · Site {row.siteId.slice(0,8)}
          </option>)}
        </Select>
      </Label>
      <Label className="block text-sm font-medium">Starts (your local time)
        <Input type="datetime-local" value={startsAt}
          onChange={e=>setStartsAt(e.target.value)}
          className="mt-2 min-h-10 w-full border border-border bg-background p-2"/>
      </Label>
      <Label className="block text-sm font-medium">Ends (your local time)
        <Input type="datetime-local" value={endsAt}
          onChange={e=>setEndsAt(e.target.value)}
          className="mt-2 min-h-10 w-full border border-border bg-background p-2"/>
      </Label>
    </div>
    <Button className="mt-4" type="button"
      disabled={blocked||!choice||!iso(startsAt)||!iso(endsAt)}
      onClick={()=>void run("new",async()=>{
        if(!choice)return;
        const begin=iso(startsAt),end=iso(endsAt);
        if(!begin||!end)throw new Error("Invalid calendar times");
        const key=[choice.deploymentId,choice.courseVersionId,
          choice.siteId,begin,end].join(":");
        const requestId=requestIds.current[key]??crypto.randomUUID();
        requestIds.current[key]=requestId;
        await scheduleClassroom({data:{
          deploymentId:choice.deploymentId,courseVersionId:choice.courseVersionId,
          siteId:choice.siteId,startsAt:begin,endsAt:end,requestId,
        }});
        delete requestIds.current[key];
      })}>{busy==="new"?"Saving…":"Schedule classroom meeting"}</Button>
    <div className="mt-4 border border-border bg-muted/20 p-4" aria-label="Plan a four-session course">
      <h3 className="text-base font-semibold">Plan four dated sessions</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Pick a starting pattern, then edit any of the four dates or times. This accommodates
        two meetings in a week, four consecutive weekdays, holiday breaks, or a course spanning five or more weeks.
        All four bookings are saved together, using the same authorized Course and Site.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={blocked||!choice}
          onClick={()=>fillSessionDates("weekly")}>Fill weekly dates</Button>
        <Button type="button" variant="outline" disabled={blocked||!choice}
          onClick={()=>fillSessionDates("twice-weekly")}>Fill twice-weekly dates</Button>
        <Button type="button" variant="outline" disabled={blocked||!choice}
          onClick={()=>fillSessionDates("monday-thursday")}>Fill Monday–Thursday</Button>
        {showSessionPlanner&&<Button type="button" variant="ghost" disabled={blocked}
          onClick={()=>setShowSessionPlanner(false)}>Hide date editor</Button>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Monday–Thursday starts on the first Monday on or after the selected start date.
        All generated times and dates can be adjusted before saving.
      </p>
      {showSessionPlanner&&<div className="mt-4 space-y-3">
        {batchMeetings.map((meeting,index)=><fieldset key={index}
          className="grid gap-3 border border-border bg-card p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">Session {index+1}</legend>
          <Label className="text-sm font-medium">Start (your local time)
            <Input type="datetime-local" value={meeting.start}
              onChange={event=>setBatchMeetings(current=>current.map((row,i)=>
                i===index?{...row,start:event.target.value}:row))}
              className="mt-1"/>
          </Label>
          <Label className="text-sm font-medium">End (your local time)
            <Input type="datetime-local" value={meeting.end}
              onChange={event=>setBatchMeetings(current=>current.map((row,i)=>
                i===index?{...row,end:event.target.value}:row))}
              className="mt-1"/>
          </Label>
        </fieldset>)}
        {!batchReady&&<p role="status" className="text-sm text-muted-foreground">
          Enter four future, non-overlapping meeting windows. Each must last at least
          15 minutes and meet the server's normal scheduling limits.
        </p>}
        <Button type="button" disabled={blocked||!choice||!batchReady}
          onClick={()=>void run("four-sessions",async()=>{
            if(!choice||!batchReady)return;
            const sorted=batchMeetings.map(row=>({
              startsAt:iso(row.start),endsAt:iso(row.end),
            })).sort((a,b)=>Date.parse(a.startsAt??"")-Date.parse(b.startsAt??""));
            if(sorted.some(row=>!row.startsAt||!row.endsAt))
              throw new Error("Invalid meeting dates");
            const meetings=sorted.map(row=>{
              const key=[choice.deploymentId,choice.courseVersionId,
                choice.siteId,row.startsAt,row.endsAt].join(":");
              const requestId=requestIds.current[key]??crypto.randomUUID();
              requestIds.current[key]=requestId;
              return {
                deploymentId:choice.deploymentId,courseVersionId:choice.courseVersionId,
                siteId:choice.siteId,startsAt:row.startsAt!,endsAt:row.endsAt!,requestId,
              };
            });
            await scheduleFourClassroomSessions({data:{meetings}});
            for(const row of sorted){
              const key=[choice.deploymentId,choice.courseVersionId,
                choice.siteId,row.startsAt,row.endsAt].join(":");
              delete requestIds.current[key];
            }
            setShowSessionPlanner(false);
            setBatchMeetings([]);
          })}>{busy==="four-sessions"?"Scheduling sessions…":"Save all four sessions"}</Button>
      </div>}
      <p className="mt-3 text-xs text-muted-foreground">
        Scheduling does not enroll learners or verify attendance. Attach meetings to
        the appropriate enrollment release in Cohort & participant management.
      </p>
    </div>
    <div className="mt-6 border-t border-border pt-4">
      <h3 className="font-semibold">Upcoming and recent meetings</h3>
      {schedule.isPending&&<p role="status" className="mt-3 text-sm">Loading your authorized calendar…</p>}
      {schedule.isError&&<p role="alert" className="mt-3 text-sm text-destructive">
        The classroom calendar is not available. No bookings were changed.
      </p>}
      {schedule.isSuccess&&schedule.data.partial&&<p role="status" className="mt-2 text-xs">
        Only the first 100 authorized recent/upcoming meetings are shown.
      </p>}
      {schedule.isSuccess&&!schedule.data.plans.length&&<p className="mt-3 text-sm text-muted-foreground">
        No classroom meetings have been scheduled.
      </p>}
      {schedule.isSuccess&&schedule.data.plans.map(plan=>{
        const scheduled=new Date(plan.startsAt).toLocaleString();
        const withinStart=Date.now()>=Date.parse(plan.startsAt)-15*60_000 &&
          Date.now()<Date.parse(plan.endsAt);
        return <article key={plan.id} className="mt-4 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">{choices.find(row=>
                row.deploymentId===plan.deploymentId &&
                row.courseVersionId===plan.courseVersionId &&
                row.siteId===plan.siteId)?.courseTitle??"Authorized Course"}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{scheduled}</span>
                <StatusBadge tone={plan.state==="started"?"success":plan.state==="cancelled"?"neutral":"info"}>
                  {plan.state}
                </StatusBadge>
                <span>Site {plan.siteId.slice(0,8)}</span>
              </p>
            </div>
            {plan.state==="scheduled"&&!plan.nativeClassId&&<div className="flex flex-wrap gap-2">
              <Button type="button" size="sm"
                disabled={blocked||!withinStart}
                onClick={()=>void run(plan.id+":start",async()=>{
                  const result=await openScheduledClassroom({data:{planId:plan.id}});
                  if(result.pairingCode&&result.pairingExpiresAt)
                    await onRoomStarted({roomId:result.facilitatedSessionId,
                      pairingCode:result.pairingCode,
                      pairingExpiresAt:result.pairingExpiresAt});
                })}>Start scheduled room</Button>
              <Button type="button" size="sm" variant="outline" disabled={blocked}
                onClick={()=>setEdit({
                  planId:plan.id,start:localTime(new Date(plan.startsAt)),
                  end:localTime(new Date(plan.endsAt)),
                })}>Reschedule</Button>
              <Button type="button" size="sm" variant="outline" disabled={blocked}
                onClick={()=>setCancelPlanId(plan.id)}>Cancel meeting</Button>
            </div>}
            {plan.nativeClassId&&<Link
              to="/class/$classId" params={{classId:plan.nativeClassId}}
              search={{view:"manage",tab:"sessions",lesson:undefined,session:undefined}}
              className="inline-flex min-h-10 items-center border border-border px-3 text-sm font-medium">
              Manage native Class Sessions
            </Link>}
            {plan.state==="started"&&plan.facilitatedSessionId&&
              <p className="text-xs text-muted-foreground">
                Room started. Find it under Your rooms and refresh its joining code as needed.
              </p>}
          </div>
          {edit?.planId===plan.id&&!plan.nativeClassId&&<div className="mt-3 grid gap-3 border border-border p-4 sm:grid-cols-2">
            <Label className="text-sm font-medium">New start
              <Input type="datetime-local" value={edit.start}
                onChange={e=>setEdit(current=>current?{...current,start:e.target.value}:null)}
                className="mt-2 w-full border border-border bg-background p-2"/>
            </Label>
            <Label className="text-sm font-medium">New end
              <Input type="datetime-local" value={edit.end}
                onChange={e=>setEdit(current=>current?{...current,end:e.target.value}:null)}
                className="mt-2 w-full border border-border bg-background p-2"/>
            </Label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" size="sm" disabled={blocked}
                onClick={()=>void run(plan.id+":edit",async()=>{
                  if(!edit) return;
                  const start=iso(edit.start),end=iso(edit.end);
                  if(!start||!end)throw new Error("Invalid times");
                  await rescheduleClassroom({data:{
                    planId:plan.id,startsAt:start,endsAt:end,
                  }});
                  setEdit(null);
                })}>Save reschedule</Button>
              <Button type="button" size="sm" variant="outline"
                onClick={()=>setEdit(null)}>Discard</Button>
            </div>
          </div>}
        </article>;
      })}
    </div>
    {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    <MutationFeedback state={feedback} pendingMessage="Updating classroom calendar…" className="mt-4"/>
    <ActionDialog open={cancelPlanId!==null} title="Cancel classroom meeting?"
      description="Cancel this scheduled meeting without changing the Course, enrollment or learner history."
      confirmLabel="Cancel meeting" destructive pending={feedback.pending||Boolean(busy)}
      confirmDisabled={feedback.refreshFailed}
      onClose={()=>setCancelPlanId(null)}
      onConfirm={()=>{
        const planId=cancelPlanId;
        if(!planId)return;
        void run(planId+":cancel",async()=>{
          await cancelClassroomPlan({data:{planId}});
          setCancelPlanId(null);
        });
      }}>
      {feedback.error&&!feedback.refreshFailed&&<p role="alert" className="text-sm text-destructive">{feedback.error}</p>}
    </ActionDialog>
  </section>;
}
