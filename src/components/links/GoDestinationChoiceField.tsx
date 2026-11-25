import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { goDestinationSelectionKey, type GoDestination, type GoDestinationChoice } from "@/domain/site-go-links";

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
