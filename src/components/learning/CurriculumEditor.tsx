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
