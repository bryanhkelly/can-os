import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import type { GoDestination, GoDestinationChoice } from "@/domain/site-go-links";

export function goDestinationSelectionKey(destination:GoDestination):string{
  // Use canonical discriminants rather than JSON property insertion order.
  switch(destination.kind){
    case "information":return "information:"+destination.journeyId;
    case "site-page":return "site-page:"+destination.page;
    case "adult-training":return "adult-training:"+destination.releaseId;
    case "class":return "class:"+destination.classId;
    case "enrichment":return "enrichment:"+destination.seasonId;
    case "website-preview":return JSON.stringify(["website-preview",destination.snapshotId,destination.snapshotDigest,destination.sourceRevision,destination.brandVersionId]);
  }
}

/** Shared controlled presentation. Only server-returned choices can be selected. */
export function GoDestinationChoiceField({choices,value,onChange,disabled=false,label="Where should this link lead?",placeholder="Choose an available destination",className}:{
  choices:readonly GoDestinationChoice[];value:GoDestination|null;onChange:(value:GoDestination|null)=>void;
  disabled?:boolean;label?:string;placeholder?:string;className?:string;
}){
  const selected=value?goDestinationSelectionKey(value):"";
  const current=choices.some(item=>goDestinationSelectionKey(item.destination)===selected);
  return <Field label={label} className={className}>
    <Select disabled={disabled||choices.length===0} value={current?selected:""} onChange={event=>{
      const item=choices.find(option=>goDestinationSelectionKey(option.destination)===event.target.value);
      onChange(item?.destination??null);
    }}>
      <option value="">{placeholder}</option>
      {choices.map(item=><option key={goDestinationSelectionKey(item.destination)} value={goDestinationSelectionKey(item.destination)}>{item.title}</option>)}
    </Select>
  </Field>;
}
