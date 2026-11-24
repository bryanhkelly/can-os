import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/choice";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {QueryState,WorkspaceNotice} from "@/components/workspace";
import {readEngagementCampaignWorkspace,saveCampaignRecipientList,queueEngagementCampaign,cancelEngagementCampaign} from "@/modules/communication/engagement-campaigns.functions";
import {parseCampaignRecipients} from "@/domain/campaign-policy";
type Workspace=Awaited<ReturnType<typeof readEngagementCampaignWorkspace>>;
export function NativeEngagementCampaigns({engagementId,linkId}:{engagementId:string;linkId:string}){
 const [data,setData]=useState<Workspace|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [name,setName]=useState(""),[raw,setRaw]=useState(""),[source,setSource]=useState(""),[attested,setAttested]=useState(false);
 const [list,setList]=useState(""),[when,setWhen]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const requestId=useRef<string|null>(null),pending=useRef(false);
 const scope={engagementId,linkId};
 useEffect(()=>{let active=true;readEngagementCampaignWorkspace({data:{engagementId,linkId}}).then(v=>{if(active)setData(v);}).catch(()=>{if(active)setError("Native campaign workspace unavailable.");});return()=>{active=false;};},[engagementId,linkId,refresh]);
 async function run(action:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");try{await action();setRefresh(v=>v+1);}catch{setError("The operation could not be confirmed. Review the saved state and try again.");}finally{pending.current=false;setBusy(false);}}
 const parsed=parseCampaignRecipients(raw);
 const valid=!!name.trim()&&source.trim().length>=5&&attested&&parsed.recipients.length>0&&!parsed.invalid.length&&!parsed.tooMany;
 return <section className="mt-4 space-y-4 border p-4" aria-label="Native email campaigns">
 <h3 className="text-sm font-semibold">Email campaigns</h3>
 {!data&&<QueryState loading={!error?"Loading campaigns…":undefined} error={error||undefined} onRetry={()=>setRefresh(v=>v+1)}/>}
 {data&&<>
 {!data.senderReady&&<WorkspaceNotice>Sending is unavailable until an authorized campaign sender, postal address and provider are configured.</WorkspaceNotice>}
 <Field label="Recipient list name"><Input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)}/></Field>
 <Field label="Consented email addresses" description={parsed.recipients.length+" unique addresses; up to 1,000 per list"} error={parsed.invalid.length?"Remove invalid or synthetic addresses.":parsed.tooMany?"List exceeds the current limit.":undefined}>
 <Textarea value={raw} rows={4} maxLength={256000} disabled={busy} onChange={e=>{setRaw(e.target.value);setAttested(false);}}/></Field>
 <Field label="Consent evidence" description="Describe where and how these recipients agreed to campaign emails."><Input value={source} maxLength={500} disabled={busy} onChange={e=>{setSource(e.target.value);setAttested(false);}}/></Field>
 <label className="flex items-start gap-2 text-sm"><Checkbox checked={attested} disabled={busy} onChange={e=>setAttested(e.target.checked)}/>I have documented permission from every listed recipient for these campaign emails. Existing opt-outs will not be overridden.</label>
 <Button type="button" disabled={!valid||busy} onClick={()=>void run(async()=>{const saved=await saveCampaignRecipientList({data:{...scope,name,raw,consentSource:source,attested:true}});setList(saved.id);setRaw("");setAttested(false);setConfirmed(false);requestId.current=null;setNotice("Recipient list saved. No messages sent.");})}>Save or add to list</Button>
 <Field label="Saved recipient list"><Select value={list} disabled={busy} onChange={e=>{setList(e.target.value);setConfirmed(false);requestId.current=null;}}><option value="">Select a list</option>{data.lists.map(l=><option key={l.id} value={l.id}>{l.name} ({l.recipients})</option>)}</Select></Field>
 <Field label="Schedule (local time)" description="Leave empty to queue now. Scheduled processing is periodic, not an exact minute guarantee."><Input type="datetime-local" value={when} disabled={busy} onChange={e=>{setWhen(e.target.value);setConfirmed(false);requestId.current=null;}}/></Field>
 <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Queue the displayed invitation for this list. Recipients with opt-outs will be suppressed.</label>
 <Button type="button" disabled={!data.senderReady||!list||!confirmed||busy} onClick={()=>void run(async()=>{requestId.current??=crypto.randomUUID();await queueEngagementCampaign({data:{...scope,listId:list,requestId:requestId.current,scheduledAt:when?new Date(when).toISOString():new Date().toISOString(),confirmed:true}});requestId.current=null;setConfirmed(false);setNotice("Campaign queued. Delivery is not yet confirmed.");})}>{when?"Schedule campaign":"Queue campaign"}</Button>
 <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">Campaign history</h4><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh</Button></div>
 {data.campaigns.length===0&&<p className="text-sm">No campaigns yet.</p>}
 {data.campaigns.map(c=><div key={c.id} className="space-y-2 border p-3 text-sm"><p className="font-semibold">{c.subject}</p><p>{new Date(c.scheduled_at).toLocaleString()} · {c.cancelled_at?"Cancelled":c.pending?"Queued / processing":"Queue settled"}</p><p>{c.total} recipients · {c.pending} pending · {c.accepted} provider accepted · {c.delivered} delivered · {c.bounced} bounced · {c.complained} complaints · {c.failed} failed · {c.suppressed} suppressed · {c.cancelled} cancelled</p>{c.pending>0&&!c.cancelled_at&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void run(async()=>{await cancelEngagementCampaign({data:{...scope,campaignId:c.id}});setNotice("Remaining queued messages cancelled. In-flight messages may still arrive.");})}>Cancel remaining</Button>}</div>)}
 </>}
 {notice&&<p role="status" className="text-sm">{notice}</p>}{data&&error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
