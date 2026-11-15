import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  attestClassroomParticipation, getClassroomAttendanceRoster,
} from "@/modules/learning/classroom-attendance.functions";

type Method="in_person_roll_call"|"remote_live_check";
type Status="present"|"absent"|"unknown";

/** The roster is deliberately private to the authorized Site facilitator.
 * No-device fallback creates NO phantom device, pairing or Course attempt. */
export function ClassroomAttendancePanel({facilitatedSessionId}:{
  facilitatedSessionId:string;
}){
  const roster=useQuery({
    queryKey:["classroom-attendance",facilitatedSessionId],
    queryFn:()=>getClassroomAttendanceRoster({data:{facilitatedSessionId}}),
    staleTime:0,refetchInterval:15_000,retry:false,
  });
  const [method,setMethod]=useState<Method>("in_person_roll_call");
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const retries=useRef<Record<string,string>>({});
  async function attest(courseAttemptId:string,status:Status){
    if(busy)return;
    const note=notes[courseAttemptId]?.trim()||null;
    const key=[courseAttemptId,status,method,note||""].join(":");
    const requestId=retries.current[key]??crypto.randomUUID();
    retries.current[key]=requestId;
    setBusy(courseAttemptId);setError("");setMessage("");
    try {
      const result=await attestClassroomParticipation({data:{
        facilitatedSessionId,courseAttemptId,requestId,
        status,method,evidenceNote:note,
      }});
      delete retries.current[key];
      await roster.refetch();
      setMessage(result.noDeviceEvidence?
        "Direct facilitator verification recorded without adding a device pairing.":
        "Facilitator verification recorded independently of device activity.");
    }catch{
      setError("Attendance verification was not saved. For a no-device learner or a correction, include a direct-observation explanation of at least 15 characters.");
    }finally{setBusy("");}
  }
  return <section className="mt-4 border border-border bg-card p-4"
    aria-label="Verified room participation">
    <h4 className="font-serif text-lg font-semibold">Verify session participation</h4>
    <p className="mt-2 text-xs text-muted-foreground">
      Choose an existing registered learner at this exact Site. A phone is not
      required. Every assertion or correction is retained with the facilitator's
      identity. This is operational verification, not official academic roll-call.
    </p>
    <label className="mt-4 block text-sm font-medium">How will you verify?
      <select className="mt-2 w-full min-h-10 border border-border bg-background p-2"
        value={method} onChange={e=>setMethod(e.target.value as Method)}>
        <option value="in_person_roll_call">Direct in-person roll call</option>
        <option value="remote_live_check">Direct remote-live check</option>
      </select>
    </label>
    {roster.isPending&&<p role="status" className="mt-3 text-sm">Checking current Site roster…</p>}
    {roster.isError&&<p role="alert" className="mt-3 text-sm text-destructive">
      Registered learners could not be verified. No attendance data is available.
    </p>}
    {roster.isSuccess&&roster.data.partial&&<p role="status" className="mt-3 text-sm">
      Roster or historical attendance exceeds the display limit; verify this with an administrator before using the totals.
    </p>}
    {roster.isSuccess&&roster.data.members.length===0&&<p className="mt-3 text-sm">
      There are no currently eligible registered Course attempts at this Site.
    </p>}
    {roster.isSuccess&&roster.data.members.map(person=><article
      key={person.courseAttemptId} className="mt-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{person.displayName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {person.source==="noncredit"?"Noncredit registration":"School enrollment"}
            {" · "}{person.pairedDevice?"Device currently paired":"No current device pairing"}
            {" · "}Verified: {person.latestStatus}
          </p>
          {person.lastAssertedAt&&<p className="mt-1 text-xs text-muted-foreground">
            Last assertion {new Date(person.lastAssertedAt).toLocaleString()}
          </p>}
        </div>
      </div>
      <label className="mt-3 block text-xs font-medium">
        Verification note (required for no-device learners and changes)
        <textarea className="mt-1 w-full border border-border bg-background p-2 text-sm"
          rows={2} maxLength={250}
          value={notes[person.courseAttemptId]??""}
          placeholder="I spoke directly with the learner during the session…"
          onChange={e=>setNotes(old=>({...old,[person.courseAttemptId]:e.target.value}))}/>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["present","absent","unknown"] as const).map(status=>
          <Button type="button" size="sm" key={status}
            variant={person.latestStatus===status?"default":"outline"}
            disabled={!!busy||!roster.data.attestationsOpen}
            onClick={()=>void attest(person.courseAttemptId,status)}>
            {busy===person.courseAttemptId?"Saving…":
              status==="present"?"Verified present":status==="absent"?"Verified absent":"Not verified"}
          </Button>)}
      </div>
    </article>)}
    {roster.isSuccess&&!roster.data.attestationsOpen&&<p role="status"
      className="mt-4 text-sm">The 48-hour correction window has closed.</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
