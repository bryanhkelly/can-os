import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import {
 getSchoolYearStudio, createStudioGradeScale, createStudioYear, addStudioTerm, addStudioGradingPeriod, prepareStudioYear,
 addStudioCalendar, addStudioCalendarDay, removeStudioCalendarDay, populateStudioInstructionalDays, addStudioSchedule, replaceStudioSchedulePeriods, activateStudioYear,
} from "@/modules/academic-time/school-year-studio.functions";
import { suggestedSchoolYear } from "@/domain/school-year-defaults";
import { schoolYearStructure } from "@/domain/school-year-structure";
import { WorkspaceShell } from "@/components/workspace";

type Snapshot=Awaited<ReturnType<typeof getSchoolYearStudio>>;
export function SchoolYearStudioWorkspace({data}:{data:Snapshot}){
 const router=useRouter();
 const selection=Route.useSearch();
 const [siteId,setSiteId]=useState(selection.siteId??data.programs.find(p=>p.id===selection.programId)?.siteId??data.sites[0]?.id??"");
 const [programId,setProgramId]=useState(selection.programId??"");
 const [scaleId,setScaleId]=useState(()=>{
  const selectedSite=data.sites.find(site=>site.id===siteId);
  const scales=data.gradeScales.filter(scale=>scale.organizationId===selectedSite?.organizationId);
  return scales.length===1?scales[0]!.id:"";
 });
 const [newScaleName,setNewScaleName]=useState("Standard A–F");
 // Prefer the selected Program's persisted target; no URL date or browser
 // checklist becomes canonical planning state. Every field stays editable.
 const [suggestedYear]=useState(()=>suggestedSchoolYear(new Date(),
  data.programs.find(program=>program.id===selection.programId)?.targetOpeningDate));
 const [name,setName]=useState(suggestedYear.name);
 const [key,setKey]=useState(suggestedYear.key);
 const [start,setStart]=useState(suggestedYear.startsOn),[end,setEnd]=useState(suggestedYear.endsOn);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function run(operation:()=>Promise<unknown>){
  setBusy(true);setError("");setNotice("");
  try{await operation();await router.invalidate();setNotice("Saved to school records.");}
  catch(e){setError(e instanceof Error?e.message:"Unable to save");}finally{setBusy(false);}
 }
 const scopedPrograms=data.programs.filter(p=>p.siteId===siteId);
 const site=data.sites.find(s=>s.id===siteId);
 const siteScales=data.gradeScales.filter(scale=>scale.organizationId===site?.organizationId);
 const targetOpeningDate=scopedPrograms.find(program=>program.id===programId)?.targetOpeningDate;
 const selectedScaleId=siteScales.some(scale=>scale.id===scaleId)?scaleId:
  siteScales.length===1?siteScales[0]!.id:"";
 return <WorkspaceShell eyebrow="CAN OS · Academic operations" title="School-year studio"
  subtitle="Configure site-owned school years, terms, grading periods and academic calendars. Activation requires readiness checks."
  actions={<Link to="/operations" search={{siteId:undefined,programId:undefined}} className="rounded-lg border px-3 py-2 text-sm">Operations</Link>}>
  {error&&<p role="alert" className="mt-5 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
  {notice&&<p role="status" className="mt-5 rounded-lg border p-3 text-sm">{notice}</p>}
  <section className="mt-8 rounded-xl border bg-card p-5">
   <h2 className="font-serif text-2xl">Create a school year</h2>
   <div className="mt-4 grid gap-3 sm:grid-cols-2">
    <label className="text-sm">Site<select value={siteId} onChange={e=>{setSiteId(e.target.value);setProgramId("");setScaleId("");}} className="mt-1 w-full rounded border p-2 bg-background">{data.sites.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label className="text-sm">Program (optional)<select value={programId} onChange={e=>setProgramId(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"><option value="">Site-wide</option>{scopedPrograms.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <label className="text-sm">Year name<input value={name} onChange={e=>setName(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm">Year key<input value={key} onChange={e=>setKey(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm">Starts<input type="date" value={start} onChange={e=>setStart(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm">Ends<input type="date" value={end} onChange={e=>setEnd(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"/></label>
    <label className="text-sm sm:col-span-2">Grading scale<select value={selectedScaleId} onChange={e=>setScaleId(e.target.value)} className="mt-1 w-full rounded border p-2 bg-background"><option value="">Choose scale</option>{siteScales.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   </div>
   {targetOpeningDate&&<div className="mt-3 rounded border p-3 text-sm">
    <p>Target opening: {targetOpeningDate}. Suggested dates are planning defaults; review terms,
     instructional days and local calendar requirements before activation.</p>
    <button type="button" disabled={busy} onClick={()=>{
      const suggested=suggestedSchoolYear(new Date(),targetOpeningDate);
      setName(suggested.name);setKey(suggested.key);setStart(suggested.startsOn);setEnd(suggested.endsOn);
    }} className="mt-2 rounded border px-3 py-2 text-sm disabled:opacity-50">Use saved target opening date</button>
   </div>}
   {!siteScales.length&&<p role="status" className="mt-3 text-sm">
    This school needs a grading scale. Create the standard scale below, then continue with its school year.
   </p>}
   <div className="mt-3 flex flex-wrap items-end gap-2">
    <label className="text-xs">New grading scale name
      <input value={newScaleName} onChange={e=>setNewScaleName(e.target.value)}
        className="mt-1 block rounded border bg-background p-2 text-sm"/>
    </label>
    <button type="button" disabled={busy||!site?.organizationId||!newScaleName.trim()}
      onClick={()=>run(async()=>{
        const result=await createStudioGradeScale({data:{
          organizationId:site!.organizationId,name:newScaleName}});
        setScaleId(result.gradeScaleId);
      })}
      className="rounded border px-3 py-2 text-sm disabled:opacity-50">Create standard A–F scale</button>
   </div>
   <button disabled={busy||!siteId||!selectedScaleId} onClick={()=>run(()=>createStudioYear({data:{siteId,...(programId?{programId}:{}),gradeScaleId:selectedScaleId,key,name,startsOn:start,endsOn:end}}))} className="mt-4 rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Create school year</button>
  </section>
  <h2 className="mt-10 font-serif text-2xl">School years</h2>
  <div className="mt-4 space-y-4">{data.years.filter(y=>!siteId||y.siteId===siteId).map(y=><YearCard key={y.id} year={y} busy={busy} run={run}/>)}
  {!data.years.length&&<p className="rounded-xl border p-5 text-sm">No school years have been configured at your sites.</p>}</div>
 </WorkspaceShell>;
}
function YearCard({year:y,busy,run}:{year:Snapshot["years"][number],busy:boolean,run:(fn:()=>Promise<unknown>)=>Promise<void>}){
 const [structure,setStructure]=useState<"full_year"|"semesters">("full_year");
 const proposedTerms=y.status==="draft"?schoolYearStructure(y.startsOn,y.endsOn,structure):[];
 const [termName,setTermName]=useState("Fall semester"),[termKey,setTermKey]=useState("fall");
 const [termStart,setTermStart]=useState(y.startsOn),[termEnd,setTermEnd]=useState(y.endsOn);
 const [day,setDay]=useState(y.startsOn),[dayType,setDayType]=useState<"instructional"|"holiday"|"closure"|"special"|"makeup">("holiday");
 const [title,setTitle]=useState("");
 const [weekdays,setWeekdays]=useState([1,2,3,4,5]);
 const [dailyMinutes,setDailyMinutes]=useState(390);
 return <article className="rounded-xl border bg-card p-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-semibold">{y.name}</h3><p className="mt-1 text-sm text-muted-foreground">{y.startsOn} to {y.endsOn} · {y.status}</p></div>
   <button disabled={busy||y.status==="active"} onClick={()=>run(()=>activateStudioYear({data:{schoolYearId:y.id}}))} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Activate year</button>
  </div>
  {y.status==="draft"&&<section aria-label="Recommended academic setup" className="mt-4 rounded-lg border p-4">
   <h4 className="font-semibold">Prepare your academic year</h4>
   {!y.terms.length&&<label className="mt-2 block text-sm">Term structure
    <select value={structure} onChange={e=>setStructure(e.target.value as typeof structure)} className="ml-2 rounded border bg-background p-2">
     <option value="full_year">One full-year term</option>
     <option value="semesters" disabled={y.startsOn===y.endsOn}>Two semesters</option>
    </select>
   </label>}
   <p className="mt-2 text-sm">{y.terms.length?"Keep the existing terms and grading periods.":proposedTerms.map(term=>`${term.name}: ${term.startsOn}–${term.endsOn}`).join(" · ")}</p>
   <p className="mt-2 text-sm text-muted-foreground">Create missing terms, grading periods and an instructional calendar. Add ordinary instructional days using the reviewed pattern below. Existing records, holidays and closures stay unchanged. Review local holidays and any onsite schedule before activation.</p>
   <fieldset className="mt-3"><legend className="text-sm font-semibold">Recommended instructional weekdays</legend>
    <div className="mt-2 flex flex-wrap gap-3">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,index)=><label key={day} className="flex items-center gap-1 text-sm">
     <input type="checkbox" checked={weekdays.includes(index)} onChange={e=>setWeekdays(current=>e.target.checked?[...current,index]:current.filter(value=>value!==index))}/>{day}
    </label>)}</div>
   </fieldset>
   <label className="mt-3 block text-sm">Instructional minutes per day
    <input type="number" min={1} max={1440} value={dailyMinutes} onChange={e=>setDailyMinutes(Number(e.target.value))} className="ml-2 w-24 rounded border bg-background p-2"/>
   </label>
   <button type="button" disabled={busy||!weekdays.length||!Number.isInteger(dailyMinutes)||dailyMinutes<1||dailyMinutes>1440} onClick={()=>run(()=>prepareStudioYear({data:{schoolYearId:y.id,structure,instructionalDays:{weekdays,instructionalMinutes:dailyMinutes}}}))} className="mt-3 rounded bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Prepare academic year and instructional days</button>
  </section>}
  <div className="mt-5 grid gap-4 lg:grid-cols-2">
   <section className="rounded-lg border p-4"><h4 className="font-semibold">Terms and grading periods</h4>
    {y.terms.map((t,i)=><div key={t.id} className="mt-3 rounded-md bg-muted p-3 text-sm">
     <strong>{t.name}</strong><p>{t.startsOn}–{t.endsOn}</p>
     <p>{t.periods.length} grading period(s)</p>
     <button disabled={busy} className="mt-2 rounded border px-2 py-1 text-xs" onClick={()=>run(()=>addStudioGradingPeriod({data:{termId:t.id,key:"grading-"+(t.periods.length+1),name:"Grading period "+(t.periods.length+1),sequence:t.periods.length+1,startsOn:t.startsOn,endsOn:t.endsOn}}))}>Add grading period</button>
    </div>)}
    <div className="mt-3 grid grid-cols-2 gap-2"><input aria-label="Term name" value={termName} onChange={e=>setTermName(e.target.value)} className="rounded border p-2 text-sm bg-background"/><input aria-label="Term key" value={termKey} onChange={e=>setTermKey(e.target.value)} className="rounded border p-2 text-sm bg-background"/>
    <input type="date" aria-label="Term start" value={termStart} onChange={e=>setTermStart(e.target.value)} className="rounded border p-2 text-sm bg-background"/><input type="date" aria-label="Term end" value={termEnd} onChange={e=>setTermEnd(e.target.value)} className="rounded border p-2 text-sm bg-background"/></div>
    <button disabled={busy} className="mt-3 rounded border px-3 py-2 text-sm" onClick={()=>run(()=>addStudioTerm({data:{schoolYearId:y.id,key:termKey,name:termName,sequence:y.terms.length+1,startsOn:termStart,endsOn:termEnd}}))}>Add term</button>
   </section>
   <section className="rounded-lg border p-4"><h4 className="font-semibold">Calendar and schedule</h4>
    <p className="mt-2 text-sm">{y.calendars.length} calendar(s), {y.schedules.length} schedule(s)</p>
    {!y.calendars.length&&<button disabled={busy} className="mt-3 rounded border px-3 py-2 text-sm" onClick={()=>run(()=>addStudioCalendar({data:{schoolYearId:y.id}}))}>Create calendar</button>}
    {y.calendars.map(cal=><div key={cal.id} className="mt-3 rounded bg-muted p-3 text-sm"><p className="font-medium">{cal.name}</p>
     <div className="mt-3 rounded-lg border bg-background p-3">
      <p className="text-xs font-semibold">Generate instructional days</p>
      <div className="mt-2 flex flex-wrap gap-2">
       {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,n)=><label key={n} className="flex items-center gap-1 text-xs">
        <input type="checkbox" checked={weekdays.includes(n)} onChange={e=>setWeekdays(current=>
         e.target.checked?[...current,n]:current.filter(day=>day!==n))}/>{d}
       </label>)}
      </div>
      <label className="mt-2 block text-xs">Instructional minutes per day
       <input type="number" min={1} max={1440} value={dailyMinutes} onChange={e=>setDailyMinutes(Number(e.target.value))}
        className="ml-2 w-24 rounded border p-1"/></label>
      <button type="button" disabled={busy||weekdays.length===0}
       onClick={()=>run(()=>populateStudioInstructionalDays({data:{
        academicCalendarId:cal.id,weekdays,instructionalMinutes:dailyMinutes}}))}
       className="mt-2 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">
       Populate school year
      </button>
      <p className="mt-1 text-xs text-muted-foreground">Existing holidays, closures and special days will not be overwritten.</p>
     </div>
     <div className="mt-2 flex flex-wrap gap-2"><input type="date" aria-label="Calendar date" value={day} onChange={e=>setDay(e.target.value)} className="rounded border p-2 bg-background"/>
      <select aria-label="Day type" value={dayType} onChange={e=>setDayType(e.target.value as typeof dayType)} className="rounded border p-2 bg-background">{["instructional","holiday","closure","special","makeup"].map(v=><option key={v} value={v}>{v}</option>)}</select>
      <input aria-label="Day title" placeholder="Optional description" value={title} onChange={e=>setTitle(e.target.value)} className="rounded border p-2 bg-background"/></div>
     <button disabled={busy} className="mt-2 rounded border px-3 py-2 text-sm" onClick={()=>run(()=>addStudioCalendarDay({data:{academicCalendarId:cal.id,calendarDate:day,type:dayType,...(title?{title}:{})}}))}>Save calendar day</button>
     <div className="mt-3 space-y-1">
       {cal.days.map(entry=><div key={entry.id} className="flex items-center justify-between gap-2 border-t pt-2 text-xs">
        <span>{entry.calendarDate} · {entry.type}{entry.title?" · "+entry.title:""}</span>
        <button type="button" disabled={busy} className="underline"
         onClick={()=>run(()=>removeStudioCalendarDay({data:{dayId:entry.id}}))}>Remove</button>
       </div>)}
     </div>
    </div>)}
    {y.schedules.map(schedule=><ScheduleEditor key={schedule.id} schedule={schedule} run={run} busy={busy}/>)}
    {!y.schedules.length&&<button disabled={busy} className="mt-3 rounded border px-3 py-2 text-sm" onClick={()=>run(()=>addStudioSchedule({data:{schoolYearId:y.id,...(y.programId?{programId:y.programId}:{}),name:"Standard instructional day",effectiveFrom:y.startsOn}}))}>Create weekday schedule</button>}
   </section>
  </div>
 </article>;
}

function ScheduleEditor({schedule,busy,run}:{
 schedule:Snapshot["years"][number]["schedules"][number],
 busy:boolean,run:(fn:()=>Promise<unknown>)=>Promise<void>
}){
 const [periods,setPeriods]=useState(schedule.periods.map(p=>({
  dayOfWeek:p.dayOfWeek,sequence:p.sequence,label:p.label,
  startsAtLocal:p.startsAtLocal.slice(0,5),endsAtLocal:p.endsAtLocal.slice(0,5),
  type:p.type as "instruction"|"break"|"lunch"|"chapel"|"advisory",
 })));
 function change(index:number,key:keyof (typeof periods)[number],value:string|number){
  setPeriods(items=>items.map((p,i)=>i===index?{...p,[key]:value}:p));
 }
 return <div className="mt-4 rounded-lg border p-3">
  <h5 className="font-semibold">{schedule.name}</h5>
  <p className="mt-1 text-xs text-muted-foreground">Edit the actual recurring periods. Changes affect the school's bell schedule.</p>
  <div className="mt-3 space-y-2">{periods.map((p,i)=><div key={i} className="flex flex-wrap items-end gap-2 border-t pt-2">
   <label className="text-xs">Day<select value={p.dayOfWeek} onChange={e=>change(i,"dayOfWeek",Number(e.target.value))} className="block rounded border bg-background p-1">
    {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,n)=><option key={n} value={n}>{d}</option>)}
   </select></label>
   <label className="text-xs">Order<input type="number" min={1} value={p.sequence} onChange={e=>change(i,"sequence",Number(e.target.value))} className="block w-14 rounded border bg-background p-1"/></label>
   <label className="text-xs">Label<input value={p.label} onChange={e=>change(i,"label",e.target.value)} className="block w-28 rounded border bg-background p-1"/></label>
   <label className="text-xs">From<input type="time" value={p.startsAtLocal} onChange={e=>change(i,"startsAtLocal",e.target.value)} className="block rounded border bg-background p-1"/></label>
   <label className="text-xs">Until<input type="time" value={p.endsAtLocal} onChange={e=>change(i,"endsAtLocal",e.target.value)} className="block rounded border bg-background p-1"/></label>
   <label className="text-xs">Type<select value={p.type} onChange={e=>change(i,"type",e.target.value)} className="block rounded border bg-background p-1">
    {["instruction","break","lunch","chapel","advisory"].map(t=><option key={t} value={t}>{t}</option>)}
   </select></label>
   <button type="button" onClick={()=>setPeriods(rows=>rows.filter((_,n)=>n!==i))} className="text-xs underline">Remove</button>
  </div>)}</div>
  <div className="mt-3 flex flex-wrap gap-2">
   <button type="button" disabled={busy} onClick={()=>setPeriods(rows=>[...rows,{
    dayOfWeek:1,sequence:rows.filter(p=>p.dayOfWeek===1).length+1,
    label:"Instruction",startsAtLocal:"08:30",endsAtLocal:"09:30",type:"instruction",
   }])} className="rounded border px-3 py-2 text-xs">Add period</button>
   <button type="button" disabled={busy||periods.length===0} onClick={()=>run(()=>
    replaceStudioSchedulePeriods({data:{scheduleTemplateId:schedule.id,periods}}))}
    className="rounded bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">Save schedule</button>
  </div>
 </div>;
}
