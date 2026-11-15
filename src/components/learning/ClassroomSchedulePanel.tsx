import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  cancelClassroomPlan, getClassroomSchedule, openScheduledClassroom,
  rescheduleClassroom, scheduleClassroom,
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
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
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
  async function run(key:string,action:()=>Promise<void>){
    if(busy)return;
    setBusy(key);setError("");setNotice("");
    try{
      await action();
      await schedule.refetch();
      setNotice("Classroom calendar updated. Learner Course attempts remain unchanged.");
    }catch{
      setError("The calendar operation was not saved. Check current Site authority, Course approval and the date window.");
    }finally{setBusy("");}
  }
  return <section className="mt-5 border border-border bg-card p-5"
    aria-label="Plan recurring classroom meetings">
    <h2 className="font-serif text-xl font-semibold">Classroom calendar</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Schedule each teaching meeting against the existing CAN delivery calendar.
      Booking a meeting does not enroll learners or record attendance.
      Create multiple meetings for a four-week course without duplicating the Course.
    </p>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-medium sm:col-span-2">
        Authorized Site and Course
        <select className="mt-2 min-h-10 w-full border border-border bg-background p-2"
          value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="">Choose an approved Course</option>
          {choices.map(row=><option
            key={row.deploymentId+":"+row.courseVersionId+":"+row.siteId}
            value={row.deploymentId+":"+row.courseVersionId+":"+row.siteId}>
            {row.deploymentName} · {row.courseTitle} · Site {row.siteId.slice(0,8)}
          </option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Starts (your local time)
        <input type="datetime-local" value={startsAt}
          onChange={e=>setStartsAt(e.target.value)}
          className="mt-2 min-h-10 w-full border border-border bg-background p-2"/>
      </label>
      <label className="block text-sm font-medium">Ends (your local time)
        <input type="datetime-local" value={endsAt}
          onChange={e=>setEndsAt(e.target.value)}
          className="mt-2 min-h-10 w-full border border-border bg-background p-2"/>
      </label>
    </div>
    <Button className="mt-4" type="button"
      disabled={!!busy||!choice||!iso(startsAt)||!iso(endsAt)}
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
              <p className="mt-1 text-xs text-muted-foreground">
                {scheduled} · {plan.state} · Site {plan.siteId.slice(0,8)}
              </p>
            </div>
            {plan.state==="scheduled"&&<div className="flex flex-wrap gap-2">
              <Button type="button" size="sm"
                disabled={!!busy||!withinStart}
                onClick={()=>void run(plan.id+":start",async()=>{
                  const result=await openScheduledClassroom({data:{planId:plan.id}});
                  if(result.pairingCode&&result.pairingExpiresAt)
                    await onRoomStarted({roomId:result.facilitatedSessionId,
                      pairingCode:result.pairingCode,
                      pairingExpiresAt:result.pairingExpiresAt});
                })}>Start scheduled room</Button>
              <Button type="button" size="sm" variant="outline" disabled={!!busy}
                onClick={()=>setEdit({
                  planId:plan.id,start:localTime(new Date(plan.startsAt)),
                  end:localTime(new Date(plan.endsAt)),
                })}>Reschedule</Button>
              <Button type="button" size="sm" variant="outline" disabled={!!busy}
                onClick={()=>{if(window.confirm("Cancel this classroom meeting?"))
                  void run(plan.id+":cancel",async()=>{
                    await cancelClassroomPlan({data:{planId:plan.id}});
                  });}}>Cancel</Button>
            </div>}
            {plan.state==="started"&&plan.facilitatedSessionId&&
              <p className="text-xs text-muted-foreground">
                Room started. Find it under Your rooms and refresh its joining code as needed.
              </p>}
          </div>
          {edit?.planId===plan.id&&<div className="mt-3 grid gap-3 border border-border p-4 sm:grid-cols-2">
            <label className="text-sm font-medium">New start
              <input type="datetime-local" value={edit.start}
                onChange={e=>setEdit(current=>current?{...current,start:e.target.value}:null)}
                className="mt-2 w-full border border-border bg-background p-2"/>
            </label>
            <label className="text-sm font-medium">New end
              <input type="datetime-local" value={edit.end}
                onChange={e=>setEdit(current=>current?{...current,end:e.target.value}:null)}
                className="mt-2 w-full border border-border bg-background p-2"/>
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="button" size="sm" disabled={!!busy}
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
    {notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
  </section>;
}
