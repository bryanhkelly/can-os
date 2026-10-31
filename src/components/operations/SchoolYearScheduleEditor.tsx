import { useState } from "react";
import type { getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
type Snapshot = Awaited<ReturnType<typeof getSchoolYearStudio>>;
import { replaceStudioSchedulePeriods } from "@/modules/academic-time/school-year-studio.functions";

export function SchoolYearScheduleEditor({schedule,busy,run}:{
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
