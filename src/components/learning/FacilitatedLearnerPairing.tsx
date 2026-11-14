import { useEffect, useState } from "react";
import { pairWithFacilitatedRoom, leaveFacilitatedRoom, getLearnerFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";
import { Button } from "@/components/ui/button";

type PairingStatus = Awaited<ReturnType<typeof getLearnerFacilitatedRoom>>;

/**
 * A learner pairs their own canonical Course attempt to a facilitator's room.
 * Pairing alone never constitutes attendance, watched media or completion.
 */
export function FacilitatedLearnerPairing({courseAttemptId}:{courseAttemptId:string}) {
  const [code,setCode] = useState("");
  const [status,setStatus] = useState<PairingStatus|null>(null);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState("");
  const [available,setAvailable] = useState(false);
  async function refresh() {
    const result = await getLearnerFacilitatedRoom({data:{courseAttemptId}});
    setStatus(result);setAvailable(true);
  }
  useEffect(()=>{
    let live=true;
    setStatus(null);setAvailable(false);setMessage("");setCode("");
    void getLearnerFacilitatedRoom({data:{courseAttemptId}})
      .then(result=>{if(live){setStatus(result);setAvailable(true);}})
      .catch(()=>{/* Guardian or unavailable service: no learner-pairing control. */});
    return ()=>{live=false;};
  },[courseAttemptId]);
  useEffect(()=>{
    if(!available || !status?.rooms.length)return;
    let live=true;
    const timer=setInterval(()=>{
      void getLearnerFacilitatedRoom({data:{courseAttemptId}})
        .then(result=>{if(live)setStatus(result);})
        .catch(()=>{/* Observation refresh is nonblocking. */});
    },15000);
    return ()=>{live=false;clearInterval(timer);};
  },[available,courseAttemptId,status?.rooms.length]);

  async function join() {
    if(pending || !code.trim())return;
    setPending(true);setMessage("");
    try {
      await pairWithFacilitatedRoom({data:{courseAttemptId,pairingCode:code.trim()}});
      setCode("");
      await refresh();
      setMessage("Your device is paired with the facilitator's room.");
    } catch {
      setMessage("Unable to pair. Check the code, room expiry, or current course registration.");
    } finally {setPending(false);}
  }
  async function leave(roomId:string) {
    if(pending)return;
    setPending(true);setMessage("");
    try {
      await leaveFacilitatedRoom({data:{courseAttemptId,facilitatedSessionId:roomId}});
      await refresh();
      setMessage("You left the facilitator's room.");
    } catch {
      setMessage("Unable to leave the room. Try again.");
    } finally {setPending(false);}
  }
  if(!available)return null;
  return <section aria-label="Facilitator room pairing" className="border border-border bg-card p-4">
    <h3 className="font-serif text-lg font-semibold">Join a facilitator-led session</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      If your group is watching one recording together, pair your own device to follow the session.
      You remain enrolled in the same course with the same progress and assessments.
    </p>
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={event=>{event.preventDefault();void join();}}>
      <label htmlFor="facilitated-pair-code" className="sr-only">Facilitator pairing code</label>
      <input id="facilitated-pair-code" aria-label="Facilitator pairing code"
        autoComplete="off" maxLength={11} placeholder="XXXXX-XXXXX"
        className="min-h-10 border border-border bg-background px-3 py-2 text-sm uppercase"
        value={code} onChange={event=>setCode(event.target.value)}/>
      <Button disabled={pending || !code.trim()} type="submit" size="sm">Pair device</Button>
      <Button disabled={pending} type="button" variant="outline" size="sm"
        onClick={()=>void refresh().catch(()=>setMessage("Unable to refresh session status."))}>Refresh</Button>
    </form>
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
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
