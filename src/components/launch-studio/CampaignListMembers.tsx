import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/choice";
import {ActionFooter,DirectoryWindowPagination,EmptyState,QueryState,WorkspaceNotice,WorkspacePanel,StatusBadge} from "@/components/workspace";
import {readCampaignListMembers,updateCampaignListMember} from "@/modules/communication/engagement-campaigns.functions";
type Members=Awaited<ReturnType<typeof readCampaignListMembers>>;
type MemberProps={engagementId:string;linkId:string;listId:string;onChange:()=>void};
export function CampaignListMembers(props:MemberProps){
 return <CampaignMemberSession key={JSON.stringify([props.engagementId,props.linkId,props.listId])} {...props}/>;
}
function CampaignMemberSession({engagementId,linkId,listId,onChange}:MemberProps){
 const [page,setPage]=useState(0),[revision,setRevision]=useState(0),[data,setData]=useState<Members|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<{email:string;operation:"remove"|"withdraw"}|null>(null),[confirmed,setConfirmed]=useState(false);
 useEffect(()=>{let active=true;setData(null);setError("");readCampaignListMembers({data:{engagementId,linkId,listId,offset:page*50}}).then(v=>{if(active)setData(v);}).catch(()=>{if(active)setError("Recipient list unavailable.");});return()=>{active=false;};},[engagementId,linkId,listId,page,revision]);
 async function apply(){
  if(!selected||!confirmed||busy)return;setBusy(true);setError("");
  try{await updateCampaignListMember({data:{engagementId,linkId,listId,...selected,confirmed:true}});setSelected(null);setConfirmed(false);setRevision(v=>v+1);onChange();}
  catch{setError("The update could not be confirmed.");}finally{setBusy(false);}
 }
 return <WorkspacePanel headingLevel="h4" title="Manage recipient list"><div className="space-y-3">
 <WorkspaceNotice>Removing a member stops unsent messages from this list. Withdrawing consent suppresses all future campaigns from this organization. Neither action can recall a message already in transit.</WorkspaceNotice>
 {!data&&<QueryState loading={!error?"Loading recipients…":undefined} error={error||undefined} onRetry={()=>setRevision(v=>v+1)}/>}
 {data&&<>
 {data.members.length===0&&<EmptyState title="No recipients on this page."/>}
 {data.members.map(member=><div key={member.email} className="space-y-1 border-b pb-2 text-sm">
 <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="min-w-0 [overflow-wrap:anywhere] font-semibold">{member.email}</p><StatusBadge tone={member.suppression?"attention":"success"}>{member.suppression?"Suppressed: "+member.suppression:"Consent recorded"}</StatusBadge></div>
 <p className="break-words">{new Date(member.consent_at).toLocaleDateString()} · {member.consent_source}</p>
 <ActionFooter layout="inline" className="mt-0"><Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{setSelected({email:member.email,operation:"remove"});setConfirmed(false);}}>Remove from list</Button>
 {!member.suppression&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>{setSelected({email:member.email,operation:"withdraw"});setConfirmed(false);}}>Withdraw consent</Button>}</ActionFooter>
 </div>)}
 <DirectoryWindowPagination label="Recipients" pageIndex={page} hasMore={data.hasMore} disabled={busy} onPageChange={next=>{setSelected(null);setConfirmed(false);setPage(next);}}/>
 </>}
 {selected&&<div className="space-y-2 border p-3 text-sm"><p className="break-all">Confirm {selected.operation==="remove"?"removal":"consent withdrawal"} for {selected.email}.</p><label className="flex items-start gap-2"><Checkbox checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>Confirm this change.</label><ActionFooter layout="inline"><Button type="button" disabled={!confirmed||busy} loading={busy} loadingLabel="Applying change…" onClick={()=>void apply()}>Apply change</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>setSelected(null)}>Cancel</Button></ActionFooter></div>}
 {data&&error&&<WorkspaceNotice tone="danger">{error}</WorkspaceNotice>}
 </div></WorkspacePanel>;
}
