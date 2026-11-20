import { useState } from "react";
import { useLearnerClassroomRooms } from "@/components/learning/useLearnerClassroomRooms";
import { pairWithFacilitatedRoom, leaveFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryState, WorkspaceNotice } from "@/components/workspace";


/**
 * A learner pairs their own canonical Course attempt to a facilitator's room.
 * Pairing alone never constitutes attendance, watched media or completion.
 */
export function FacilitatedLearnerPairing({courseAttemptId}:{courseAttemptId:string}) {
  const rooms=useLearnerClassroomRooms(courseAttemptId);
  const [code,setCode] = useState("");
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState("");
  const [messageTone,setMessageTone] = useState<"success"|"danger">("success");
  const [observationUnavailable,setObservationUnavailable] = useState(false);
  async function refresh() {
    const result=await rooms.refetch();
    if(result.isError)throw result.error;
    if(!result.isSuccess)throw new Error("Room status unavailable");
    setObservationUnavailable(false);
  }

  async function join() {
    if(pending || !code.trim())return;
    setPending(true);setMessage("");
    try {
      await pairWithFacilitatedRoom({data:{courseAttemptId,pairingCode:code.trim()}});
      setCode("");
      setMessageTone("success");
      setMessage("Your device is paired with the facilitator's room.");
      void refresh().catch(()=>setObservationUnavailable(true));
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
      void refresh().catch(()=>setObservationUnavailable(true));
    } catch {
      setMessageTone("danger");
      setMessage("Unable to leave the room. Try again.");
    } finally {setPending(false);}
  }
  if(rooms.isPending)return <section aria-label="Facilitator room pairing" className="border border-border bg-card p-4">
    <QueryState loading="Checking facilitator room availability…"/>
  </section>;
  if(rooms.isError)return <section aria-label="Facilitator room pairing" className="border border-border bg-card p-4">
    <QueryState error="Classroom access could not be verified. Controls are unavailable until your registration and room permissions are rechecked."
      onRetry={()=>void refresh().catch(()=>setObservationUnavailable(true))}/>
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
    {rooms.isFetching&&<p role="status" className="mt-2 text-xs text-muted-foreground">Checking current room connection…</p>}
    {!rooms.data.rooms.length&&<p role="status" className="mt-2 text-sm text-muted-foreground">Not connected to an active classroom. Enter a current code to join.</p>}
    {message&&<WorkspaceNotice tone={messageTone} className="mt-3">{message}</WorkspaceNotice>}
    {observationUnavailable&&<WorkspaceNotice tone="attention" className="mt-3">
      <span>The latest room state could not be verified. Previous pairing details may be outdated.</span>
      <Button type="button" variant="outline" size="sm" className="ml-3"
        onClick={()=>void refresh().catch(()=>setObservationUnavailable(true))}>Retry room status</Button>
    </WorkspaceNotice>}
    {rooms.data.rooms.map(room=><div key={room.facilitatedSessionId} className="mt-3 border-t border-border pt-3">
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
