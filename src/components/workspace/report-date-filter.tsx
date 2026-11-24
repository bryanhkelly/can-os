import { useState } from "react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resolveReportDateRange,type ReportDateRange } from "./report-date-range";
export function ReportDateFilter({initial,maxDays,onApply,disabled=false}:{initial:ReportDateRange;maxDays:number;onApply:(range:ReportDateRange)=>void;disabled?:boolean}){
  const [draft,setDraft]=useState(initial);
  const valid=resolveReportDateRange(draft,maxDays,new Date())!==null;
  return <form className="flex flex-wrap items-end gap-3" aria-label="Reporting date range"
    onSubmit={event=>{event.preventDefault();if(valid&&!disabled)onApply(draft);}}>
    <Field label="From (UTC, inclusive)" required><Input type="date" value={draft.fromDay} disabled={disabled} onChange={e=>setDraft(d=>({...d,fromDay:e.target.value}))}/></Field>
    <Field label="Until (UTC, exclusive)" required><Input type="date" value={draft.untilDay} disabled={disabled} onChange={e=>setDraft(d=>({...d,untilDay:e.target.value}))}/></Field>
    <Button type="submit" disabled={disabled||!valid}>Apply dates</Button>
    <p className="basis-full text-xs text-muted-foreground" role={!valid?"status":undefined}>Choose a completed UTC date range of up to {maxDays} days. {!valid&&"Enter valid dates in chronological order."}</p>
  </form>;
}
