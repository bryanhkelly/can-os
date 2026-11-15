import { useEffect, useState } from "react";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { Button } from "@/components/ui/button";
import {
  getFacilitatedRoomMedia, getFacilitatedRoomMediaAccess, recordFacilitatedPlayback,
} from "@/modules/learning/facilitated-learning.functions";

type RoomMedia = Awaited<ReturnType<typeof getFacilitatedRoomMedia>>;
type Observation = "video_opened" | "video_played" | "video_paused" | "video_ended";
const stateFor: Record<Observation,"opened"|"played"|"paused"|"ended"> = {
  video_opened:"opened",video_played:"played",video_paused:"paused",video_ended:"ended",
};

/**
 * Only the approved facilitator controls playback on the shared screen.
 * Content rights are checked by the server for the list AND each signed URL.
 * Paired learners receive the status through their separately scoped record.
 */
export function FacilitatedRoomPlayer({ facilitatedSessionId }: {
  facilitatedSessionId:string;
}) {
  const [catalog,setCatalog]=useState<RoomMedia|null>(null);
  const [selected,setSelected]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setCatalog(null);setSelected("");setError("");setLoading(true);
    void getFacilitatedRoomMedia({data:{facilitatedSessionId}})
      .then(result=>{
        if(!active)return;
        setCatalog(result);
        setSelected(result.media[0] ?
          result.media[0].lessonId+":"+result.media[0].assetVersionId : "");
      }).catch(()=>{
        if(active)setError("Approved recorded media could not be loaded for this room.");
      }).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[facilitatedSessionId]);
  const current=catalog?.media.find(item=>
    item.lessonId+":"+item.assetVersionId===selected)??null;
  const onPlaybackEvent=(kind:Observation,assetVersionId:string)=>{
    if(!current || current.assetVersionId!==assetVersionId)return;
    void recordFacilitatedPlayback({data:{
      facilitatedSessionId,requestId:crypto.randomUUID(),
      lessonId:current.lessonId,assetVersionId,
      kind:stateFor[kind],positionSeconds:null,
    }}).catch(()=>setError(
      "Could not record the facilitator playback action. Recheck session rights and refresh.",
    ));
  };
  return <section aria-label="Facilitator playback" className="mt-4 border-t border-border pt-4">
    <h4 className="font-semibold">Shared-screen recorded instruction</h4>
    <p className="mt-1 text-xs text-muted-foreground">
      Only independently approved recordings with current delivery rights appear.
      Playback status is an observation, not proof that participants watched it.
    </p>
    {loading&&<p role="status" className="mt-3 text-sm">Checking course content rights...</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
    {!loading&&catalog&&catalog.media.length===0&&<div className="mt-3 space-y-2">
      <p role="status" className="text-sm text-muted-foreground">{catalog.note}</p>
      <Button type="button" size="sm" variant="outline" onClick={()=>{
        setLoading(true);setError("");
        void getFacilitatedRoomMedia({data:{facilitatedSessionId}})
          .then(result=>{
            setCatalog(result);
            setSelected(result.media[0]?
              result.media[0].lessonId+":"+result.media[0].assetVersionId:"");
          })
          .catch(()=>setError("Unable to refresh current media rights."))
          .finally(()=>setLoading(false));
      }}>Recheck approved recordings</Button>
    </div>}
    {catalog?.media.length ? <div className="mt-3 space-y-3">
      <label className="block text-sm font-medium">
        Select a recorded lesson
        <select className="mt-2 min-h-10 w-full border border-border bg-background px-3 py-2"
          value={selected} onChange={event=>setSelected(event.target.value)}>
          {catalog.media.map(item=><option
            key={item.lessonId+":"+item.assetVersionId}
            value={item.lessonId+":"+item.assetVersionId}>
            {item.lessonTitle}
          </option>)}
        </select>
      </label>
      {current&&<ClassVideoPlayer
        key={facilitatedSessionId+":"+selected}
        title={current.lessonTitle+" · facilitator screen"}
        presentation="classroom"
        resourceId={current.assetVersionId}
        loadUrl={async()=>(
          await getFacilitatedRoomMediaAccess({data:{
            facilitatedSessionId,
            lessonId:current.lessonId,assetVersionId:current.assetVersionId,
          }})
        ).downloadUrl}
        onPlaybackEvent={onPlaybackEvent}
      />}
      {catalog.truncated&&<p className="text-xs text-muted-foreground">
        Displaying the first 25 eligible course presentations.
      </p>}
      <Button type="button" size="sm" variant="outline" onClick={()=>{
        setLoading(true);setError("");
        void getFacilitatedRoomMedia({data:{facilitatedSessionId}})
          .then(result=>{setCatalog(result);if(!result.media.some(item=>
            item.lessonId+":"+item.assetVersionId===selected
          ))setSelected(result.media[0]?
            result.media[0].lessonId+":"+result.media[0].assetVersionId:"");})
          .catch(()=>setError("Unable to refresh current media rights."))
          .finally(()=>setLoading(false));
      }}>Recheck approved recordings</Button>
    </div>:null}
  </section>;
}
