import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { FacilitatedRoomPlayer } from "@/components/learning/FacilitatedRoomPlayer";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import {
  endFacilitatedLearningRoom, getFacilitatedHostWorkspace,
  renewFacilitatedLearningPairing, startFacilitatedLearningRoom,
} from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/canonical/lab/facilitated")({
  loader: () => safeLoader(() => getFacilitatedHostWorkspace())(),
  component: FacilitatedLearningLabPage,
});

function FacilitatedLearningLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError
    title="Facilitated learning" message={result.message}/>;
  return <FacilitatedLabContent data={result.data}/>;
}

type Workspace = Awaited<ReturnType<typeof getFacilitatedHostWorkspace>>;
function effectiveRoomState(room: Workspace["rooms"][number], nowMs: number) {
  return room.state === "live" && Date.parse(room.expiresAt) <= nowMs
    ? "expired" : room.state;
}
function FacilitatedLabContent({data}:{data:Workspace}) {
  const router=useRouter();
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const [selected,setSelected]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [code,setCode]=useState<{
    roomId:string;code:string;expiresAt:string;
  }|null>(null);
  const available=data.choices.find(choice=>selected===
    choice.deploymentId+":"+choice.courseVersionId+":"+choice.siteId);
  async function run(action:()=>Promise<void>) {
    if(busy)return;
    setBusy(true);setMessage("");
    try {
      await action();
      await router.invalidate();
    } catch {
      setMessage("The requested room action was not saved. Check your Site authority and active deployment.");
    } finally {
      setBusy(false);
    }
  }
  return <WorkspaceShell width="wide" eyebrow="Canonical · Learning operations"
    title="Facilitated learning" subtitle="One facilitator controls the room, while each enrolled learner may pair their own device. Pairing is not attendance or academic credit.">
    <CapabilityLabNav current="facilitated"/>
    <section className="mt-6 border border-border bg-card p-5" aria-label="Start a shared-screen learning room">
      <h2 className="font-serif text-xl font-semibold">Start a room</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Select a course available through a current authorized deployment at your Site.
        No new school enrollment or classroom Section is created.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="min-w-72 flex-1 text-sm font-medium">
          Deployment and course
          <select className="mt-2 min-h-10 w-full border border-border bg-background px-3 py-2"
            value={selected} onChange={event=>setSelected(event.target.value)}>
            <option value="">Choose an authorized course</option>
            {data.choices.map(choice=><option
              key={choice.deploymentId+":"+choice.courseVersionId+":"+choice.siteId}
              value={choice.deploymentId+":"+choice.courseVersionId+":"+choice.siteId}>
              {choice.deploymentName} · {choice.courseTitle} · Site {choice.siteId.slice(0,8)}
            </option>)}
          </select>
        </label>
        <Button disabled={busy||!available} type="button" onClick={()=>void run(async()=>{
          if(!available)return;
          const created=await startFacilitatedLearningRoom({data:{
            deploymentId:available.deploymentId,courseVersionId:available.courseVersionId,
            siteId:available.siteId,
          }});
          setCode({roomId:created.facilitatedSessionId,
            code:created.pairingCode,expiresAt:created.pairingExpiresAt});
        })}>Start facilitator room</Button>
      </div>
      {!data.choices.length&&<p role="status" className="mt-3 text-sm text-muted-foreground">
        No active published courses are currently available to this Site. Check deployment
        and learner participation authority before starting a room.
      </p>}
    </section>
    {message&&<p role="alert" className="mt-4 border border-border p-4 text-sm">{message}</p>}
    {code && Date.parse(code.expiresAt) > clockMs &&
      data.rooms.some(room => room.id === code.roomId &&
        effectiveRoomState(room, clockMs) === "live") &&
      <section className="mt-5 border border-border bg-card p-5" aria-label="Current device pairing code">
      <p className="text-sm font-semibold">Share this code with enrolled learners in your room</p>
      <p className="mt-2 font-mono text-3xl tracking-widest" aria-live="polite">{code.code}</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Valid until {new Date(code.expiresAt).toLocaleTimeString()}.
        Learners can sign in at <a href="/join" className="underline">/join</a> and
        select their existing course. Do not treat device pairing as headcount.
      </p>
    </section>}
    <section className="mt-7" aria-label="Facilitated rooms">
      <h2 className="font-serif text-xl font-semibold">Your rooms</h2>
      <div className="mt-3 grid gap-4">
        {data.rooms.map(room => {
          const roomState = effectiveRoomState(room, clockMs);
          return <article key={room.id} className="border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                {data.choices.find(choice=>
                  choice.deploymentId===room.deploymentId&&
                  choice.courseVersionId===room.courseVersionId)?.courseTitle??"Course room"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Started {new Date(room.startedAt).toLocaleString()}
              </p>
            </div>
            <span className="border border-border px-3 py-1 text-sm">
              {roomState==="ended"?"Ended":roomState==="expired"?"Expired":"Live"}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Learners with paired devices</dt>
              <dd className="mt-1 font-serif text-2xl font-semibold">{room.pairedLearners}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Latest playback control</dt>
              <dd className="mt-1 text-sm font-medium">
                {room.latestPlayback?.kind??"Not recorded"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Pairing window</dt>
              <dd className="mt-1 text-sm font-medium">
                {roomState==="live"?
                  (new Date(room.pairingExpiresAt)>new Date()?"Open":"Expired"):
                  "Closed"}
              </dd>
            </div>
          </dl>
          {roomState==="live"&&<FacilitatedRoomPlayer facilitatedSessionId={room.id}/>}
          {roomState==="live"&&<div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={()=>void run(async()=>{
                const renewed=await renewFacilitatedLearningPairing({
                  data:{facilitatedSessionId:room.id},
                });
                setCode({roomId:room.id,code:renewed.pairingCode,
                  expiresAt:renewed.pairingExpiresAt});
              })}>Generate new pairing code</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy}
              onClick={()=>{if(window.confirm("End this facilitated room?"))void run(async()=>{
                await endFacilitatedLearningRoom({data:{facilitatedSessionId:room.id}});
                if(code?.roomId===room.id)setCode(null);
              });}}>End room</Button>
          </div>}
        </article>;
        })}
        {!data.rooms.length&&<p className="border border-border p-5 text-sm text-muted-foreground">
          No facilitated learning rooms have been started under your current Site permissions.
        </p>}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Session and pairing records are participation evidence only. Actual recorded-media
        delivery remains subject to the published track's content-rights policy.
      </p>
    </section>
  </WorkspaceShell>;
}
