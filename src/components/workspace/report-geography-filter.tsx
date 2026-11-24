import {useId} from "react";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {geographyFilterGroups,hasGeographyFilterOption,type GeographyFilterOption} from "@/domain/geographic-reporting";
export function ReportGeographyFilter({value,options,onChange,basis,disabled=false,loading=false,error=false}:{
 value:string;options:readonly GeographyFilterOption[];onChange:(value:string)=>void;
 basis:"current"|"historical";disabled?:boolean;loading?:boolean;error?:boolean;
}){
 const id=useId();
 const unavailable=!hasGeographyFilterOption(value,options);
 return <div className="space-y-1">
  <Field label="Delivery geography"><Select aria-label="Delivery geography" aria-describedby={id} value={value}
    disabled={disabled||loading||error} onChange={e=>onChange(e.target.value)}>
   <option value="">All authorized geographies</option>
   <option value="market:unknown">Market not resolved</option>
   <option value="market:outside">Outside metropolitan / micropolitan markets</option>
   {unavailable&&<option value={value}>Selected geography unavailable</option>}
   {geographyFilterGroups.map(group=>{
    const items=options.filter(option=>group.kinds.includes(option.kind));
    return items.length?<optgroup key={group.label} label={group.label}>{items.map(option=><option key={option.code} value={option.code}>{option.name}</option>)}</optgroup>:null;
   })}
  </Select></Field>
  <p id={id} className="text-xs text-muted-foreground" role={loading||error||unavailable?"status":undefined}>
   {error?"Geography options unavailable. Refresh the report to retry.":loading?"Loading authorized geography…":unavailable?"This selection is unavailable. Choose another geography.":basis==="historical"?"Site geography recorded at registration; not participant residence.":"Current Site geography; not a historical or participant location."}
  </p>
 </div>;
}
