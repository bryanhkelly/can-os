import type {ReactNode} from "react";
import {useId} from "react";
import {Checkbox,Radio} from "@/components/ui/choice";
import {Label} from "@/components/ui/label";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {QueryState} from "./query-state";
import {EmptyState} from "./empty-state";
export interface EntityPickerOption { id:string; label:string; detail?:ReactNode; disabled?:boolean }
/** Controlled, accessible native selection. Owners supply an authorized result
 * window and selected IDs; filtering/pagination cannot silently clear selection. */
export function EntityPicker({label,options,query,onQueryChange,selected,onChange,multiple=false,disabled=false,loading,error,onRetry,pagination}:{
 label:string;options:readonly EntityPickerOption[];query:string;onQueryChange:(query:string)=>void;
 selected:readonly string[];onChange:(ids:readonly string[])=>void;multiple?:boolean;disabled?:boolean;
 loading?:string;error?:string;onRetry?:()=>void;pagination?:ReactNode;
}){
 const id=useId();
 function toggle(option:EntityPickerOption,checked:boolean){
  if(disabled||option.disabled)return;
  onChange(multiple?(checked?[...new Set([...selected,option.id])]:selected.filter(key=>key!==option.id)):(checked?[option.id]:selected));
 }
 return <fieldset disabled={disabled} className="min-w-0 space-y-3">
  <legend className="text-sm font-semibold">{label}</legend>
  <Field label={"Search "+label.toLowerCase()}><Input type="search" value={query} onChange={e=>onQueryChange(e.target.value)}/></Field>
  <p role="status" className="text-xs text-muted-foreground">{selected.length} selected</p>
  <QueryState loading={loading} error={error} onRetry={onRetry} isEmpty={!options.length} empty={<EmptyState kind="matches"/>}>
   <div className="divide-y border bg-card">{options.map(option=><Label key={option.id} className="flex min-w-0 items-start gap-3 p-3 text-sm">
    {multiple?<Checkbox checked={selected.includes(option.id)} disabled={option.disabled} onChange={e=>toggle(option,e.target.checked)}/>:<Radio name={id} value={option.id} checked={selected.includes(option.id)} disabled={option.disabled} onChange={e=>toggle(option,e.target.checked)}/>}
    <span className="min-w-0 [overflow-wrap:anywhere]"><span className="block font-medium">{option.label}</span>{option.detail&&<span className="block text-xs text-muted-foreground">{option.detail}</span>}</span>
   </Label>)}</div>
  </QueryState>
  {pagination}
 </fieldset>;
}
