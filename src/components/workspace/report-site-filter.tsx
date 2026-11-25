import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {reportSiteSelectionAvailable,type ReportSiteOption} from "@/domain/report-filter-state";
export function ReportSiteFilter({value,options,onChange,loading=false,error=false,disabled=false}:{
  value:string;options:readonly ReportSiteOption[];onChange:(value:string)=>void;loading?:boolean;error?:boolean;disabled?:boolean;
}){
  const unavailable=!reportSiteSelectionAvailable(value,options);
  return <Field label="Delivery Site" description={error?"Authorized Sites could not be refreshed. Retry filter options.":loading?"Loading authorized Sites…":unavailable?"Selected Site is unavailable. Select another Site or explicitly return to all authorized Sites.":"Only Sites in the current verified provider scope are available."}>
    <Select aria-label="Delivery Site" value={value} disabled={disabled||loading||error} onChange={event=>onChange(event.target.value)}>
      <option value="">All authorized Sites</option>
      {unavailable&&<option value={value}>Selected Site unavailable</option>}
      {options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}
    </Select>
  </Field>;
}
