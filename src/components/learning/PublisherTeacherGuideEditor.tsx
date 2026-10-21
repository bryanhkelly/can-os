import type { ClassContent } from "@/domain/class-content";
import type { ClassTeacherGuides } from "@/domain/class-teacher-guides";

type GuideUnit=ClassTeacherGuides["units"][number];
type LessonGuide=GuideUnit["lessons"][number];

/**
 * Publisher-only working copy of protected guidance. It is never embedded in
 * ClassContent.learning or passed to student or guardian workspaces.
 */
export function PublisherTeacherGuideEditor({courseCode,content,guides,onChange}:{
 courseCode:string;content:ClassContent;guides:ClassTeacherGuides|null;
 onChange:(value:ClassTeacherGuides|null)=>void;
}){
 function updateUnit(unitId:string,update:(unit:GuideUnit)=>GuideUnit){
  if(!guides)return;
  onChange({...guides,units:guides.units.map(u=>u.unitId===unitId?update(u):u)});
 }
 function updateLesson(unitId:string,lessonId:string,update:(lesson:LessonGuide)=>LessonGuide){
  updateUnit(unitId,u=>({...u,lessons:u.lessons.map(l=>l.lessonId===lessonId?update(l):l)}));
 }
 function addLesson(moduleId:string,lessonId:string){
  const base:ClassTeacherGuides=guides??{version:1,courseCode,visibility:"teacher_only",units:[]};
  const fresh:LessonGuide={lessonId,preparation:"",workedAnswers:[{prompt:"",answer:""}],
   misconceptions:[],interventions:[],extensions:[]};
  const existing=base.units.find(unit=>unit.unitId===moduleId);
  onChange({...base,units:existing
   ? base.units.map(unit=>unit.unitId===moduleId?{...unit,lessons:[...unit.lessons,fresh]}:unit)
   : [...base.units,{unitId:moduleId,reviewStatus:"draft",teacherOverview:"",lessons:[fresh],assessments:[]}],
  });
 }
 function removeLesson(moduleId:string,lessonId:string){
  if(!guides)return;
  const units=guides.units.map(u=>u.unitId===moduleId
   ? {...u,lessons:u.lessons.filter(l=>l.lessonId!==lessonId)}:u).filter(u=>u.lessons.length>0);
  onChange(units.length?{...guides,units}:null);
 }
 return <section className="space-y-4 rounded border p-4" aria-label="Protected publisher teacher guide">
  <h3 className="text-lg font-semibold">Protected teacher guide</h3>
  <p className="text-sm">Publisher answers, preparation, interventions and misconceptions are stored separately from student lesson content. New entries must be completed and validated before saving. Review status is not automatically advanced.</p>
  {content.modules.map(module=>{
   const unit=guides?.units.find(item=>item.unitId===module.id);
   const unassigned=module.lessons.filter(lesson=>!unit?.lessons.some(g=>g.lessonId===lesson.id));
   return <section key={module.id} className="space-y-3 rounded border p-3">
    <h4 className="text-sm font-semibold">{module.title}</h4>
    {unit&&<label className="block text-sm">Instructor unit overview<textarea rows={3} maxLength={5000}
     value={unit.teacherOverview} className="mt-1 block w-full rounded border bg-background p-2"
     onChange={e=>updateUnit(module.id,u=>({...u,teacherOverview:e.target.value}))}/></label>}
    {unit?.lessons.map(guide=>{
     const lesson=module.lessons.find(item=>item.id===guide.lessonId);
     return <fieldset key={guide.lessonId} className="space-y-3 rounded border p-3">
      <legend className="px-2 text-sm font-semibold">{lesson?.title??guide.lessonId} · teacher only</legend>
      <label className="block text-sm">Instructor preparation<textarea rows={3} maxLength={5000}
       className="mt-1 block w-full rounded border bg-background p-2" value={guide.preparation}
       onChange={e=>updateLesson(module.id,guide.lessonId,l=>({...l,preparation:e.target.value}))}/></label>
      <h5 className="text-sm font-semibold">Worked answers (not student-facing)</h5>
      {guide.workedAnswers.map((worked,i)=><div className="grid gap-2 rounded border p-3" key={i}>
       <label className="block text-sm">Teacher prompt<textarea rows={2} maxLength={5000} value={worked.prompt}
        className="mt-1 block w-full rounded border bg-background p-2"
        onChange={e=>updateLesson(module.id,guide.lessonId,l=>({...l,workedAnswers:l.workedAnswers.map((a,j)=>i===j?{...a,prompt:e.target.value}:a)}))}/></label>
       <label className="block text-sm">Protected worked solution<textarea rows={3} maxLength={5000} value={worked.answer}
        className="mt-1 block w-full rounded border bg-background p-2"
        onChange={e=>updateLesson(module.id,guide.lessonId,l=>({...l,workedAnswers:l.workedAnswers.map((a,j)=>i===j?{...a,answer:e.target.value}:a)}))}/></label>
       {guide.workedAnswers.length>1&&<button type="button" className="justify-self-start rounded border px-2 py-1 text-xs"
        onClick={()=>updateLesson(module.id,guide.lessonId,l=>({...l,workedAnswers:l.workedAnswers.filter((_,j)=>j!==i)}))}>Remove worked answer</button>}
      </div>)}
      {guide.workedAnswers.length<15&&<button type="button" className="rounded border px-3 py-2 text-sm"
       onClick={()=>updateLesson(module.id,guide.lessonId,l=>({...l,workedAnswers:[...l.workedAnswers,{prompt:"",answer:""}]}))}>Add worked answer</button>}
      <label className="block text-sm">Likely misconceptions (one per line)<textarea rows={3} maxLength={50000}
       value={guide.misconceptions.join("\n")} className="mt-1 block w-full rounded border bg-background p-2"
       onChange={e=>updateLesson(module.id,guide.lessonId,l=>({...l,misconceptions:e.target.value.split("\n").map(x=>x.trim()).filter(Boolean)}))}/></label>
      <label className="block text-sm">Targeted interventions (one per line)<textarea rows={3} maxLength={50000}
       value={guide.interventions.join("\n")} className="mt-1 block w-full rounded border bg-background p-2"
       onChange={e=>updateLesson(module.id,guide.lessonId,l=>({...l,interventions:e.target.value.split("\n").map(x=>x.trim()).filter(Boolean)}))}/></label>
      <label className="block text-sm">Extensions (one per line, optional)<textarea rows={2} maxLength={50000}
       value={guide.extensions.join("\n")} className="mt-1 block w-full rounded border bg-background p-2"
       onChange={e=>updateLesson(module.id,guide.lessonId,l=>({...l,extensions:e.target.value.split("\n").map(x=>x.trim()).filter(Boolean)}))}/></label>
      <button type="button" className="rounded border px-2 py-1 text-xs"
       onClick={()=>removeLesson(module.id,guide.lessonId)}>Remove draft teacher guide</button>
     </fieldset>;
    })}
    {unassigned.length>0&&<label className="block text-sm">Add guidance for a lesson
     <select className="mt-1 block w-full rounded border bg-background p-2" value=""
      onChange={e=>{if(e.target.value)addLesson(module.id,e.target.value);}}>
      <option value="">Choose a lesson</option>
      {unassigned.map(lesson=><option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
     </select></label>}
   </section>;
  })}
  {guides?.units.length?<p className="text-xs">Teacher guide status: {guides.units.map(u=>u.reviewStatus).join(", ")}. Teacher or school approval is a separate institutional decision.</p>
   :<p className="text-sm">No protected teacher guide has been authored for this draft.</p>}
 </section>;
}
