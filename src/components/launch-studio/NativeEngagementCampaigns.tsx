import {useEffect,useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/choice";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {EmailRecipientField} from "@/components/communication/EmailRecipientField";
import {ActionFooter,EmptyState,QueryState,WorkspaceNotice,WorkspacePanel,StatusBadge,RecordFacts} from "@/components/workspace";
import {readEngagementCampaignWorkspace,saveCampaignRecipientList,queueEngagementCampaign,cancelEngagementCampaign} from "@/modules/communication/engagement-campaigns.functions";
import {CampaignListMembers} from "./CampaignListMembers";
import {parseCampaignRecipients,parseCampaignRecipientCsv} from "@/domain/campaign-policy";
type Workspace=Awaited<ReturnType<typeof readEngagementCampaignWorkspace>>;
type CampaignProps={engagementId:string;linkId:string;invitationReady:boolean;recipientDraft?:string;onRecipientDraftChange?:(value:string)=>void};
export function NativeEngagementCampaigns(props:CampaignProps){
 return <NativeCampaignSession key={JSON.stringify([props.engagementId,props.linkId])} {...props}/>;
}
function NativeCampaignSession({engagementId,linkId,invitationReady,recipientDraft,onRecipientDraftChange}:CampaignProps){
 const [data,setData]=useState<Workspace|null>(null),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [name,setName]=useState(""),[localRaw,setLocalRaw]=useState(""),[source,setSource]=useState(""),[attested,setAttested]=useState(false);
 const raw=recipientDraft??localRaw;
 const setRaw=onRecipientDraftChange??setLocalRaw;
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
     setRaw(merged.recipients.join("\n"));setList("");setManageList(false);setConfirmed(false);
   }catch(e){setImportError(e instanceof Error?e.message:"Unable to import CSV.");}
   finally{importPending.current=false;setImporting(false);}
 }
 const requestId=useRef<{id:string;scheduledAt:string}|null>(null),pending=useRef(false);
 const scope={engagementId,linkId};
 useEffect(()=>{let active=true;setData(null);setError("");readEngagementCampaignWorkspace({data:{engagementId,linkId}}).then(v=>{if(active)setData(v);}).catch(()=>{if(active){setData(null);setError("Native campaign workspace unavailable.");}});return()=>{active=false;};},[engagementId,linkId,refresh]);
 async function run(action:()=>Promise<void>){if(pending.current||importPending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");try{await action();setRefresh(v=>v+1);}catch{setError("The operation could not be confirmed. Review the saved state and try again.");}finally{pending.current=false;setBusy(false);}}
 useEffect(()=>{if(!invitationReady){setConfirmed(false);requestId.current=null;}},[invitationReady]);
 const parsed=parseCampaignRecipients(raw);
 const directValid=source.trim().length>=5&&attested&&parsed.recipients.length>0&&!parsed.invalid.length&&!parsed.tooMany;
 const valid=!!name.trim()&&directValid;
 const useDirect=!!raw.trim();
 const recipientReady=useDirect?directValid:!!data?.lists.some(item=>item.id===list&&item.recipients>0);
 return <WorkspacePanel headingLevel="h3" title="Send email" className="mt-4"><div className="space-y-4">
 {!data&&<QueryState loading={!error?"Loading campaigns…":undefined} error={error||undefined} onRetry={()=>setRefresh(v=>v+1)}/>}
 {!invitationReady&&<WorkspaceNotice tone="attention">The invitation must be verified before a campaign can be queued. You can still prepare and save consented recipient lists when the campaign workspace is available.</WorkspaceNotice>}
 {data&&!data.senderReady&&<WorkspaceNotice>Email sending is unavailable. {data.senderIssues?.join(" ") || "Ask your platform administrator to review the sender configuration."}</WorkspaceNotice>}
 {data&&<RecordFacts columns={1} items={[{label:"Campaign sender",value:data.senderLabel}]}/>}
 {!data&&<p className="text-sm text-muted-foreground">You can enter addresses now. Saving requires a successfully loaded campaign workspace.</p>}
 <Field label="Recipient list name (optional)"><Input value={name} maxLength={120} disabled={busy} onChange={e=>setName(e.target.value)}/></Field>
 <EmailRecipientField value={raw} disabled={busy||importing} onChange={value=>{setRaw(value);setList("");setManageList(false);setAttested(false);setConfirmed(false);}}/>
 <Field label="Import email CSV" description="Optional single email column, with or without an email header. Review addresses and confirm consent before sending."><Input type="file" accept=".csv,text/csv" disabled={busy||importing} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";if(file)void importCsv(file);}}/></Field>
 {importError&&<WorkspaceNotice tone="danger">{importError}</WorkspaceNotice>}
 <Field label="Consent evidence" description="Describe where and how these recipients agreed to campaign emails."><Input value={source} maxLength={500} disabled={busy} onChange={e=>{setSource(e.target.value);setAttested(false);setConfirmed(false);}}/></Field>
 <label className="flex items-start gap-2 text-sm"><Checkbox checked={attested} disabled={busy||importing} onChange={e=>setAttested(e.target.checked)}/>I have documented permission from every listed recipient for these campaign emails. Existing opt-outs will not be overridden.</label>
 <ActionFooter layout="inline"><Button type="button" disabled={!data||!valid||busy||importing} onClick={()=>void run(async()=>{const saved=await saveCampaignRecipientList({data:{...scope,name,raw,consentSource:source,attested:true}});setList(saved.id);setRaw("");setAttested(false);setConfirmed(false);requestId.current=null;setNotice("Recipient list saved. No messages sent.");})}>Save or add to list</Button></ActionFooter>
 {data&&<>
 <Field label="Or use a saved recipient list"><Select value={list} disabled={busy} onChange={e=>{setList(e.target.value);if(e.target.value){setRaw("");setAttested(false);}setManageList(false);setConfirmed(false);requestId.current=null;}}><option value="">Select a list</option>{data.lists.map(l=><option key={l.id} value={l.id}>{l.name} ({l.recipients})</option>)}</Select></Field>
 {list&&<><Button type="button" variant="outline" disabled={busy} onClick={()=>setManageList(v=>!v)}>{manageList?"Close recipient management":"Manage saved recipients"}</Button>{manageList&&<CampaignListMembers key={list} engagementId={engagementId} linkId={linkId} listId={list} onChange={()=>{setConfirmed(false);setRefresh(v=>v+1);}}/>}</>}
 <Field label="Schedule (local time)" description="Leave empty to send now. Scheduled processing is periodic, not an exact minute guarantee."><Input type="datetime-local" value={when} disabled={busy} onChange={e=>{setWhen(e.target.value);setConfirmed(false);requestId.current=null;}}/></Field>
 <label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} disabled={!invitationReady||busy} onChange={e=>setConfirmed(e.target.checked)}/>Send the displayed invitation to the selected recipients. Recipients with opt-outs will be suppressed.</label>
 <ActionFooter layout="inline"><Button type="button" disabled={!invitationReady||!data.senderReady||!recipientReady||!confirmed||busy||importing} onClick={()=>void run(async()=>{requestId.current??={id:crypto.randomUUID(),scheduledAt:when?new Date(when).toISOString():new Date().toISOString()};await queueEngagementCampaign({data:{...scope,...(useDirect?{raw,consentSource:source,attested:true as const}:{listId:list}),requestId:requestId.current.id,scheduledAt:requestId.current.scheduledAt,confirmed:true}});requestId.current=null;setConfirmed(false);setNotice(when?"Email scheduled.":"Email submitted for delivery. Check campaign history for provider acceptance and delivery.");})}>{when?"Schedule email":"Send email"}</Button></ActionFooter>
 <WorkspacePanel headingLevel="h4" title="Campaign history" actions={<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>setRefresh(v=>v+1)}>Refresh</Button>}><div className="space-y-3">
 {data.campaigns.length===0&&<EmptyState title="No campaigns yet."/>}
 {data.campaigns.map(c=><WorkspacePanel key={c.id} headingLevel="h5" title={c.subject} description={new Date(c.scheduled_at).toLocaleString()} actions={<StatusBadge tone={c.cancelled_at?"neutral":c.pending?"info":"neutral"}>{c.cancelled_at?"Cancelled":c.pending?"Queued / processing":"Queue settled"}</StatusBadge>}><RecordFacts columns={3} items={[{label:"Recipients",value:c.total},{label:"Pending",value:c.pending},{label:"Provider accepted",value:c.accepted},{label:"Delivered",value:c.delivered},{label:"Bounced",value:c.bounced},{label:"Complaints",value:c.complained},{label:"Failed",value:c.failed},{label:"Unconfirmed",value:c.unconfirmed},{label:"Suppressed",value:c.suppressed},{label:"Cancelled",value:c.cancelled}]}/>{c.pending>0&&!c.cancelled_at&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void run(async()=>{await cancelEngagementCampaign({data:{...scope,campaignId:c.id}});setNotice("Remaining queued messages cancelled. In-flight messages may still arrive.");})}>Cancel remaining</Button>}</WorkspacePanel>)}
 </div></WorkspacePanel>
 </>}
 {notice&&<WorkspaceNotice tone="success">{notice}</WorkspaceNotice>}{data&&error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
 </div></WorkspacePanel>;
}
