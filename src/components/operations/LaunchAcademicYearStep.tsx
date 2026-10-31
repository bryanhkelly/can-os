import {useEffect,useState} from "react";
import {Link,useRouter} from "@tanstack/react-router";
import {getLaunchAcademicYearPlan,prepareLaunchAcademicYear} from "@/modules/programs/launch-year-preparation.functions";
import {schoolYearStructure} from "@/domain/school-year-structure";

type Plan=Awaited<ReturnType<typeof getLaunchAcademicYearPlan>>;

export function LaunchAcademicYearStep({programId}:{programId:string}){
 return <AcademicYearStep key={programId} programId={programId}/>;
}
function AcademicYearStep({programId}:{programId:string}){
 const [plan,setPlan]=useState<Plan|null>(null),[error,setError]=useState("");
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let current=true;
  void getLaunchAcademicYearPlan({data:{programId}}).then(value=>{if(current){setPlan(value);setError("");}})
   .catch(()=>{if(current)setError("Academic setup could not be loaded. Check your school access, then retry.");});
  return()=>{current=false;};
 },[programId,attempt]);
 if(!plan)return <section id="launch-academic-year" aria-label="Prepare your academic year" className="mt-5 rounded-xl border bg-card p-5">
  <h2 className="font-semibold">Prepare your academic year</h2>
  {error?<><p role="alert" className="mt-2 text-sm">{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)} className="mt-3 rounded border px-3 py-2 text-sm">Retry academic setup</button></>:<p role="status" className="mt-2 text-sm">Loading the school's saved academic setup…</p>}
 </section>;
 return <ReviewAcademicYear plan={plan}/>;
}

export function ReviewAcademicYear({plan}:{plan:Plan}){
 const router=useRouter();
 const [yearId,setYearId]=useState(plan.years.length===1?plan.years[0]!.id:"");
 const [scaleId,setScaleId]=useState(plan.gradeScales.length===1?plan.gradeScales[0]!.id:
  plan.gradeScales.find(scale=>scale.name==="Standard A–F")?.id??"standard");
 const [structure,setStructure]=useState(plan.recommendedStructure);
 const [weekdays,setWeekdays]=useState([1,2,3,4,5]);
 const [minutes,setMinutes]=useState(390),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [saved,setSaved]=useState(false);
 const existing=plan.years.find(year=>year.id===yearId);
 const dates=existing??plan.suggested;
 const proposed=schoolYearStructure(dates.startsOn,dates.endsOn,structure);
 async function prepare(){
  if(busy)return;
  setBusy(true);setError("");
  try{
   await prepareLaunchAcademicYear({data:{programId:plan.programId,
    ...(yearId?{schoolYearId:yearId}:{}),
    ...(scaleId==="standard"?{useStandardGradeScale:true}:{gradeScaleId:scaleId}),
    structure,instructionalDays:{weekdays,instructionalMinutes:minutes},
   }});
   setSaved(true);
   try{await router.invalidate();}catch{setError("The server accepted the academic setup command, but updated records could not be loaded. Reload the launch to verify the saved year; do not submit a duplicate.");}
  }catch(cause){setError(cause instanceof Error?cause.message:"Academic setup could not be saved. Retry to resume the same records.");}
  finally{setBusy(false);}
 }
 return <section id="launch-academic-year" aria-label="Prepare your academic year" className="mt-5 rounded-xl border bg-card p-5">
  <p className="text-xs font-semibold uppercase text-muted-foreground">School preparation · Academic year</p>
  <h2 className="mt-1 font-serif text-2xl">Prepare {plan.programName}'s academic year</h2>
  <p className="mt-2 text-sm">Review the proposed dates and pattern, then save the real school-year, term, grading-period and calendar records here.</p>
  {plan.years.length>0&&<label className="mt-3 block text-sm">Saved school year
   <select value={yearId} disabled={busy||saved} onChange={event=>setYearId(event.target.value)} className="ml-2 rounded border bg-background p-2">
    <option value="">Choose the saved school year</option>{plan.years.map(year=><option key={year.id} value={year.id}>{year.name} · {year.status}</option>)}
   </select>
  </label>}
  <p className="mt-3 rounded border p-3 text-sm"><strong>{existing?.name??plan.suggested.name}</strong><br/>{dates.startsOn} through {dates.endsOn}</p>
  <p className="mt-2 text-sm">{existing?"Keep saved grading and terms":`${structure==="semesters"?"Two semesters":"One full-year term"} · ${plan.gradeScales.find(scale=>scale.id===scaleId)?.name??"Standard A–F"}`} · {weekdays.map(day=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][day]).join(", ")} · {minutes} instructional minutes per day.</p>
  <details className="mt-3 rounded border p-3"><summary className="cursor-pointer text-sm font-semibold">Review recommended settings</summary>
   <div className="mt-3 space-y-3 text-sm">
    {!existing&&<label className="block">Grading scale <select value={scaleId} disabled={busy||saved} onChange={event=>setScaleId(event.target.value)} className="ml-2 rounded border bg-background p-2">
     <option value="standard">Standard A–F</option>{plan.gradeScales.map(scale=><option key={scale.id} value={scale.id}>{scale.name}</option>)}
    </select></label>}
    <label className="block">Term structure <select value={structure} disabled={busy||saved} onChange={event=>setStructure(event.target.value as typeof structure)} className="ml-2 rounded border bg-background p-2">
     <option value="full_year">One full-year term</option><option value="semesters" disabled={dates.startsOn===dates.endsOn}>Two semesters</option>
    </select></label>
    <p>{proposed.map(term=>`${term.name}: ${term.startsOn}–${term.endsOn}`).join(" · ")}. Existing terms and grading periods are preserved.</p>
    <fieldset disabled={busy||saved}><legend>Instructional weekdays, including home learning</legend><div className="mt-2 flex flex-wrap gap-3">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,index)=><label key={day} className="flex items-center gap-1">
     <input type="checkbox" checked={weekdays.includes(index)} onChange={event=>setWeekdays(current=>event.target.checked?[...current,index]:current.filter(value=>value!==index))}/>{day}
    </label>)}</div></fieldset>
    <label className="block">Instructional minutes per day <input type="number" min={1} max={1440} disabled={busy||saved} value={minutes} onChange={event=>setMinutes(Number(event.target.value))} className="ml-2 w-24 rounded border bg-background p-2"/></label>
   </div>
  </details>
  <p className="mt-3 text-xs text-muted-foreground">Existing calendar exceptions stay unchanged. Review local holidays and onsite schedules before activating the year. This preparation does not authorize school opening.</p>
  {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
  {saved?<div role="status" className="mt-4 rounded border p-3 text-sm"><p>Academic setup command accepted. Reload to verify the authoritative school-year and term records.</p><a href="#launch-first-class" className="mt-2 inline-block font-semibold underline">Continue to your first classroom →</a></div>:
   <button type="button" disabled={busy||Boolean(plan.years.length&&!existing)||!weekdays.length||!Number.isInteger(minutes)||minutes<1||minutes>1440} onClick={()=>void prepare()} className="mt-4 rounded bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy?"Preparing your academic year…":existing?.status==="active"?"Use this active school year":"Save reviewed academic setup"}</button>}
  <Link to="/operations/school-years" search={{siteId:plan.siteId,programId:plan.programId}} className="ml-3 inline-block text-sm underline">Adjust dates, holidays or detailed settings</Link>
 </section>;
}
