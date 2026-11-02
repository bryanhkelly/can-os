import { useState } from "react";
import type { getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
type Snapshot = Awaited<ReturnType<typeof getSchoolYearStudio>>;
import { schoolYearStructure } from "@/domain/school-year-structure";
import { addStudioTerm, addStudioGradingPeriod, prepareStudioYear, addStudioCalendar, addStudioCalendarDay, removeStudioCalendarDay, populateStudioInstructionalDays, addStudioSchedule, activateStudioYear } from "@/modules/academic-time/school-year-studio.functions";
import { SchoolYearScheduleEditor } from "@/components/operations/SchoolYearScheduleEditor";

export function SchoolYearCard({year:y,busy,run}:{year:Snapshot["years"][number],busy:boolean,run:(fn:()=>Promise<unknown>)=>Promise<void>}){
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
    {y.schedules.map(schedule=><SchoolYearScheduleEditor key={schedule.id} schedule={schedule} run={run} busy={busy}/>)}
    {!y.schedules.length&&<button disabled={busy} className="mt-3 rounded border px-3 py-2 text-sm" onClick={()=>run(()=>addStudioSchedule({data:{schoolYearId:y.id,...(y.programId?{programId:y.programId}:{}),name:"Standard instructional day",effectiveFrom:y.startsOn}}))}>Create weekday schedule</button>}
   </section>
  </div>
 </article>;
}

