import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativeClassSessionAgenda, publishNativeClassSessionAgenda,
} from "@/modules/classes/native-class-session-agenda.functions";
import type { ClassSessionAgendaItem } from "@/domain/native-class-session-agenda";

type Kind = ClassSessionAgendaItem["kind"];
const labels:Record<Kind,string>={
  study:"Study",watch:"Watch",practice:"Practice",
  assignment:"Complete assignment",assessment:"Take assessment",
};
const selectClass="min-h-10 w-full border border-border bg-background px-3 text-sm";

/**
 * One Session's published Course-linked plan. Class/Session identity is supplied
 * only as a query hint; the server independently verifies current Person/Site/
 * Course Attempt or exact facilitator authority for every read and write.
 */
export function NativeClassSessionAgenda({
  classId,classSessionId,canEdit=false,
}:{
  classId:string;classSessionId:string;canEdit?:boolean;
}){
  const agenda=useQuery({
    queryKey:["native-class-session-agenda",classId,classSessionId],
    queryFn:()=>getNativeClassSessionAgenda({data:{classId,classSessionId}}),
    retry:false,staleTime:0,
  });
  const [draft,setDraft]=useState<ClassSessionAgendaItem[]>([]);
  const [kind,setKind]=useState<Kind>("watch");
  const [referenceId,setReferenceId]=useState("");
  const [requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [editing,setEditing]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const data=agenda.data;
  useEffect(()=>{
    if(data){
      setDraft(data.items.map(item=>({kind:item.kind,referenceId:item.referenceId})));
      setEditing(false);
    }
  },[data?.classSessionId,data?.revisionNo]);

  const catalog=data?.options;
  const options=kind==="assignment"?catalog?.assignments:
    kind==="assessment"?catalog?.assessments:catalog?.lessons;
  const optionLabels=new Map([
    ...(catalog?.lessons??[]).map(x=>["lesson:"+x.id,x.title] as const),
    ...(catalog?.assignments??[]).map(x=>["assignment:"+x.id,x.title] as const),
    ...(catalog?.assessments??[]).map(x=>["assessment:"+x.id,x.title] as const),
  ]);
  function name(item:ClassSessionAgendaItem){
    return optionLabels.get(
      (item.kind==="assignment"||item.kind==="assessment"?item.kind:"lesson")+":"+item.referenceId,
    )??data?.items.find(x=>x.kind===item.kind&&x.referenceId===item.referenceId)?.title
      ??"Published Course content";
  }
  function change(next:ClassSessionAgendaItem[]){
    setDraft(next);setRequestId(crypto.randomUUID());setNotice("");setError("");
  }
  function add(){
    if(!referenceId||draft.length>=24||
       draft.some(item=>item.kind===kind&&item.referenceId===referenceId))return;
    change([...draft,{kind,referenceId}]);setReferenceId("");
  }
  async function publish(){
    if(busy||!draft.length||!data?.canEdit)return;
    setBusy(true);setError("");setNotice("");
    try{
      const saved=await publishNativeClassSessionAgenda({data:{
        classId,classSessionId,requestId,items:draft,
      }});
      await agenda.refetch();
      setRequestId(crypto.randomUUID());setEditing(false);
      setNotice("Session agenda revision "+saved.revisionNo+" saved. This does not issue assignments, attendance or completion.");
    }catch(e){
      setError(normalizeClientError(e,"Session agenda could not be published.").message);
    }finally{setBusy(false)}
  }
  return <section className="mt-3 border border-border bg-card p-3"
    aria-label="Session instructional agenda">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold">Study plan for this Session</h4>
      {data?.revisionNo?<span className="text-xs text-muted-foreground">
        Revision {data.revisionNo}</span>:null}
    </div>
    {agenda.isPending&&<p role="status" className="mt-2 text-sm">Checking Session and Course access…</p>}
    {agenda.isError&&<p role="alert" className="mt-2 text-sm text-destructive">
      Study plan unavailable under your current permissions or release configuration.
    </p>}
    {data&&<>
      {!data.items.length?<p className="mt-2 text-sm text-muted-foreground">
        No published Session plan yet. Your publisher-owned Course lessons remain available independently.
      </p>:<ol className="mt-3 divide-y divide-border border-y border-border">
        {data.items.map((item,index)=><li key={index} className="py-2 text-sm">
          <span className="font-semibold">{index+1}. {labels[item.kind]}</span>
          <span className="ml-2">{item.title}</span>
          {["study","watch","practice"].includes(item.kind)&&
            <Link to="/classes/$classId" params={{classId}}
              search={{view:"learn",tab:"lessons",lesson:item.referenceId,session:undefined}}
              className="ml-2 underline underline-offset-2">
              Open lesson
            </Link>}
        </li>)}
      </ol>}
      <p className="mt-2 text-xs text-muted-foreground">
        Watch and practice through your own recorded teacher selection. Class enrollment,
        Course Attempt, individual progress, assessment permissions and attendance stay independent.
      </p>
      {canEdit&&data.canEdit&&<div className="mt-3">
        {!editing?<Button size="sm" variant="outline"
          onClick={()=>setEditing(true)}>Edit Session plan</Button>:<>
          <div className="border-t border-border pt-3">
            <h5 className="text-sm font-semibold">Arrange published Course activities</h5>
            <p className="mt-1 text-xs text-muted-foreground">
              Changes create an immutable new local plan revision. They never modify the Course.
            </p>
            <ol className="mt-3 space-y-2">
              {draft.map((item,index)=><li key={index} className="flex flex-wrap items-center gap-2 border border-border p-2 text-sm">
                <span className="min-w-0 flex-1">{index+1}. {labels[item.kind]}: {name(item)}</span>
                <Button type="button" variant="outline" size="sm" disabled={busy||index===0}
                  onClick={()=>{const next=[...draft];[next[index-1],next[index]]=[next[index]!,next[index-1]!];change(next);}}>
                  Up
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy||index===draft.length-1}
                  onClick={()=>{const next=[...draft];[next[index+1],next[index]]=[next[index]!,next[index+1]!];change(next);}}>
                  Down
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy}
                  onClick={()=>change(draft.filter((_,i)=>i!==index))}>Remove</Button>
              </li>)}
            </ol>
            <div className="mt-3 grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
              <label className="text-xs font-semibold">
                Activity
                <select className={selectClass+" mt-1"} value={kind}
                  onChange={event=>{setKind(event.target.value as Kind);setReferenceId("");}}>
                  {(Object.keys(labels) as Kind[]).map(value=>
                    <option key={value} value={value}>{labels[value]}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">
                Publisher-owned content
                <select className={selectClass+" mt-1"} value={referenceId}
                  onChange={event=>setReferenceId(event.target.value)}>
                  <option value="">Select approved content</option>
                  {(options??[]).map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
              <Button type="button" size="sm" variant="outline" disabled={!referenceId||busy||draft.length>=24}
                onClick={add}>Add</Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy||draft.length===0}
                onClick={()=>void publish()}>{busy?"Publishing…":"Publish Session plan"}</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy}
                onClick={()=>{setEditing(false);setDraft(data.items.map(x=>({kind:x.kind,referenceId:x.referenceId})));}}>
                Discard changes
              </Button>
            </div>
          </div>
        </>}
      </div>}
      {notice&&<p role="status" className="mt-2 text-sm">{notice}</p>}
      {error&&<p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </>}
  </section>;
}
