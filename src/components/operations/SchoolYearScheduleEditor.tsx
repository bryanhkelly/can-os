import { useState } from "react";
import { replaceStudioSchedulePeriods, type getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Snapshot = Awaited<ReturnType<typeof getSchoolYearStudio>>;

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
   <Field label="Day" className="w-24">
    <Select value={p.dayOfWeek} onChange={e=>change(i,"dayOfWeek",Number(e.target.value))}>
    {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,n)=><option key={n} value={n}>{d}</option>)}
    </Select>
   </Field>
   <Field label="Order" className="w-20">
    <Input type="number" min={1} value={p.sequence} onChange={e=>change(i,"sequence",Number(e.target.value))}/>
   </Field>
   <Field label="Label" className="w-32">
    <Input value={p.label} onChange={e=>change(i,"label",e.target.value)}/>
   </Field>
   <Field label="From" className="w-32">
    <Input type="time" value={p.startsAtLocal} onChange={e=>change(i,"startsAtLocal",e.target.value)}/>
   </Field>
   <Field label="Until" className="w-32">
    <Input type="time" value={p.endsAtLocal} onChange={e=>change(i,"endsAtLocal",e.target.value)}/>
   </Field>
   <Field label="Type" className="w-32">
    <Select value={p.type} onChange={e=>change(i,"type",e.target.value)}>
    {["instruction","break","lunch","chapel","advisory"].map(t=><option key={t} value={t}>{t}</option>)}
    </Select>
   </Field>
   <Button type="button" variant="ghost" size="sm" aria-label={`Remove period ${i+1}`} onClick={()=>setPeriods(rows=>rows.filter((_,n)=>n!==i))}>Remove</Button>
  </div>)}</div>
  <div className="mt-3 flex flex-wrap gap-2">
   <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>setPeriods(rows=>[...rows,{
    dayOfWeek:1,sequence:rows.filter(p=>p.dayOfWeek===1).length+1,
    label:"Instruction",startsAtLocal:"08:30",endsAtLocal:"09:30",type:"instruction",
   }])}>Add period</Button>
   <Button type="button" disabled={busy||periods.length===0} onClick={()=>run(()=>
    replaceStudioSchedulePeriods({data:{scheduleTemplateId:schedule.id,periods}}))}>Save schedule</Button>
  </div>
 </div>;
}
