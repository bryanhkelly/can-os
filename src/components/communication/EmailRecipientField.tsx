import {Field} from "@/components/ui/field";
import {Textarea} from "@/components/ui/textarea";
import {parseCampaignRecipients} from "@/domain/campaign-policy";

export function EmailRecipientField({value,onChange,disabled=false}:{value:string;onChange:(value:string)=>void;disabled?:boolean}){
 const parsed=parseCampaignRecipients(value);
 return <Field label="Recipient email addresses" description={parsed.recipients.length+" unique addresses; up to 1,000 per list"} error={parsed.invalid.length?"Remove invalid or synthetic addresses.":parsed.tooMany?"List exceeds the current limit.":undefined}>
  <Textarea placeholder="Enter one email address per line" value={value} rows={4} maxLength={256000} disabled={disabled} onChange={e=>onChange(e.target.value)}/>
 </Field>;
}
