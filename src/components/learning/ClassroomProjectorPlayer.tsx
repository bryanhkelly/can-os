import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { resolveClassVideo } from "@/domain/class-video";
import { ClassroomMediaSurface } from "@/components/learning/ClassroomMediaSurface";
import { getFacilitatedRoomMediaAccess, recordFacilitatedPlayback } from "@/modules/learning/facilitated-learning.functions";
import { getClassroomProjectorCommand } from "@/modules/learning/classroom-projector.functions";

type Loaded={key:string;src:string;expiresAt:number|null;accessCommandId:string};
export function ClassroomProjectorPlayer({facilitatedSessionId}:{facilitatedSessionId:string}){
  const player=useRef<HTMLVideoElement>(null);
  const [enabled,setEnabled]=useState(false);
  const [loaded,setLoaded]=useState<Loaded|null>(null);
  const [error,setError]=useState("");
  const [manualPlay,setManualPlay]=useState(false);
  const recovery=useRef<{key:string;attempts:number}>({key:"",attempts:0});
  const resumeAt=useRef<number|null>(null);
  const command=useQuery({
    queryKey:["classroom-projector-control",facilitatedSessionId],
    queryFn:()=>getClassroomProjectorCommand({data:{facilitatedSessionId}}),
    refetchInterval:2500,staleTime:0,retry:false,
  });
  const current=command.data?.latest??null;
  const identity=current?current.lessonId+":"+current.assetVersionId:"";
  const resolved=loaded&&loaded.key===identity?resolveClassVideo(loaded.src,true):null;
  const roomState=command.data?.roomState;
  useEffect(()=>{
    if(!enabled||!current||command.data?.roomState!=="live"||!identity)return;
    const expiredForNewCommand=loaded?.expiresAt!==null &&
      loaded?.expiresAt!==undefined && Date.now()>=loaded.expiresAt &&
      loaded.accessCommandId!==current.id;
    if(loaded?.key===identity && !expiredForNewCommand)return;
    let active=true;
    setError("");setManualPlay(false);
    void getFacilitatedRoomMediaAccess({data:{
      facilitatedSessionId,lessonId:current.lessonId,assetVersionId:current.assetVersionId,
    }}).then(result=>{
      if(active)setLoaded({
        key:identity,src:result.downloadUrl,accessCommandId:current.id,
        expiresAt:result.expiresInSeconds>0?
          Date.now()+Math.max(1,result.expiresInSeconds-5)*1000:null,
      });
    }).catch(()=>{if(active)setError("The selected lesson is unavailable. Recheck approval or rights.");});
    return ()=>{active=false;};
  },[enabled,current,identity,loaded?.key,loaded?.expiresAt,loaded?.accessCommandId,
    facilitatedSessionId,command.data?.roomState]);
  useEffect(()=>{
    const node=player.current;
    if(!enabled||!node||!current||command.data?.roomState!=="live"||!loaded||loaded.key!==identity||resolved?.kind!=="file")return;
    const seek=()=>{
      if(!Number.isFinite(node.duration)||node.duration<=0)return;
      const drift=current.commandKind==="play"?
        Math.max(0,Math.min(10,(Date.now()-Date.parse(current.issuedAt))/1000)):0;
      const position=current.commandKind==="stop"?0:
        (resumeAt.current??current.positionSeconds)+drift;
      resumeAt.current=null;
      if(Math.abs(node.currentTime-position)>2)
        node.currentTime=Math.max(0,Math.min(node.duration,position));
    };
    const apply=()=>{
      seek();
      if(current.commandKind==="play"){
        void node.play().then(()=>setManualPlay(false)).catch(()=>setManualPlay(true));
      }else if(["pause","stop","load"].includes(current.commandKind))node.pause();
    };
    if(node.readyState>=1)apply();
    else node.addEventListener("loadedmetadata",apply,{once:true});
    return ()=>node.removeEventListener("loadedmetadata",apply);
  },[enabled,current,loaded,identity,resolved?.kind,command.data?.roomState]);
  async function observed(kind:"opened"|"played"|"paused"|"ended"){
    if(!current || !player.current)return;
    try{
      await recordFacilitatedPlayback({data:{
        facilitatedSessionId,requestId:crypto.randomUUID(),
        lessonId:current.lessonId,assetVersionId:current.assetVersionId,
        kind,positionSeconds:Math.floor(player.current.currentTime||0),
      }});
    }catch{setError("Playback observation was not saved. The command remains auditable.");}
  }
  useEffect(()=>{
    if(command.isError || (roomState && roomState!=="live")){
      setLoaded(null);
      setEnabled(false);
    }
  },[roomState,command.isError]);
  if(command.isError) return <section
    className="border border-border bg-card p-6" aria-label="Classroom projector">
    <p role="alert">Projector command authorization is unavailable.
      Playback has been stopped until the secure connection is restored.</p>
  </section>;
  if(roomState&&roomState!=="live")return <section
    className="border border-border bg-card p-6" aria-label="Classroom projector">
    <p role="status">{roomState==="expired"?
      "This classroom expired after eight hours. Playback is closed.":
      roomState==="blocked"?
      "Projector playback was stopped because audience or content rights could not be verified.":
      "This facilitated room has ended. Playback is closed."}</p>
  </section>;
  return <section className="border border-border bg-card p-4" aria-label="Classroom projector">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-serif text-xl font-semibold">Projector playback</h2>
      <span className="text-xs text-muted-foreground">Facilitator-controlled</span>
    </div>
    {!enabled?<div className="mt-4 flex aspect-video flex-col items-center justify-center gap-3 border border-border bg-muted p-6 text-center">
      <p className="max-w-md text-sm">Activate this screen once. Lesson selection and native video play,
        pause and seek commands will then follow your facilitator console.</p>
      <Button type="button" onClick={()=>setEnabled(true)}>Activate projector playback</Button>
    </div>:<div className="mt-4">
      {command.isError&&<p role="alert">Unable to read projector commands. Verify your facilitator session.</p>}
      {!current&&<p role="status" className="flex aspect-video items-center justify-center border border-border">
        Waiting for your facilitator to load a recording.</p>}
      {current&&!resolved&&<p role="status" className="flex aspect-video items-center justify-center border border-border">
        Checking approved playback access…</p>}
      {resolved && <ClassroomMediaSurface video={resolved}
        title="Approved classroom recording" videoRef={player}
        videoClassName="aspect-video w-full bg-black"
        iframeClassName="aspect-video w-full border border-border"
        onLoadedMetadata={()=>{void observed("opened");}}
        onPlay={()=>{void observed("played");}}
        onPause={e=>{if(!e.currentTarget.ended)void observed("paused");}}
        onEnded={()=>{void observed("ended");}}
        onError={()=>{
          if(recovery.current.key!==identity)recovery.current={key:identity,attempts:0};
          if(recovery.current.attempts<1&&resolved.kind==="file"){
            recovery.current.attempts+=1;
            resumeAt.current=player.current?.currentTime??null;
            setLoaded(null);
            setError("Rechecking short-lived recording access…");
          }else setError("Playback failed. Refresh the approved recording or check the media source.");
        }}
      />
      {resolved?.kind==="embed"&&<p className="mt-2 text-xs text-muted-foreground">
        Third-party providers have their own play and pause controls. CAN OS cannot independently
        verify viewing or automatically synchronize these embeds.
      </p>}
      {manualPlay&&<Button type="button" className="mt-3" onClick={()=>{
        void player.current?.play().catch(()=>setError("Playback requires a local gesture."));
      }}>Start projector playback</Button>}
      {current&&<p className="mt-2 text-xs text-muted-foreground">
        Latest control: {current.commandKind}. Commands are not proof that playback occurred.
      </p>}
    </div>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}
