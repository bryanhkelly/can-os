import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getFacilitatedRoomMedia } from "@/modules/learning/facilitated-learning.functions";
import { issueClassroomProjectorCommand } from "@/modules/learning/classroom-projector.functions";

type Catalog=Awaited<ReturnType<typeof getFacilitatedRoomMedia>>;
/** Private command surface; no media playback or learner response data is projected. */
export function ClassroomPlaybackControls({facilitatedSessionId}:{facilitatedSessionId:string}){
  const [selected,setSelected]=useState("");
  const [position,setPosition]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const catalog=useQuery({
    queryKey:["classroom-playback-catalog",facilitatedSessionId],
    queryFn:()=>getFacilitatedRoomMedia({data:{facilitatedSessionId}}),
    staleTime:60000,retry:false,
  });
  const media:Catalog["media"]=catalog.data?.media??[];
  const current=media.find(item=>item.lessonId+":"+item.assetVersionId===selected)
    ??media[0];
  async function send(kind:"load"|"play"|"pause"|"seek"|"stop"){
    if(!current||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      await issueClassroomProjectorCommand({data:{
        facilitatedSessionId,requestId:crypto.randomUUID(),
        lessonId:current.lessonId,assetVersionId:current.assetVersionId,
        commandKind:kind,positionSeconds:position,
      }});
      setMessage("Projector "+kind+" request sent.");
    }catch{setError("Projector control was refused. Check current lesson rights and active room.");}
    finally{setBusy(false);}
  }
  return <section className="mt-4 border border-border bg-card p-4" aria-label="Shared screen playback controls">
    <h4 className="font-semibold">Control the projector</h4>
    <p className="mt-1 text-xs text-muted-foreground">
      Open the presentation display on the projector, activate it once, then request
      playback here. Some browsers require an additional tap to start sound.
      YouTube and Vimeo use their own controls and cannot promise remote seeking.
    </p>
    {catalog.isError&&<p role="alert" className="mt-2 text-sm">Approved course recordings unavailable.</p>}
    {catalog.isPending&&<p role="status" className="mt-2 text-sm">Checking current recording rights…</p>}
    {catalog.isSuccess&&!media.length&&<p className="mt-2 text-sm">No approved recordings for this course.</p>}
    {!!media.length&&<div className="mt-3 space-y-3">
      <label className="block text-sm">Lesson
        <select className="mt-1 w-full border border-border bg-background p-2"
          value={current?current.lessonId+":"+current.assetVersionId:""}
          onChange={event=>setSelected(event.target.value)}>
          {media.map(item=><option key={item.lessonId+":"+item.assetVersionId}
            value={item.lessonId+":"+item.assetVersionId}>{item.lessonTitle}</option>)}
        </select>
      </label>
      <label className="block text-sm">Position in seconds (for seek/start)
        <input className="mt-1 w-32 border border-border bg-background p-2"
          type="number" min={0} max={43200} step={1} value={position}
          onChange={event=>setPosition(Math.max(0,Math.min(43200,Math.floor(Number(event.target.value)||0))))}/>
      </label>
      <div className="flex flex-wrap gap-2">
        {(["load","play","pause","seek","stop"] as const).map(kind=>
          <Button type="button" key={kind} variant={kind==="play"?"default":"outline"}
            size="sm" disabled={busy} onClick={()=>void send(kind)}>
            {({load:"Load video",play:"Play",pause:"Pause",seek:"Seek",stop:"Stop"} as const)[kind]}
          </Button>)}
      </div>
    </div>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}
