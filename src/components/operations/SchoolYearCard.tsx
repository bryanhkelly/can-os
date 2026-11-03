import { useState } from "react";
import { schoolYearStructure } from "@/domain/school-year-structure";
import { addStudioTerm, addStudioGradingPeriod, prepareStudioYear, addStudioCalendar, addStudioCalendarDay, removeStudioCalendarDay, populateStudioInstructionalDays, activateStudioYear, type getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { SchoolYearScheduleSetup } from "@/components/operations/SchoolYearScheduleSetup";
import { useRouter } from "@tanstack/react-router";
import { SchoolYearScheduleEditor } from "@/components/operations/SchoolYearScheduleEditor";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Snapshot = Awaited<ReturnType<typeof getSchoolYearStudio>>;

export function SchoolYearCard({year:y,busy,run}:{year:Snapshot["years"][number],busy:boolean,run:(fn:()=>Promise<unknown>)=>Promise<void>}){
 const router=useRouter();
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
   <Button variant="outline" disabled={busy||y.status==="active"} onClick={()=>run(()=>activateStudioYear({data:{schoolYearId:y.id}}))}>Activate year</Button>
  </div>
  {y.status==="draft"&&<section aria-label="Recommended academic setup" className="mt-4 rounded-lg border p-4">
   <h4 className="font-semibold">Prepare your academic year</h4>
   {!y.terms.length&&<Field className="mt-2 max-w-sm" label="Term structure">
    <Select value={structure} onChange={e=>setStructure(e.target.value as typeof structure)}>
     <option value="full_year">One full-year term</option>
     <option value="semesters" disabled={y.startsOn===y.endsOn}>Two semesters</option>
    </Select>
   </Field>}
   <p className="mt-2 text-sm">{y.terms.length?"Keep the existing terms and grading periods.":proposedTerms.map(term=>`${term.name}: ${term.startsOn}–${term.endsOn}`).join(" · ")}</p>
   <p className="mt-2 text-sm text-muted-foreground">Create missing terms, grading periods and an instructional calendar. Add ordinary instructional days using the reviewed pattern below. Existing records, holidays and closures stay unchanged. Review local holidays and any onsite schedule before activation.</p>
   <fieldset className="mt-3"><legend className="text-sm font-semibold">Recommended instructional weekdays</legend>
    <div className="mt-2 flex flex-wrap gap-3">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day,index)=><Label key={day} className="flex items-center gap-2 text-sm">
     <Checkbox checked={weekdays.includes(index)} onChange={e=>setWeekdays(current=>e.target.checked?[...current,index]:current.filter(value=>value!==index))}/>{day}
    </Label>)}</div>
   </fieldset>
   <Field className="mt-3 max-w-xs" label="Instructional minutes per day">
    <Input type="number" min={1} max={1440} value={dailyMinutes} onChange={e=>setDailyMinutes(Number(e.target.value))}/>
   </Field>
   <Button type="button" disabled={busy||!weekdays.length||!Number.isInteger(dailyMinutes)||dailyMinutes<1||dailyMinutes>1440} onClick={()=>run(()=>prepareStudioYear({data:{schoolYearId:y.id,structure,instructionalDays:{weekdays,instructionalMinutes:dailyMinutes}}}))} className="mt-3">Prepare academic year and instructional days</Button>
  </section>}
  <div className="mt-5 grid gap-4 lg:grid-cols-2">
   <section className="rounded-lg border p-4"><h4 className="font-semibold">Terms and grading periods</h4>
    {y.terms.map(t=><div key={t.id} className="mt-3 rounded-md bg-muted p-3 text-sm">
     <strong>{t.name}</strong><p>{t.startsOn}–{t.endsOn}</p>
     <p>{t.periods.length} grading period(s)</p>
     <Button size="sm" variant="outline" disabled={busy} className="mt-2" onClick={()=>run(()=>addStudioGradingPeriod({data:{termId:t.id,key:"grading-"+(t.periods.length+1),name:"Grading period "+(t.periods.length+1),sequence:t.periods.length+1,startsOn:t.startsOn,endsOn:t.endsOn}}))}>Add grading period</Button>
    </div>)}
    <div className="mt-3 grid grid-cols-2 gap-2">
     <Field label="Term name"><Input value={termName} onChange={e=>setTermName(e.target.value)}/></Field>
     <Field label="Term key"><Input value={termKey} onChange={e=>setTermKey(e.target.value)}/></Field>
     <Field label="Term start"><Input type="date" value={termStart} onChange={e=>setTermStart(e.target.value)}/></Field>
     <Field label="Term end"><Input type="date" value={termEnd} onChange={e=>setTermEnd(e.target.value)}/></Field>
    </div>
    <Button variant="outline" disabled={busy} className="mt-3" onClick={()=>run(()=>addStudioTerm({data:{schoolYearId:y.id,key:termKey,name:termName,sequence:y.terms.length+1,startsOn:termStart,endsOn:termEnd}}))}>Add term</Button>
   </section>
   <section className="rounded-lg border p-4"><h4 className="font-semibold">Calendar and schedule</h4>
    <p className="mt-2 text-sm">{y.calendars.length} calendar(s), {y.schedules.length} schedule(s)</p>
    {!y.calendars.length&&<Button variant="outline" disabled={busy} className="mt-3" onClick={()=>run(()=>addStudioCalendar({data:{schoolYearId:y.id}}))}>Create calendar</Button>}
    {y.calendars.map(cal=><div key={cal.id} className="mt-3 rounded bg-muted p-3 text-sm"><p className="font-medium">{cal.name}</p>
     <div className="mt-3 rounded-lg border bg-background p-3">
      <p className="text-xs font-semibold">Generate instructional days</p>
      <div className="mt-2 flex flex-wrap gap-2">
       {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,n)=><Label key={n} className="flex items-center gap-2 text-xs">
        <Checkbox checked={weekdays.includes(n)} onChange={e=>setWeekdays(current=>
         e.target.checked?[...current,n]:current.filter(day=>day!==n))}/>{d}
       </Label>)}
      </div>
      <Field className="mt-2 max-w-xs" label="Instructional minutes per day">
       <Input type="number" min={1} max={1440} value={dailyMinutes} onChange={e=>setDailyMinutes(Number(e.target.value))}/>
      </Field>
      <Button type="button" variant="outline" size="sm" disabled={busy||weekdays.length===0}
       onClick={()=>run(()=>populateStudioInstructionalDays({data:{
        academicCalendarId:cal.id,weekdays,instructionalMinutes:dailyMinutes}}))}
       className="mt-2">
       Populate school year
      </Button>
      <p className="mt-1 text-xs text-muted-foreground">Existing holidays, closures and special days will not be overwritten.</p>
     </div>
     <div className="mt-2 grid gap-2 sm:grid-cols-3">
      <Field label="Calendar date"><Input type="date" value={day} onChange={e=>setDay(e.target.value)}/></Field>
      <Field label="Day type"><Select value={dayType} onChange={e=>setDayType(e.target.value as typeof dayType)}>{["instructional","holiday","closure","special","makeup"].map(v=><option key={v} value={v}>{v}</option>)}</Select></Field>
      <Field label="Day title (optional)"><Input placeholder="Optional description" value={title} onChange={e=>setTitle(e.target.value)}/></Field>
     </div>
     <Button variant="outline" disabled={busy} className="mt-2" onClick={()=>run(()=>addStudioCalendarDay({data:{academicCalendarId:cal.id,calendarDate:day,type:dayType,...(title?{title}:{})}}))}>Save calendar day</Button>
     <div className="mt-3 space-y-1">
       {cal.days.map(entry=><div key={entry.id} className="flex items-center justify-between gap-2 border-t pt-2 text-xs">
        <span>{entry.calendarDate} · {entry.type}{entry.title?" · "+entry.title:""}</span>
        <Button type="button" variant="ghost" size="sm" disabled={busy}
         onClick={()=>run(()=>removeStudioCalendarDay({data:{dayId:entry.id}}))}>Remove</Button>
       </div>)}
     </div>
    </div>)}
    {y.schedules.map(schedule=><SchoolYearScheduleEditor key={schedule.id} schedule={schedule} run={run} busy={busy}/>)}
    {!y.schedules.length&&<SchoolYearScheduleSetup schoolYearId={y.id} programId={y.programId??undefined} startsOn={y.startsOn} endsOn={y.endsOn} timezone={y.timezone} disabled={busy} changed={()=>router.invalidate()}/>}
   </section>
  </div>
 </article>;
}
