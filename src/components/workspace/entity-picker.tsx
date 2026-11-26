import type {ReactNode} from "react";
import {useId} from "react";
import {Check} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Checkbox,Radio} from "@/components/ui/choice";
import {Label} from "@/components/ui/label";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {QueryState} from "./query-state";
import {EmptyState} from "./empty-state";
export interface EntityPickerOption { id:string; label:string; detail?:ReactNode; disabled?:boolean }
/** Controlled, accessible native selection. Owners supply an authorized result
 * window and selected IDs; filtering/pagination cannot silently clear selection. */
export function EntityPicker({label,options,query,onQueryChange,selected,onChange,multiple=false,disabled=false,loading,error,onRetry,pagination,searchLabel,searchDescription,empty,selectionSummary,mode="choice",resultsClassName}:{
 label:string;options:readonly EntityPickerOption[];query:string;onQueryChange:(query:string)=>void;
 selected:readonly string[];onChange:(ids:readonly string[])=>void;multiple?:boolean;disabled?:boolean;
 loading?:string;error?:string;onRetry?:()=>void;pagination?:ReactNode;
 searchLabel?:string;searchDescription?:string;empty?:ReactNode;selectionSummary?:ReactNode;mode?:"choice"|"single-action";resultsClassName?:string;
}){
 function toggle(option:EntityPickerOption,checked:boolean){
  if(disabled||option.disabled)return;
  onChange(multiple&&mode==="choice"?(checked?[...new Set([...selected,option.id])]:selected.filter(key=>key!==option.id)):(checked?[option.id]:selected));
 }
 return <fieldset disabled={disabled} className="min-w-0 space-y-3">
  <legend className="text-sm font-semibold">{label}</legend>
  <Field label={searchLabel??("Search "+label.toLowerCase())} description={searchDescription}><Input type="search" value={query} onChange={e=>onQueryChange(e.target.value)}/></Field>
  {selectionSummary===undefined&&<p role="status" className="text-xs text-muted-foreground">{selected.length} selected</p>}
  <QueryState loading={loading} error={error} onRetry={onRetry} isEmpty={!options.length} empty={empty??<EmptyState kind="matches"/>}>
   <EntitySelectionResults options={options} selected={selected} multiple={multiple} mode={mode} disabled={disabled} onToggle={(id,checked)=>{const option=options.find(row=>row.id===id);if(option)toggle(option,checked);}} className={resultsClassName}/>
  </QueryState>
  {pagination}
  {selectionSummary!==undefined&&<p role="status" className="text-sm">{selectionSummary}</p>}
 </fieldset>;
}

/** Shared result list for scoped selectors with either an internal or external search.
 * Toggle callbacks are item-level so owners can use functional state updates. */
export function EntitySelectionResults({options,selected,onToggle,multiple=false,disabled=false,mode="choice",className}:{
 options:readonly EntityPickerOption[];selected:readonly string[];onToggle:(id:string,checked:boolean)=>void;
 multiple?:boolean;disabled?:boolean;mode?:"choice"|"single-action";className?:string;
}){
 const id=useId();
 return <div className={"divide-y border bg-card "+(className??"")}>{options.map(option=>mode==="single-action"?<div key={option.id}><Button type="button" variant={selected.includes(option.id)?"secondary":"ghost"} disabled={disabled||option.disabled} aria-pressed={selected.includes(option.id)} onClick={()=>onToggle(option.id,true)} className="h-auto w-full justify-start whitespace-normal text-left">
      {selected.includes(option.id)&&<Check aria-hidden="true"/>}<span className="min-w-0 break-words">{option.label}{option.detail&&<span className="block">{option.detail}</span>}</span>
    </Button></div>:<Label key={option.id} className="flex min-w-0 items-start gap-3 p-3 text-sm">
    {multiple?<Checkbox checked={selected.includes(option.id)} disabled={option.disabled} onChange={e=>onToggle(option.id,e.target.checked)}/>:<Radio name={id} value={option.id} checked={selected.includes(option.id)} disabled={option.disabled} onChange={e=>onToggle(option.id,e.target.checked)}/>}
    <span className="min-w-0 [overflow-wrap:anywhere]"><span className="block font-medium">{option.label}</span>{option.detail&&<span className="block text-xs text-muted-foreground">{option.detail}</span>}</span>
   </Label>)}</div>;
}
