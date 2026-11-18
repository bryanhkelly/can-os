import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { ClassContent } from "@/domain/class-content";
import { curriculumReleaseReadiness } from "@/domain/curriculum-release-readiness";
import type { ClassTeacherGuides } from "@/domain/class-teacher-guides";
import { PublisherTeacherGuideEditor } from "./PublisherTeacherGuideEditor";
import { saveAuthoredCurriculum, publishAuthoredCurriculum, saveAuthoredLesson } from "@/modules/learning/curriculum-authoring.functions";
import { useUnsavedChangesGuard } from "@/components/workspace/form-page";

export function CurriculumEditor({programId,courseCode,release,onSaved,mode="combined"}:{
 programId:string;courseCode:string;
 mode?:"combined"|"author"|"publish";
 release:{id:string;revision:string;content:ClassContent|null;teacherGuides?:ClassTeacherGuides|null};onSaved:()=>Promise<void>;
}){
 const [content,setContent]=useState<ClassContent>(release.content??{version:1,syllabus:"",modules:[],resources:[]});
 const [revision,setRevision]=useState(release.revision);
 const [selectedModuleId,setSelectedModuleId]=useState(release.content?.modules[0]?.id??"");
 const [previewLessonId,setPreviewLessonId]=useState(release.content?.modules[0]?.lessons[0]?.id??"");
 const [teacherGuides,setTeacherGuides]=useState<ClassTeacherGuides|null>(release.teacherGuides??null);
 const [reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [publicationAttempted,setPublicationAttempted]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const saved=useRef(JSON.stringify(release.content??{version:1,syllabus:"",modules:[],resources:[]}));
 const guidesSaved=useRef(JSON.stringify(release.teacherGuides??null));
 const dirty=JSON.stringify(content)!==saved.current||JSON.stringify(teacherGuides)!==guidesSaved.current;
 useUnsavedChangesGuard(mode==="author"&&dirty);
 const readiness=curriculumReleaseReadiness(content,teacherGuides,courseCode);
 const foundModuleIndex=content.modules.findIndex(module=>module.id===selectedModuleId);
 const activeModuleIndex=foundModuleIndex>=0?foundModuleIndex:0;
 const activeModule=content.modules[activeModuleIndex];
 const previewLesson=activeModule?.lessons.find(lesson=>lesson.id===previewLessonId)??activeModule?.lessons[0];
 const lessonTotal=content.modules.reduce((n,module)=>n+module.lessons.length,0);
 const lessonsWithContent=content.modules.reduce((n,module)=>n+module.lessons.filter(
  lesson=>Boolean(lesson.body.trim()||lesson.activities?.length)).length,0);
 async function save(){
  setBusy(true);setError("");setNotice("");
  try{
   const result=await saveAuthoredCurriculum({data:{programId,versionId:release.id,expectedRevision:revision,content,teacherGuides}});
   saved.current=JSON.stringify(content);guidesSaved.current=JSON.stringify(teacherGuides);
   setRevision(result.revision);setNotice("Publisher lesson content and protected teacher guides saved as draft.");
  }catch(cause){setError(mutationErrorMessage(cause, "Unable to save curriculum"));}
  finally{setBusy(false);}
 }
 async function saveOneLesson(moduleId:string,lessonId:string){
  const persisted:ClassContent=JSON.parse(saved.current);
  const original=persisted.modules.find(m=>m.id===moduleId)?.lessons.find(l=>l.id===lessonId);
  const changed=content.modules.find(m=>m.id===moduleId)?.lessons.find(l=>l.id===lessonId);
  if(!original||!changed){setError("This lesson has not been saved as part of the course outline yet.");return;}
  // A single-lesson operation must not silently discard other pending changes.
  const exceptSelected={...content,modules:content.modules.map(m=>m.id!==moduleId?m:{
   ...m,lessons:m.lessons.map(l=>l.id===lessonId?original:l),
  })};
  if(JSON.stringify(exceptSelected)!==saved.current||JSON.stringify(teacherGuides)!==guidesSaved.current){
   setError("Save the complete draft first to preserve other unsaved changes before saving one lesson.");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const result=await saveAuthoredLesson({data:{
    programId,versionId:release.id,expectedRevision:revision,moduleId,lessonId,lesson:changed,
   }});
   const nextSaved={...persisted,modules:persisted.modules.map(m=>m.id!==moduleId?m:{
    ...m,lessons:m.lessons.map(l=>l.id===lessonId?changed:l),
   })};
   saved.current=JSON.stringify(nextSaved);
   setRevision(result.revision);
   setNotice(result.changed?"Publisher lesson saved within this course draft.":"Lesson was already up to date.");
   await onSaved();
  }catch(e){setError(mutationErrorMessage(e, "Unable to save this lesson."));}
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
  {error&&<p role="alert" className=" border p-3">{error}</p>}
  {notice&&<p role="status" className=" border p-3">{notice}</p>}
  {mode!=="publish"&&<><fieldset disabled={busy} className="space-y-4">
   <Label className="block text-sm">Syllabus
    <Textarea value={content.syllabus} maxLength={100000} rows={5} className="mt-1 block w-full  border bg-background p-2"
     onChange={event=>setContent({...content,syllabus:event.target.value})}/>
   </Label>
   <section className="space-y-3  border p-4" aria-label="Publisher course outline navigator">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div><h3 className="font-semibold">Full-course outline</h3>
      <p className="text-xs text-muted-foreground">{content.modules.length} units · {lessonTotal} lessons · {lessonsWithContent} lessons with authored content. These counts do not certify academic credit.</p></div>
     <Label className="text-sm">Unit to edit
      <Select aria-label="Unit to edit" value={activeModule?.id??""} onChange={e=>setSelectedModuleId(e.target.value)}
       className="mt-1 block min-w-48  border bg-background p-2">
       {!activeModule&&<option value="">Add a unit to start</option>}
       {content.modules.map((module,index)=><option value={module.id} key={module.id}>
         Unit {index+1}: {module.title} ({module.lessons.length} lessons)</option>)}
      </Select>
     </Label>
    </div>
    {activeModule&&<div className="flex flex-wrap gap-3 text-sm">
     <Button type="button" variant="outline" className=" border px-3 py-2 disabled:opacity-40" disabled={activeModuleIndex===0}
      onClick={()=>setSelectedModuleId(content.modules[activeModuleIndex-1]!.id)}>Previous unit</Button>
     <Button type="button" variant="outline" className=" border px-3 py-2 disabled:opacity-40"
      disabled={activeModuleIndex===content.modules.length-1}
      onClick={()=>setSelectedModuleId(content.modules[activeModuleIndex+1]!.id)}>Next unit</Button>
    </div>}
    {content.blueprint&&<details className=" border p-3">
     <summary className="cursor-pointer text-sm font-medium">View {content.blueprint.targetInstructionalWeeks}-week course plan</summary>
     <p className="mt-2 text-xs text-muted-foreground">Weeks are a planning sequence within this publisher's complete course, not separate releases or school adoptions. Planned units without authored lessons are not student content.</p>
     <ol className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{content.blueprint.weeks.map(week=><li key={week.week}>
      <Button type="button" variant="outline" disabled={!content.modules.some(module=>module.id===week.unitId)}
       onClick={()=>setSelectedModuleId(week.unitId)} className="w-full  border p-2 text-left text-xs disabled:opacity-50">
       Week {week.week}: {week.title} · {week.status}
      </Button>
     </li>)}</ol>
    </details>}
    {activeModule?.lessons.length&&<details className=" border p-3">
      <summary className="cursor-pointer text-sm font-medium">Preview student-facing lesson (draft)</summary>
      <p className="mt-2 text-xs text-muted-foreground">Read-only publisher draft preview. This is not a classroom assignment, student progress or published lesson. Restricted teacher solutions are not included.</p>
      <Label className="mt-3 block text-sm">Lesson to preview
       <Select aria-label="Lesson to preview" className="mt-1 block w-full  border bg-background p-2"
        value={previewLesson?.id??""} onChange={e=>setPreviewLessonId(e.target.value)}>
        {activeModule.lessons.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
       </Select>
      </Label>
      {previewLesson&&<div className="mt-3 space-y-3  border p-4">
        <h4 className="font-semibold">{previewLesson.title}</h4>
        {previewLesson.learningTargets?.length? <ul className="list-inside list-disc text-sm">{previewLesson.learningTargets.map(target=><li key={target}>{target}</li>)}</ul>:null}
        {previewLesson.body.trim()&&<p className="whitespace-pre-wrap text-sm">{previewLesson.body}</p>}
        {previewLesson.activities?.length? <ol className="list-inside list-decimal space-y-2 text-sm">{previewLesson.activities.map(activity=><li key={activity.id}>
          <span className="font-medium">{activity.title}</span><p className="whitespace-pre-wrap">{activity.instructions}</p>
        </li>)}</ol>:null}
      </div>}
    </details>}
    {dirty&&<p className="text-xs font-medium">Unsaved changes stay in this draft while you navigate the course outline.</p>}
   </section>
   {content.modules.map((module,index)=>index===activeModuleIndex?<section key={module.id} className="space-y-3  border p-4">
    <div className="flex flex-wrap items-center gap-3">
     <Label className="flex-1 text-sm">Module title<Input value={module.title} maxLength={200}
      onChange={event=>moduleChange(index,{title:event.target.value})} className="mt-1 block w-full  border bg-background p-2"/></Label>
     <Button type="button" variant="outline" className=" border px-3 py-2 text-sm" onClick={()=>{
      setContent(current=>({...current,modules:current.modules.filter(item=>item.id!==module.id)}));
      setSelectedModuleId(content.modules.find(item=>item.id!==module.id)?.id??"");
     }}>Remove module</Button>
     {index>0&&<Button type="button" variant="outline" className=" border px-3 py-2 text-sm" onClick={()=>setContent(current=>{
      const modules=[...current.modules];[modules[index-1],modules[index]]=[modules[index]!,modules[index-1]!];
      return {...current,modules};
     })}>Move module up</Button>}
    </div>
    {module.lessons.map((lesson,lessonIndex)=><div key={lesson.id} className="space-y-2 border-t pt-3">
     <Label className="block text-sm">Lesson title<Input value={lesson.title} maxLength={200}
      onChange={event=>moduleChange(index,{lessons:module.lessons.map(item=>item.id===lesson.id?{...item,title:event.target.value}:item)})}
      className="mt-1 block w-full  border bg-background p-2"/></Label>
     <Label className="block text-sm">Lesson reading
      <Textarea value={lesson.body} maxLength={100000} rows={6}
       onChange={event=>moduleChange(index,{lessons:module.lessons.map(item=>item.id===lesson.id?{...item,body:event.target.value}:item)})}
       className="mt-1 block w-full  border bg-background p-2"/>
     </Label>

     <Label className="block text-sm">Recorded lesson transcript
      <Textarea value={lesson.transcript ?? ""} maxLength={100000} rows={5}
       onChange={event=>lessonChange(index,lesson.id,l=>({...l,transcript:event.target.value}))}
       className="mt-1 block w-full  border bg-background p-2"/>
      <span className="mt-1 block text-xs text-muted-foreground">Student-accessible transcript, published with this course release. Keep teacher-only answers in the protected guide.</span>
     </Label>

     <div className="grid gap-3 sm:grid-cols-2">
      <Label className="block text-sm">Learning targets (one per line)
       <Textarea rows={3} value={(lesson.learningTargets??[]).join("\n")} className="mt-1 block w-full  border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,learningTargets:event.target.value.split("\n").map(x=>x.trim()).filter(Boolean)}))}/>
      </Label>
      <Label className="block text-sm">Standards (comma separated)
       <Textarea rows={3} value={(lesson.standards??[]).join(", ")} className="mt-1 block w-full  border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,standards:event.target.value.split(",").map(x=>x.trim()).filter(Boolean)}))}/>
      </Label>
      <Label className="block text-sm">Total lesson minutes
       <Input type="number" min={1} max={180} value={lesson.estimatedMinutes??""} className="mt-1 block w-full  border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,estimatedMinutes:event.target.value?Number(event.target.value):undefined}))}/>
      </Label>
     </div>
     <section className="space-y-3  border p-3" aria-label={"Structured activities for "+lesson.title}>
      <div className="flex items-center justify-between gap-3"><h4 className="text-sm font-semibold">Structured lesson activities</h4>
       <span className="text-xs text-muted-foreground">{(lesson.activities??[]).length} / 20</span></div>
      {(lesson.activities??[]).map((activity,activityIndex)=><div key={activity.id} className="grid gap-2  border p-3">
       <Label className="text-sm">Activity title<Input value={activity.title} maxLength={200} className="mt-1 block w-full  border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,title:event.target.value}:a)}))}/></Label>
       <div className="grid gap-2 sm:grid-cols-3">
        <Label className="text-sm">Activity type<Select value={activity.kind} className="mt-1 block w-full  border bg-background p-2"
         onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,kind:event.target.value as typeof a.kind}:a)}))}>
         {["launch","instruction","worked_example","guided_practice","independent_practice","exit_ticket","reflection","self_check"].map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}
        </Select></Label>
        <Label className="text-sm">Minutes<Input type="number" min={1} max={180} value={activity.estimatedMinutes??""}
         className="mt-1 block w-full  border bg-background p-2"
         onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,estimatedMinutes:event.target.value?Number(event.target.value):undefined}:a)}))}/></Label>
        <Label className="text-sm">Evidence<Select value={activity.evidence??""} className="mt-1 block w-full  border bg-background p-2"
         onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,evidence:event.target.value?event.target.value as typeof a.evidence:undefined}:a)}))}>
         <option value="">Not specified</option>{["practice","formative","teacher_review"].map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}
        </Select></Label>
       </div>
       <Label className="text-sm">Student instructions<Textarea rows={4} maxLength={30000} value={activity.instructions}
        className="mt-1 block w-full  border bg-background p-2"
        onChange={event=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).map(a=>a.id===activity.id?{...a,instructions:event.target.value}:a)}))}/></Label>
       <div className="flex gap-2">
        <Button type="button" variant="outline" className=" border px-2 py-1 text-xs" onClick={()=>lessonChange(index,lesson.id,l=>({...l,activities:(l.activities??[]).filter(a=>a.id!==activity.id)}))}>Remove activity</Button>
        {activityIndex>0&&<Button type="button" variant="outline" className=" border px-2 py-1 text-xs" onClick={()=>lessonChange(index,lesson.id,l=>{
         const activities=[...(l.activities??[])];[activities[activityIndex-1],activities[activityIndex]]=[activities[activityIndex]!,activities[activityIndex-1]!];
         return {...l,activities};
        })}>Move activity up</Button>}
       </div>
      </div>)}
      <Button type="button" variant="outline" disabled={(lesson.activities??[]).length>=20} className=" border px-3 py-2 text-sm disabled:opacity-50"
       onClick={()=>lessonChange(index,lesson.id,l=>({...l,activities:[...(l.activities??[]),{
        id:crypto.randomUUID(),kind:"instruction",title:"New activity",instructions:"Write student instructions here before saving.",
        evidence:"practice",
       }]}))}>Add activity</Button>
      <p className="text-xs text-muted-foreground">Activities and student instructions are publisher content. Keep answer keys in the protected teacher guide, not here.</p>
     </section>
     <Button type="button" variant="outline" disabled={busy} className=" border px-3 py-2 text-sm disabled:opacity-50"
      onClick={()=>void saveOneLesson(module.id,lesson.id)}>Save this lesson only</Button>
     <div className="flex gap-3">
      <Button type="button" variant="outline" className=" border px-3 py-2 text-sm" onClick={()=>moduleChange(index,{
       lessons:module.lessons.filter(item=>item.id!==lesson.id)})}>Remove lesson</Button>
      {lessonIndex>0&&<Button type="button" variant="outline" className=" border px-3 py-2 text-sm" onClick={()=>{
       const lessons=[...module.lessons];[lessons[lessonIndex-1],lessons[lessonIndex]]=[lessons[lessonIndex]!,lessons[lessonIndex-1]!];
       moduleChange(index,{lessons});
      }}>Move lesson up</Button>}
     </div>
     {lesson.resources.length>0&&<div className="space-y-2 text-xs">
      <p>Existing lesson resources are preserved. Private documents cannot be republished through this HTTPS-only workflow.</p>
      {lesson.resources.map(resource=><div key={resource.id} className="flex items-center gap-3">
       <span>{resource.title} · {resource.url??"Private document"}</span>
       <Button type="button" variant="outline" className=" border px-2 py-1" onClick={()=>moduleChange(index,{
        lessons:module.lessons.map(item=>item.id===lesson.id?{...item,resources:item.resources.filter(row=>row.id!==resource.id)}:item),
       })}>Remove lesson resource</Button>
      </div>)}
     </div>}
    </div>)}
    <Button type="button" variant="outline" disabled={module.lessons.length>=200} className=" border px-3 py-2 text-sm"
     onClick={()=>moduleChange(index,{lessons:[...module.lessons,{id:crypto.randomUUID(),title:"New lesson",body:"",resources:[]}]})}>Add lesson</Button>
   </section>:null)}
   <Button type="button" variant="outline" disabled={content.modules.length>=100} className=" border px-3 py-2 text-sm"
    onClick={()=>{
      const id=crypto.randomUUID();
      setContent(current=>({...current,modules:[...current.modules,{id,title:"New module",lessons:[]}]}));
      setSelectedModuleId(id);
    }}>Add module</Button>
   <h3 className="font-semibold">Class resources (HTTPS links)</h3>
   {content.resources.map((resource,index)=><div key={resource.id} className="flex flex-wrap gap-3  border p-3">
    <Label className="flex-1 text-sm">Resource title<Input value={resource.title} maxLength={200}
     onChange={event=>setContent({...content,resources:content.resources.map((item,i)=>i===index?{...item,title:event.target.value}:item)})}
     className="mt-1 block w-full  border bg-background p-2"/></Label>
    <Label className="flex-1 text-sm">HTTPS URL<Input type="url" value={resource.url??""} maxLength={2048}
     onChange={event=>setContent({...content,resources:content.resources.map((item,i)=>i===index?
      {id:item.id,title:item.title,url:event.target.value}:item)})} className="mt-1 block w-full  border bg-background p-2"/></Label>
    <Button type="button" variant="outline" className=" border px-3 py-2 text-sm"
     onClick={()=>setContent({...content,resources:content.resources.filter(item=>item.id!==resource.id)})}>Remove resource</Button>
   </div>)}
   <Button type="button" variant="outline" disabled={content.resources.length>=500} className=" border px-3 py-2 text-sm"
    onClick={()=>setContent({...content,resources:[...content.resources,{id:crypto.randomUUID(),title:"New resource",url:"https://"}]})}>Add resource link</Button>
   <div><Button type="button" variant="outline" onClick={()=>void save()} className=" border px-4 py-2 text-sm">Save draft</Button>
    {dirty&&<span className="ml-3 text-sm">Unsaved changes</span>}</div>
  </fieldset>
  <fieldset disabled={busy}><PublisherTeacherGuideEditor courseCode={courseCode} content={content}
    guides={teacherGuides} onChange={setTeacherGuides}/></fieldset></>}
    {mode!=="author"&&<><section className="space-y-3  border p-4" aria-label="Publisher release readiness">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="font-semibold">Publication readiness</h3>
        <p className="text-sm text-muted-foreground">{readiness.unitCount} units · {readiness.lessonCount} lessons</p>
      </div>
      <span className=" border px-2 py-1 text-xs font-semibold" role="status">
        {readiness.readyForPublisherPublication?"Content requirements met":"Requires attention"}
      </span>
    </div>
    {readiness.blockers.length>0&&<div>
      <h4 className="text-sm font-semibold">Resolve before publication</h4>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">{readiness.blockers.map((blocker,i)=><li key={i}>{blocker}</li>)}</ul>
    </div>}
    {readiness.warnings.length>0&&<div>
      <h4 className="text-sm font-semibold">Advisory review</h4>
      <ul className="mt-2 list-inside list-disc space-y-1 text-sm">{readiness.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>
    </div>}
    <p className="text-xs text-muted-foreground">Completeness does not indicate accreditation, academic-credit approval, standards alignment, classroom delivery or school acceptance. The server validates the saved release again at publication.</p>
    {dirty&&<p className="text-sm font-medium">Save the draft before publishing; this readiness view reflects unsaved edits.</p>}
  </section>
  <form noValidate className="space-y-3  border p-4" onSubmit={async event=>{
   event.preventDefault();setError("");setNotice("");
   setPublicationAttempted(true);
   if(dirty||!readiness.readyForPublisherPublication||!confirmed||reason.trim().length<10)return;
   setBusy(true);
   try{
    await publishAuthoredCurriculum({data:{programId,versionId:release.id,expectedRevision:revision,reason,confirmed:true}});
    await onSaved();
   }catch(cause){setError(mutationErrorMessage(cause, "Unable to publish curriculum"));}
   finally{setBusy(false);}
  }}>
  <Field label="Release reason" required
   error={publicationAttempted&&reason.trim().length<10?"Enter at least 10 characters explaining this release.":undefined}>
   <Textarea minLength={10} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}/>
  </Field>
  <Field label="I reviewed this release. Publication is immutable and does not upgrade existing classes." required
   error={publicationAttempted&&!confirmed?"Confirm that you reviewed the release and understand its effect.":undefined}>
   <Checkbox checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>
  </Field>
  <Button type="submit" variant="outline" disabled={busy||dirty||!readiness.readyForPublisherPublication}>Publish curriculum release</Button>
  </form></>}
 </section>;
}
