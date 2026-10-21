import { useRef, useState } from "react";
import type { ClassContent } from "@/domain/class-content";
import { saveAuthoredCurriculum, publishAuthoredCurriculum } from "@/modules/learning/curriculum-authoring.functions";

export function CurriculumEditor({programId,release,onSaved}:{
 programId:string;release:{id:string;revision:string;content:ClassContent|null};onSaved:()=>Promise<void>;
}){
 const [content,setContent]=useState<ClassContent>(release.content??{version:1,syllabus:"",modules:[],resources:[]});
 const [revision,setRevision]=useState(release.revision);
 const [reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const saved=useRef(JSON.stringify(release.content??{version:1,syllabus:"",modules:[],resources:[]}));
 const dirty=JSON.stringify(content)!==saved.current;
 async function save(){
  setBusy(true);setError("");setNotice("");
  try{
   const result=await saveAuthoredCurriculum({data:{programId,versionId:release.id,expectedRevision:revision,content}});
   saved.current=JSON.stringify(content);setRevision(result.revision);setNotice("Draft saved. Not visible in classes until published.");
  }catch(cause){setError(cause instanceof Error?cause.message:"Unable to save curriculum");}
  finally{setBusy(false);}
 }
 function moduleChange(index:number,change:Partial<ClassContent["modules"][number]>){
  setContent(current=>({...current,modules:current.modules.map((module,i)=>i===index?{...module,...change}:module)}));
 }
 function lessonChange(moduleIndex:number,lessonId:string,update:(lesson:ClassContent["modules"][number]["lessons"][number])=>ClassContent["modules"][number]["lessons"][number]){
  setContent(current=>({...current,modules:current.modules.map((module,i)=>i!==moduleIndex?module:{
   ...module,lessons:module.lessons.map(lesson=>lesson.id===lessonId?update(lesson):lesson),
  })}));
 }

 return <section className="mt-4 space-y-4" aria-label="Curriculum draft editor">
  <p className="text-sm">Draft edits are private to authorized publishers. Publishing creates a reusable release for new sections;
   existing classes and lesson progress keep their pinned version.</p>
  {error&&<p role="alert" className="rounded border p-3">{error}</p>}
  {notice&&<p role="status" className="rounded border p-3">{notice}</p>}
  <fieldset disabled={busy} className="space-y-4">
   <label className="block text-sm">Syllabus
    <textarea value={content.syllabus} maxLength={100000} rows={5} className="mt-1 block w-full rounded border bg-background p-2"
     onChange={event=>setContent({...content,syllabus:event.target.value})}/>
   </label>
   {content.modules.map((module,index)=><section key={module.id} className="space-y-3 rounded border p-4">
    <div className="flex flex-wrap items-center gap-3">
     <label className="flex-1 text-sm">Module title<input value={module.title} maxLength={200}
      onChange={event=>moduleChange(index,{title:event.target.value})} className="mt-1 block w-full rounded border bg-background p-2"/></label>
     <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>setContent(current=>({
      ...current,modules:current.modules.filter(item=>item.id!==module.id)}))}>Remove module</button>
     {index>0&&<button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>setContent(current=>{
      const modules=[...current.modules];[modules[index-1],modules[index]]=[modules[index]!,modules[index-1]!];
      return {...current,modules};
     })}>Move module up</button>}
    </div>
    {module.lessons.map((lesson,lessonIndex)=><div key={lesson.id} className="space-y-2 border-t pt-3">
     <label className="block text-sm">Lesson title<input value={lesson.title} maxLength={200}
      onChange={event=>moduleChange(index,{lessons:module.lessons.map(item=>item.id===lesson.id?{...item,title:event.target.value}:item)})}
      className="mt-1 block w-full rounded border bg-background p-2"/></label>
     <label className="block text-sm">Lesson reading
      <textarea value={lesson.body} maxLength={100000} rows={6}
       onChange={event=>moduleChange(index,{lessons:module.lessons.map(item=>item.id===lesson.id?{...item,body:event.target.value}:item)})}
       className="mt-1 block w-full rounded border bg-background p-2"/>
     </label>

     <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Learning targets (one per line)
       <textarea rows={3} value={(lesson.learningTargets??[]).join("\n")} className="mt-1 block w-full rounded border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,learningTargets:event.target.value.split("\n").map(x=>x.trim()).filter(Boolean)}))}/>
      </label>
      <label className="block text-sm">Standards (comma separated)
       <textarea rows={3} value={(lesson.standards??[]).join(", ")} className="mt-1 block w-full rounded border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,standards:event.target.value.split(",").map(x=>x.trim()).filter(Boolean)}))}/>
      </label>
      <label className="block text-sm">Total lesson minutes
       <input type="number" min={1} max={180} value={lesson.estimatedMinutes??""} className="mt-1 block w-full rounded border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,estimatedMinutes:event.target.value?Number(event.target.value):undefined}))}/>
      </label>
     </div>
     <section className="space-y-3 rounded border p-3" aria-label={"Structured activities for "+lesson.title}>
      <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">Structured lesson activities</h4>
       <span className="text-xs text-muted-foreground">{(lesson.activities??[]).length} / 20</span></div>
      {(lesson.activities??[]).map((activity,activityIndex)=><div key={activity.id} className="grid gap-2 rounded border p-3">
       <label className="text-sm">Activity title<input value={activity.title} maxLength={200} className="mt-1 block w-full rounded border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,title:event.target.value}:a)}))}/></label>
       <div className="grid gap-2 sm:grid-cols-3">
        <label className="text-sm">Activity type<select value={activity.kind} className="mt-1 block w-full rounded border bg-background p-2"
         onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,kind:event.target.value as typeof a.kind}:a)}))}>
         {["launch","instruction","worked_example","guided_practice","independent_practice","exit_ticket","reflection","self_check"].map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}
        </select></label>
        <label className="text-sm">Minutes<input type="number" min={1} max={180} value={activity.estimatedMinutes??""}
         className="mt-1 block w-full rounded border bg-background p-2"
         onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,estimatedMinutes:event.target.value?Number(event.target.value):undefined}:a)}))}/></label>
        <label className="text-sm">Evidence<select value={activity.evidence??""} className="mt-1 block w-full rounded border bg-background p-2"
         onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,evidence:event.target.value?event.target.value as typeof a.evidence:undefined}:a)}))}>
         <option value="">Not specified</option>{["practice","formative","teacher_review"].map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}
        </select></label>
       </div>
       <label className="text-sm">Student instructions<textarea rows={4} maxLength={30000} value={activity.instructions}
        className="mt-1 block w-full rounded border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,instructions:event.target.value}:a)}))}/></label>
       <div className="flex gap-2">
        <button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).filter(a=>a.id!==activity.id)}))}>Remove activity</button>
        {activityIndex>0&&<button type="button" className="rounded border px-2 py-1 text-xs" onClick={()=>lessonChange(index,lesson.id,l=>{
         const activities=[...(l.activities??[])];[activities[activityIndex-1],activities[activityIndex]]=[activities[activityIndex]!,activities[activityIndex-1]!];
         return {...l,activities};
        })}>Move activity up</button>}
       </div>
      </div>)}
      <button type="button" disabled={(lesson.activities??[]).length>=20} className="rounded border px-3 py-2 text-sm disabled:opacity-50"
       onClick={()=>lessonChange(index,lesson.id,l=>({...l,activities:[...(l.activities??[]),{
        id:crypto.randomUUID(),kind:"instruction",title:"New activity",instructions:"Write student instructions here before saving.",
        evidence:"practice",
       }]}))}>Add activity</button>
      <p className="text-xs text-muted-foreground">Activities and student instructions are publisher content. Keep answer keys in the protected teacher guide, not here.</p>
     </section>
     <div className="flex gap-3">
      <button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>moduleChange(index,{
       lessons:module.lessons.filter(item=>item.id!==lesson.id)})}>Remove lesson</button>
      {lessonIndex>0&&<button type="button" className="rounded border px-3 py-2 text-sm" onClick={()=>{
       const lessons=[...module.lessons];[lessons[lessonIndex-1],lessons[lessonIndex]]=[lessons[lessonIndex]!,lessons[lessonIndex-1]!];
       moduleChange(index,{lessons});
      }}>Move lesson up</button>}
     </div>
     {lesson.resources.length>0&&<div className="space-y-2 text-xs">
      <p>Existing lesson resources are preserved. Private documents cannot be republished through this HTTPS-only workflow.</p>
      {lesson.resources.map(resource=><div key={resource.id} className="flex items-center gap-3">
       <span>{resource.title} · {resource.url??"Private document"}</span>
       <button type="button" className="rounded border px-2 py-1" onClick={()=>moduleChange(index,{
        lessons:module.lessons.map(item=>item.id===lesson.id?{...item,resources:item.resources.filter(row=>row.id!==resource.id)}:item),
       })}>Remove lesson resource</button>
      </div>)}
     </div>}
    </div>)}
    <button type="button" disabled={module.lessons.length>=200} className="rounded border px-3 py-2 text-sm"
     onClick={()=>moduleChange(index,{lessons:[...module.lessons,{id:crypto.randomUUID(),title:"New lesson",body:"",resources:[]}]})}>Add lesson</button>
   </section>)}
   <button type="button" disabled={content.modules.length>=100} className="rounded border px-3 py-2 text-sm"
    onClick={()=>setContent({...content,modules:[...content.modules,{id:crypto.randomUUID(),title:"New module",lessons:[]}]})}>Add module</button>
   <h3 className="font-semibold">Class resources (HTTPS links)</h3>
   {content.resources.map((resource,index)=><div key={resource.id} className="flex flex-wrap gap-3 rounded border p-3">
    <label className="flex-1 text-sm">Resource title<input value={resource.title} maxLength={200}
     onChange={event=>setContent({...content,resources:content.resources.map((item,i)=>i===index?{...item,title:event.target.value}:item)})}
     className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <label className="flex-1 text-sm">HTTPS URL<input type="url" value={resource.url??""} maxLength={2048}
     onChange={event=>setContent({...content,resources:content.resources.map((item,i)=>i===index?
      {id:item.id,title:item.title,url:event.target.value}:item)})} className="mt-1 block w-full rounded border bg-background p-2"/></label>
    <button type="button" className="rounded border px-3 py-2 text-sm"
     onClick={()=>setContent({...content,resources:content.resources.filter(item=>item.id!==resource.id)})}>Remove resource</button>
   </div>)}
   <button type="button" disabled={content.resources.length>=500} className="rounded border px-3 py-2 text-sm"
    onClick={()=>setContent({...content,resources:[...content.resources,{id:crypto.randomUUID(),title:"New resource",url:"https://"}]})}>Add resource link</button>
   <div><button type="button" onClick={()=>void save()} className="rounded border px-4 py-2 text-sm">Save draft</button>
    {dirty&&<span className="ml-3 text-sm">Unsaved changes</span>}</div>
  </fieldset>
  <form className="space-y-3 rounded border p-4" onSubmit={async event=>{
   event.preventDefault();setError("");setNotice("");
   if(dirty||!confirmed||reason.trim().length<10){setError("Save your draft, provide a reason and confirm publication first.");return;}
   setBusy(true);
   try{
    await publishAuthoredCurriculum({data:{programId,versionId:release.id,expectedRevision:revision,reason,confirmed:true}});
    await onSaved();
   }catch(cause){setError(cause instanceof Error?cause.message:"Unable to publish curriculum");}
   finally{setBusy(false);}
  }}>
   <label className="block text-sm">Release reason<textarea required minLength={10} maxLength={2000}
    value={reason} onChange={event=>setReason(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
   <label className="flex gap-2 text-sm"><input type="checkbox" required checked={confirmed}
    onChange={event=>setConfirmed(event.target.checked)}/>I reviewed this release. Publication is immutable and does not upgrade existing classes.</label>
   <button type="submit" disabled={busy||dirty||!confirmed||reason.trim().length<10}
    className="rounded border px-4 py-2 text-sm disabled:opacity-50">Publish curriculum release</button>
  </form>
 </section>;
}
