import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ClassroomFacilitatorConsole } from "@/components/learning/ClassroomFacilitatorConsole";
import { ClassroomAttendancePanel } from "@/components/learning/ClassroomAttendancePanel";
import { getNativeClassSessionAgenda } from "@/modules/classes/native-class-session-agenda.functions";
import {
  endFacilitatedLearningRoom, renewFacilitatedLearningPairing,
} from "@/modules/learning/facilitated-learning.functions";

/** One Class Session supports three presentation device configurations.
 * Private moderation, identities, answers and roll-call are NEVER rendered
 * by the dedicated audience presentation route. A distributed display still
 * requires its own currently authorized facilitator login; QR isn't access.
 */
type Layout="single"|"dual"|"distributed";
export function NativeClassroomHostPanel({
  roomId,classId,classSessionId,canReviewAttendance,onClosed,initialCode=null,initialExpiry=null,
}:{
  roomId:string;classId:string;classSessionId:string;
  canReviewAttendance:boolean;
  onClosed:()=>Promise<unknown>;
  initialCode?:string|null;
  initialExpiry?:string|null;
}){
  const planned=useQuery({
    queryKey:["native-classroom-agenda",classId,classSessionId],
    queryFn:()=>getNativeClassSessionAgenda({data:{classId,classSessionId}}),
    retry:false,staleTime:30000,
  });
  // Only order the existing rights-checked room catalog; never pass an agenda
  // reference directly to the projector as if it were a playback authorization.
  const preferredLessonIds=planned.data?.items
    .filter(item=>item.kind==="watch"||item.kind==="study")
    .map(item=>item.referenceId)??[];
  const [layout,setLayout]=useState<Layout>("dual");
  const [joinCode,setJoinCode]=useState(initialCode);
  const [expiresAt,setExpiresAt]=useState(initialExpiry);
  const [busy,setBusy]=useState(false);
  const [ending,setEnding]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const fragment=joinCode&&expiresAt?
    "pair="+encodeURIComponent(joinCode)+"&expires="+encodeURIComponent(expiresAt):
    undefined;

  async function renew(){
    if(busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const data=await renewFacilitatedLearningPairing({data:{facilitatedSessionId:roomId}});
      setJoinCode(data.pairingCode);setExpiresAt(data.pairingExpiresAt);
      setMessage("Short-lived join code renewed. Opening the audience display will show its QR.");
    }catch{
      setError("Pairing renewal refused. Check your active Class assignment and session.");
    }finally{setBusy(false)}
  }
  async function end(){
    if(!ending||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      await endFacilitatedLearningRoom({data:{facilitatedSessionId:roomId}});
      setJoinCode(null);setExpiresAt(null);setEnding(false);
      await onClosed();
      setMessage("Session ended. Learner responses and verified attendance remain separate historical evidence.");
    }catch{
      setError("Unable to end the Class Session. Recheck your current facilitator authority.");
    }finally{setBusy(false)}
  }
  return <div className="mt-6 space-y-4 border-t border-border pt-5"
    aria-label="Private Class Session controls">
    <section className="border border-border bg-card p-4">
      <h3 className="font-serif text-xl font-semibold">Presentation setup</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Everyone watches the same authorized lesson. Every learner responds
        privately through their own authenticated Course Attempt.
      </p>
      <fieldset className="mt-4 grid gap-2 sm:grid-cols-3">
        <legend className="text-sm font-semibold">Classroom devices</legend>
        {([
          ["single","One laptop","Show the public display on this laptop. Hide the facilitator console first."],
          ["dual","Laptop + television","Keep private controls on the laptop and open the public display on the second screen."],
          ["distributed","TV + tablet + phones","The TV needs its own authorized presenter session; the tablet retains private controls."],
        ] as const).map(([value,title,description])=>
          <label key={value} className={"block border p-3 text-sm cursor-pointer "+
            (layout===value?"border-primary bg-primary/5":"border-border")}>
            <input type="radio" className="mr-2" checked={layout===value}
              onChange={()=>setLayout(value)} name={"classroom-layout-"+roomId}/>
            <strong>{title}</strong>
            <span className="mt-2 block text-xs text-muted-foreground">{description}</span>
          </label>
        )}
      </fieldset>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button asChild variant="outline">
          <Link to="/classroom/$sessionId/presentation"
            params={{sessionId:roomId}}
            search={{layout:layout==="single"?"single":"presentation"}}
            target={layout==="single"?"_self":"_blank"}
            rel="noopener noreferrer"
            hash={fragment}>
            {layout==="single"?"Switch to audience display":"Open audience display"}
          </Link>
        </Button>
        <Button variant="outline" disabled={busy} onClick={()=>void renew()}>
          {busy?"Checking…":"Renew join QR"}
        </Button>
      </div>
      {joinCode&&expiresAt&&<p className="mt-3 text-sm">
        <strong>Join code:</strong> <span className="font-mono">{joinCode}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          Expires {new Date(expiresAt).toLocaleTimeString()}
        </span>
      </p>}
      {layout==="distributed"&&<p className="mt-3 text-xs text-muted-foreground">
        Do not share a staff password or private dashboard on a public TV.
        Independent, untrusted-display handoff is not enabled in this pilot.
        Use an authenticated presentation browser or a private laptop casting the public-only page.
      </p>}
      <p className="mt-3 text-xs text-muted-foreground">
        The presentation page excludes learner names, response totals,
        attendance and moderation controls. Never mirror this private console.
      </p>
    </section>
    {planned.data?.items.length?<p className="text-xs text-muted-foreground">
      Approved recordings for this Session are listed first in the projector controls.
      A Session agenda never grants extra playback or academic privileges.
    </p>:null}
    <ClassroomFacilitatorConsole facilitatedSessionId={roomId}
      preferredLessonIds={preferredLessonIds}/>
    {canReviewAttendance?<ClassroomAttendancePanel facilitatedSessionId={roomId}/>:
      <p className="border border-border bg-card p-4 text-sm text-muted-foreground">
        Attendance evidence requires a separately authorized Class roster reader.
        Pairing and activity responses must not silently mark participants present.
      </p>}
    <section className="border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Finish Class Session</h3>
      <p className="mt-2 text-xs text-muted-foreground">
        Ending closes further joining, playback commands and response submissions.
        Existing evidence and corrections are preserved under their policies.
      </p>
      {!ending?<Button variant="outline" className="mt-3"
          onClick={()=>setEnding(true)}>End Session…</Button>:
        <div className="mt-3 flex flex-wrap gap-3">
          <Button disabled={busy} onClick={()=>void end()}>
            {busy?"Ending…":"Confirm end Session"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={()=>setEnding(false)}>
            Keep Session open
          </Button>
        </div>}
      {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
      {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
  </div>;
}
