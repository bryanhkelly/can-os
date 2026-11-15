import { useEffect, useState } from "react";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { Button } from "@/components/ui/button";
import {
  getClassroomRehearsalMedia,getClassroomRehearsalMediaAccess,
  recordClassroomRehearsalPlayback,
} from "@/modules/learning/classroom-rehearsal.functions";

type Scope={deploymentId:string;siteId:string;courseVersionId:string};
type Catalog=Awaited<ReturnType<typeof getClassroomRehearsalMedia>>;
const kinds={
  video_opened:"opened",video_played:"played",video_paused:"paused",video_ended:"ended",
} as const;
export function ClassroomRehearsalPlayer({scope,onClose}:{scope:Scope;onClose:()=>void}){
  const [data,setData]=useState<Catalog|null>(null);
  const [selected,setSelected]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{
    let alive=true;
    setData(null);setSelected("");setError("");
    void getClassroomRehearsalMedia({data:scope}).then(v=>{
      if(!alive)return;setData(v);
      setSelected(v.media[0]?v.media[0].lessonId+":"+v.media[0].assetVersionId:"");
    }).catch(()=>{if(alive)setError("Rehearsal requires a published course with approved distribution rights.");});
    return ()=>{alive=false;};
  },[scope.deploymentId,scope.courseVersionId,scope.siteId]);
  const current=data?.media.find(m=>m.lessonId+":"+m.assetVersionId===selected);
  return <section aria-label="Private rehearsal" className="mt-4 border border-border bg-card p-5">
    <div className="flex justify-between gap-3">
      <h3 className="font-serif text-xl font-semibold">Private course rehearsal</h3>
      <Button type="button" variant="outline" size="sm" onClick={onClose}>Exit rehearsal</Button>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">
      Authorized facilitator preview without any learner enrollment, pairing code or classroom attendance.
      Current publisher reviews and recording rights still apply.
    </p>
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
    {!data&&!error&&<p role="status" className="mt-3 text-sm">Checking rehearsal rights…</p>}
    {data&&!data.media.length&&<p role="status" className="mt-3 text-sm">No distributable recorded lessons are available.</p>}
    {!!data?.media.length&&<div className="mt-4 space-y-3">
      <label className="block text-sm">Rehearse a lesson
        <select value={selected} onChange={e=>setSelected(e.target.value)}
          className="mt-1 w-full border border-border bg-background p-2">
          {data.media.map(m=><option key={m.lessonId+":"+m.assetVersionId}
            value={m.lessonId+":"+m.assetVersionId}>{m.lessonTitle}</option>)}
        </select>
      </label>
      {current&&<ClassVideoPlayer
        key={selected} title={current.lessonTitle+" · rehearsal"} presentation="classroom"
        resourceId={current.assetVersionId}
        loadUrl={async()=>(await getClassroomRehearsalMediaAccess({data:{
          ...scope,lessonId:current.lessonId,assetVersionId:current.assetVersionId,
        }})).downloadUrl}
        onPlaybackEvent={(event,assetVersionId)=>{
          void recordClassroomRehearsalPlayback({data:{
            ...scope,lessonId:current.lessonId,assetVersionId,
            requestId:crypto.randomUUID(),kind:kinds[event],
          }}).catch(()=>setError("Rehearsal observation could not be saved."));
        }}/>
      }
    </div>}
  </section>;
}
