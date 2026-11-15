import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  getClassroomHostActivity, releaseClassroomActivity, closeClassroomActivity,
  attestClassroomAttendance, attachClassroomSurvey,
} from "@/modules/learning/classroom-evidence.functions";

/** Private host controls: never display learners' individual answers on the projector. */
export function ClassroomFacilitatorConsole({ facilitatedSessionId }: { facilitatedSessionId:string }) {
  const queryClient=useQueryClient();
  const [prompt,setPrompt]=useState("");
  const [type,setType]=useState<"single_choice"|"text">("single_choice");
  const [options,setOptions]=useState("Yes\nNo");
  const [busy,setBusy]=useState(false);
  const [attendanceMethod,setAttendanceMethod]=useState<"in_person_roll_call"|"remote_live_check">("in_person_roll_call");
  const [surveyId,setSurveyId]=useState("");
  const [surveyStage,setSurveyStage]=useState<"entry"|"pulse"|"exit">("exit");
  const [error,setError]=useState("");
  const state=useQuery({
    queryKey:["facilitated-host-activity",facilitatedSessionId],
    queryFn:()=>getClassroomHostActivity({data:{facilitatedSessionId}}),
    refetchInterval:8000,retry:false,
  });
  async function run(action:()=>Promise<unknown>){
    if(busy)return;
    setBusy(true);setError("");
    try{
      await action();
      await queryClient.invalidateQueries({queryKey:["facilitated-host-activity",facilitatedSessionId]});
    }catch{setError("Classroom action was not saved. Check session and Site permissions.");}
    finally{setBusy(false);}
  }
  const choices=options.split("\n").map(v=>v.trim()).filter(Boolean);
  return <section className="mt-4 border-t border-border pt-4" aria-label="Classroom facilitator controls">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="font-semibold">Classroom controls</h4>
      <Button size="sm" asChild variant="outline">
        <Link to="/classroom/$sessionId/presentation" params={{sessionId:facilitatedSessionId}}
          target="_blank">Open presentation display</Link>
      </Button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      Keep this console private. The presentation is a separate, projector-friendly screen.
    </p>
    {state.isError&&<p role="alert" className="mt-3 text-sm">Room controls unavailable.</p>}
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <p className="border border-border p-3 text-sm">Paired attempts: {state.data?.pairedCount??"…"}</p>
      <p className="border border-border p-3 text-sm">Active device estimate: {state.data?.activeDevicesEstimate??"…"}</p>
      <p className="border border-border p-3 text-sm">Facilitator-attested present: {state.data?.attestedPresent??"…"}</p>
    </div>
    <form className="mt-4 space-y-3 border border-border p-4"
      onSubmit={event=>{event.preventDefault();void run(async()=>{
        await releaseClassroomActivity({data:{
          facilitatedSessionId,requestId:crypto.randomUUID(),lessonId:null,
          prompt:prompt.trim(),answerType:type,choices:type==="single_choice"?choices:[],
        }});
        setPrompt("");
      });}}>
      <h5 className="text-sm font-semibold">Release a formative activity</h5>
      <label className="block text-sm">
        Question or prompt
        <textarea required minLength={5} maxLength={1000} value={prompt}
          onChange={e=>setPrompt(e.target.value)} rows={2}
          className="mt-1 w-full border border-border bg-background p-3"/>
      </label>
      <label className="block text-sm">
        Response format
        <select value={type} onChange={e=>setType(e.target.value as typeof type)}
          className="mt-1 w-full border border-border bg-background p-2">
          <option value="single_choice">Multiple choice</option>
          <option value="text">Short text</option>
        </select>
      </label>
      {type==="single_choice"&&<label className="block text-sm">
        Choices, one per line (2 to 8)
        <textarea value={options} onChange={e=>setOptions(e.target.value)}
          rows={3} className="mt-1 w-full border border-border bg-background p-3"/>
      </label>}
      <Button disabled={busy||prompt.trim().length<5||
        (type==="single_choice"&&(choices.length<2||choices.length>8))}>
        Release to paired learners
      </Button>
      <p className="text-xs text-muted-foreground">
        Responses are formative and do not alter official assignments or grades.
      </p>
    </form>
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <section className="mt-4" aria-label="Released activities">
      <h5 className="text-sm font-semibold">Activity releases</h5>
      {state.data?.releases.map(activity=><article key={activity.id}
        className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-border p-3">
        <div className="min-w-0">
          <p className="text-sm">{activity.prompt}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {activity.respondingLearners} learners responded · {activity.responseEvents} response records
            {activity.closed?" · Closed":" · Open"}
          </p>
        </div>
        {!activity.closed&&<Button size="sm" variant="outline" disabled={busy}
          onClick={()=>void run(()=>closeClassroomActivity({data:{
            facilitatedSessionId,activityReleaseId:activity.id,
          })))}>Close</Button>}
      </article>)}
    </section>
    <section className="mt-5" aria-label="Attendance attestations">
      <h5 className="text-sm font-semibold">Verify attendance separately</h5>
      <p className="mt-1 text-xs text-muted-foreground">
        Match each learner against your authorized registration roster before attesting. A paired
        device or heartbeat is not evidence of physical presence. These are room attestations,
        not changes to official school attendance.
      </p>
      <label className="mt-3 block text-sm">How attendance was checked
        <select className="mt-1 block border border-border bg-background px-3 py-2"
          value={attendanceMethod} onChange={event=>setAttendanceMethod(
            event.target.value as typeof attendanceMethod)}>
          <option value="in_person_roll_call">In-person roll call</option>
          <option value="remote_live_check">Remote live check</option>
        </select>
      </label>
      {state.data?.participants.map(person=><div key={person.courseAttemptId}
        className="mt-2 flex flex-wrap items-center justify-between gap-2 border border-border p-3">
        <div>
          <p className="text-sm font-medium">{person.displayName}</p>
          <p className="text-xs text-muted-foreground">
            Attempt {person.courseAttemptId.slice(0,8)} · {person.deviceActive?"Device seen recently":"Not recently observed"}
            {" · "}Attendance: {person.attendance}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>
            attestClassroomAttendance({data:{
              facilitatedSessionId,courseAttemptId:person.courseAttemptId,requestId:crypto.randomUUID(),
              status:"present",method:attendanceMethod,evidenceNote:null,
            }}))}>Attest present</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>void run(()=>
            attestClassroomAttendance({data:{
              facilitatedSessionId,courseAttemptId:person.courseAttemptId,requestId:crypto.randomUUID(),
              status:"absent",method:attendanceMethod,evidenceNote:null,
            }}))}>Absent</Button>
        </div>
      </div>)}
      {!state.data?.participants.length&&<p className="mt-2 text-xs text-muted-foreground">
        No paired learners yet.</p>}
    </section>
    <form className="mt-5 space-y-3 border-t border-border pt-4" onSubmit={event=>{
      event.preventDefault();
      void run(async()=>{
        await attachClassroomSurvey({data:{
          facilitatedSessionId,surveyCampaignId:surveyId,stage:surveyStage,
        }});
        setSurveyId("");
      });
    }}>
      <h5 className="text-sm font-semibold">Link an approved pilot survey</h5>
      <p className="text-xs text-muted-foreground">
        Link an existing approved survey campaign scoped to this host organization and Deployment.
        Questions, consent and confidential responses remain governed by the survey system.
      </p>
      <label className="block text-sm">Survey campaign ID
        <input className="mt-1 w-full border border-border bg-background p-2"
          value={surveyId} onChange={e=>setSurveyId(e.target.value.trim())}
          placeholder="UUID" required/>
      </label>
      <label className="block text-sm">Pilot stage
        <select className="mt-1 w-full border border-border bg-background p-2"
          value={surveyStage} onChange={e=>setSurveyStage(e.target.value as typeof surveyStage)}>
          <option value="entry">Entry</option>
          <option value="pulse">Mid-course pulse</option>
          <option value="exit">Exit</option>
        </select>
      </label>
      <Button type="submit" variant="outline" disabled={busy||!/^[0-9a-f-]{36}$/i.test(surveyId)}>
        Link survey evidence
      </Button>
    </form>
  </section>;
}
