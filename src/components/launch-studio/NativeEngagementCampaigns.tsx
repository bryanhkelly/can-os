import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/choice";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {ActionFooter,EmptyState,QueryState,WorkspaceNotice,WorkspacePanel,StatusBadge,RecordFacts,ActionStateIndicator} from "@/components/workspace";
import {readEngagementCampaignWorkspace,saveCampaignRecipientList,queueEngagementCampaign,cancelEngagementCampaign} from "@/modules/communication/engagement-campaigns.functions";
import {CampaignListMembers} from "./CampaignListMembers";
import {parseCampaignRecipients,parseCampaignRecipientCsv} from "@/domain/campaign-policy";
type Workspace=Awaited<ReturnType<typeof readEngagementCampaignWorkspace>>;
type CampaignProps={engagementId:string;linkId:string;invitationReady:boolean};
export function NativeEngagementCampaigns(props:CampaignProps){
 return <NativeCampaignSession key={JSON.stringify([props.engagementId,props.linkId])} {...props}/>;
}
function NativeCampaignSession({engagementId,linkId,invitationReady}:CampaignProps){
 const [data,setData]=useState<Workspace|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [name,setName]=useState(""),[raw,setRaw]=useState(""),[source,setSource]=useState(""),[attested,setAttested]=useState(false);
 const [list,setList]=useState(""),[when,setWhen]=useState(""),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 const [manageList,setManageList]=useState(false);
 const [importing,setImporting]=useState(false),[importError,setImportError]=useState("");
 const importPending=useRef(false);
 async function importCsv(file:File){
   if(importPending.current||pending.current)return;
   importPending.current=true;setImportError("");setImporting(true);setAttested(false);
   try{
     if(file.size>256000)throw new Error("CSV exceeds 256 KB.");
     const imported=parseCampaignRecipientCsv(await file.text());
     const merged=parseCampaignRecipients([raw,imported].filter(Boolean).join("\n"));
     if(merged.invalid.length||merged.tooMany)throw new Error("Combined list must contain at most 1,000 valid addresses.");
     setRaw(merged.recipients.join("\n"));
   }catch(e){setImportError(e instanceof Error?e.message:"Unable to import CSV.");}
   finally{importPending.current=false;setImporting(false);}
 }
 const requestId=useRef<{id:string;scheduledAt:string}|null>(null),pending=useRef(false);
 const scope={engagementId,linkId};
 useEffect(()=>{let active=true;setData(null);setError("");readEngagementCampaignWorkspace({data:{engagementId,linkId}}).then(v=>{if(active)setData(v);}).catch(()=>{if(active){setData(null);setError("Native campaign workspace unavailable.");}});return()=>{active=false;};},[engagementId,linkId,refresh]);
 async function run(action:()=>Promise<void>){if(pending.current||importPending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");try{await action();setRefresh(v=>v+1);}catch{setError("The operation could not be confirmed. Review the saved state and try again.");}finally{pending.current=false;setBusy(false);}}
 useEffect(()=>{if(!invitationReady){setConfirmed(false);requestId.current=null;}},[invitationReady]);
 const parsed=parseCampaignRecipients(raw);
 const valid=!!name.trim()&&source.trim().length>=5&&attested&&parsed.recipients.length>0&&!parsed.invalid.length&&!parsed.tooMany;
 const listBlock=!data?"Wait for the campaign workspace to load.":!name.trim()?"Enter a list name.":!parsed.recipients.length?"Enter at least one valid email address.":parsed.invalid.length||parsed.tooMany?"Correct the recipient list.":source.trim().length<5?"Describe the consent source.":!attested?"Confirm documented permission.":null;
 const queueBlock=!invitationReady?"Verify the invitation first.":!data?.senderReady?"Configure an authorized sender and delivery settings.":!list?"Select a saved recipient list.":!data?.lists.some(item=>item.id===list&&item.recipients>0)?"Select a nonempty saved list.":!confirmed?"Confirm the invitation and recipient list.":null;
 return <WorkspacePanel headingLevel="h3" title="Email campaigns" className="mt-4"><div className="space-y-4">
 {!data&&<QueryState loading={!error?"Loading campaigns…":undefined} error={error||undefined} onRetry={()=>setRefresh(v=>v+1)}/>}
 {!invitationReady&&<WorkspaceNotice tone="attention">The invitation must be verified before a campaign can be queued. You can still prepare and save consented recipient lists when the campaign workspace is available.</WorkspaceNotice>}
 {data&&!data.senderReady&&<WorkspaceNotice>Sending is unavailable until an authorized campaign sender, postal address, provider and signed delivery webhook are configured.</WorkspaceNotice>}
 {data&&<RecordFacts columns={1} items={[{label:"Campaign sender",value:data.senderLabel}]}/>}
 {!data&&<p className="text-sm text-muted-foreground">You can enter addresses now. Saving requires a successfully loaded campaign workspace.</p>}
 <Field label="Recipient list name"><Input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)}/></Field>
 <Field label="Consented email addresses" description={parsed.recipients.length+" unique addresses; up to 1,000 per list"} error={parsed.invalid.length?"Remove invalid or synthetic addresses.":parsed.tooMany?"List exceeds the current limit.":undefined}>
 <Textarea placeholder="Enter one email address per line" value={raw} rows={4} maxLength={256000} disabled={busy||importing} onChange={e=>{setRaw(e.target.value);setAttested(false);}}/></Field>
 <Field label="Import email CSV" description="Optional single email column, with or without an email header. Review addresses and confirm consent before saving."><Input type="file" accept=".csv,text/csv" disabled={busy||importing} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void importCsv(file);}}/></Field>
 {importError&&<WorkspaceNotice tone="danger">{importError}</WorkspaceNotice>}
 <Field label="Consent evidence" description="Describe where and how these recipients agreed to campaign emails."><Input value={source} maxLength={500} disabled={busy} onChange={e=>{setSource(e.target.value);setAttested(false);}}/></Field>
 <label className="flex items-start gap-2 text-sm"><Checkbox checked={attested} disabled={busy||importing} onChange={e=>setAttested(e.target.checked)}/>I have documented permission from every listed recipient for these campaign emails. Existing opt-outs will not be overridden.</label>
 {listBlock&&!busy&&!importing&&<ActionStateIndicator state={{kind:"blocked",detail:listBlock}}/>}
 <ActionFooter layout="inline"><Button type="button" disabled={!data||!valid||busy||importing} onClick={()=>void run(async()=>{const saved=await saveCampaignRecipientList({data:{...scope,name,raw,consentSource:source,attested:true}});setList(saved.id);setRaw("");setAttested(false);setConfirmed(false);requestId.current=null;setNotice("Recipient list saved. No messages sent.");})}>Save or add to list</Button></ActionFooter>
 {data&&<>
 <Field label="Saved recipient list"><Select value={list} disabled={busy} onChange={e=>{setList(e.target.value);setManageList(false);setConfirmed(false);requestId.current=null;}}><option value="">Select a list</option>{data.lists.map(l=><option key={l.id} value={l.id}>{l.name} ({l.recipients})</option>)}</Select></Field>
 {list&&<><Button type="button" variant="outline" disabled={busy} onClick={()=>setManageList(v=>!v)}>{manageList?"Close recipient management":"Manage saved recipients"}</Button>{manageList&&<CampaignListMembers key={list} engagementId={engagementId} linkId={linkId} listId={list} onChange={()=>{setConfirmed(false);setRefresh(v=>v+1);}}/>}</>}
 <Field label="Schedule (local time)" description="Leave empty to queue now. Scheduled processing is periodic, not an exact minute guarantee."><Input type="datetime-local" value={when} disabled={busy} onChange={e=>{setWhen(e.target.value);setConfirmed(false);requestId.current=null;}}/></Field>
 <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} disabled={!invitationReady||busy} onChange={e=>setConfirmed(e.target.checked)}/>Queue the displayed invitation for this list. Recipients with opt-outs will be suppressed.</label>
 {queueBlock&&!busy&&!importing&&<ActionStateIndicator state={{kind:"blocked",detail:queueBlock}}/>}
 <ActionFooter layout="inline"><Button type="button" disabled={!invitationReady||!data.senderReady||!list||!confirmed||busy||importing||!data.lists.some(item=>item.id===list&&item.recipients>0)} onClick={()=>void run(async()=>{requestId.current??={id:crypto.randomUUID(),scheduledAt:when?new Date(when).toISOString():new Date().toISOString()};await queueEngagementCampaign({data:{...scope,listId:list,requestId:requestId.current.id,scheduledAt:requestId.current.scheduledAt,confirmed:true}});requestId.current=null;setConfirmed(false);setNotice("Campaign queued. Delivery is not yet confirmed.");})}>{when?"Schedule campaign":"Queue campaign"}</Button></ActionFooter>
 <WorkspacePanel headingLevel="h4" title="Campaign history" actions={<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh</Button>}><div className="space-y-3">
 {data.campaigns.length===0&&<EmptyState title="No campaigns yet."/>}
 {data.campaigns.map(c=><WorkspacePanel key={c.id} headingLevel="h5" title={c.subject} description={new Date(c.scheduled_at).toLocaleString()} actions={<StatusBadge tone={c.cancelled_at?"neutral":c.pending?"info":"neutral"}>{c.cancelled_at?"Cancelled":c.pending?"Queued / processing":"Queue settled"}</StatusBadge>}><RecordFacts columns={3} items={[{label:"Recipients",value:c.total},{label:"Pending",value:c.pending},{label:"Provider accepted",value:c.accepted},{label:"Delivered",value:c.delivered},{label:"Bounced",value:c.bounced},{label:"Complaints",value:c.complained},{label:"Failed",value:c.failed},{label:"Unconfirmed",value:c.unconfirmed},{label:"Suppressed",value:c.suppressed},{label:"Cancelled",value:c.cancelled}]}/>{c.pending>0&&!c.cancelled_at&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void run(async()=>{await cancelEngagementCampaign({data:{...scope,campaignId:c.id}});setNotice("Remaining queued messages cancelled. In-flight messages may still arrive.");})}>Cancel remaining</Button>}</WorkspacePanel>)}
 </div></WorkspacePanel>
 </>}
 {notice&&<WorkspaceNotice tone="success">{notice}</WorkspaceNotice>}{data&&error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
 </div></WorkspacePanel>;
}
