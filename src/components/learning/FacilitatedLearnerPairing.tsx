import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { pairWithFacilitatedRoom, leaveFacilitatedRoom, getLearnerFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryState, WorkspaceNotice } from "@/components/workspace";

type PairingStatus = Awaited<ReturnType<typeof getLearnerFacilitatedRoom>>;

/**
 * A learner pairs their own canonical Course attempt to a facilitator's room.
 * Pairing alone never constitutes attendance, watched media or completion.
 */
export function FacilitatedLearnerPairing({courseAttemptId}:{courseAttemptId:string}) {
  const queryClient=useQueryClient();
  const [code,setCode] = useState("");
  const [status,setStatus] = useState<PairingStatus|null>(null);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState("");
  const [messageTone,setMessageTone] = useState<"success"|"danger">("success");
  const [observationUnavailable,setObservationUnavailable] = useState(false);
  const [available,setAvailable] = useState(false);
  const [loadError,setLoadError] = useState(false);
  async function refresh() {
    const result = await getLearnerFacilitatedRoom({data:{courseAttemptId}});
    setStatus(result);setAvailable(true);setLoadError(false);setObservationUnavailable(false);
  }
  useEffect(()=>{
    let live=true;
    setStatus(null);setAvailable(false);setLoadError(false);setMessage("");setCode("");
    setMessageTone("success");setObservationUnavailable(false);
    void getLearnerFacilitatedRoom({data:{courseAttemptId}})
      .then(result=>{if(live){setStatus(result);setAvailable(true);setObservationUnavailable(false);}})
      .catch(()=>{if(live)setLoadError(true);});
    return ()=>{live=false;};
  },[courseAttemptId]);
  useEffect(()=>{
    if(!available || !status?.rooms.length)return;
    let live=true;
    const timer=setInterval(()=>{
      void getLearnerFacilitatedRoom({data:{courseAttemptId}})
        .then(result=>{if(live){setStatus(result);setObservationUnavailable(false);}})
        .catch(()=>{if(live)setObservationUnavailable(true);});
    },15000);
    return ()=>{live=false;clearInterval(timer);};
  },[available,courseAttemptId,status?.rooms.length]);

  async function join() {
    if(pending || !code.trim())return;
    setPending(true);setMessage("");
    try {
      await pairWithFacilitatedRoom({data:{courseAttemptId,pairingCode:code.trim()}});
      setCode("");
      setMessageTone("success");
      setMessage("Your device is paired with the facilitator's room.");
    } catch {
      setMessageTone("danger");
      setMessage("Unable to pair. Check the code, room expiry, or current course registration.");
    } finally {setPending(false);}
  }
  async function leave(roomId:string) {
    if(pending)return;
    setPending(true);setMessage("");
    try {
      await leaveFacilitatedRoom({data:{courseAttemptId,facilitatedSessionId:roomId}});
      setMessageTone("success");
      setMessage("You left the facilitator's room.");
    } catch {
      setMessageTone("danger");
      setMessage("Unable to leave the room. Try again.");
    } finally {setPending(false);}
  }
  if(!available)return <section aria-label="Facilitator room pairing" className="border border-border bg-card p-4">
    <QueryState
      loading={!loadError?"Checking facilitator room availability…":undefined}
      error={loadError?"Facilitator room availability could not be verified. Your course enrollment has not changed.":undefined}
      onRetry={()=>void refresh().catch(()=>setLoadError(true))}/>
  </section>;
  return <section aria-label="Facilitator room pairing" className="border border-border bg-card p-4">
    <h3 className="font-serif text-lg font-semibold">Join a facilitator-led session</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      If your group is watching one recording together, pair your own device to follow the session.
      You remain enrolled in the same course with the same progress and assessments.
    </p>
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();void join();}}>
      <Label htmlFor="facilitated-pair-code" className="sr-only">Facilitator pairing code</Label>
      <Input id="facilitated-pair-code" aria-label="Facilitator pairing code"
        autoComplete="off" maxLength={11} placeholder="XXXXX-XXXXX"
        className="min-h-10 max-w-xs uppercase"
        value={code} onChange={event=>setCode(event.target.value)}/>
      <Button loading={pending} disabled={!code.trim()} type="submit" size="sm">Pair device</Button>
      <Button disabled={pending} type="button" variant="outline" size="sm"
        onClick={()=>void refresh().catch(()=>{setMessageTone("danger");setMessage("Unable to refresh session status.");})}>Refresh</Button>
    </form>
    {message&&<WorkspaceNotice tone={messageTone} className="mt-3">{message}</WorkspaceNotice>}
    {observationUnavailable&&<WorkspaceNotice tone="attention" className="mt-3">
      <span>The latest room state could not be verified. Previous pairing details may be outdated.</span>
      <Button type="button" variant="outline" size="sm" className="ml-3"
        onClick={()=>void refresh().catch(()=>setObservationUnavailable(true))}>Retry room status</Button>
    </WorkspaceNotice>}
    {status?.rooms.map(room=><div key={room.facilitatedSessionId} className="mt-3 border-t border-border pt-3">
      <p className="font-medium text-sm">Connected to a facilitator's room</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {room.latestPlayback ?
          "Facilitator playback: " + room.latestPlayback.kind.replaceAll("_"," ") :
          "Waiting for the facilitator to select content."}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Room connection is not attendance or proof of video viewing.
      </p>
      <Button className="mt-2" size="sm" variant="outline" disabled={pending}
        onClick={()=>void leave(room.facilitatedSessionId)}>Leave room</Button>
    </div>)}
  </section>;
}
