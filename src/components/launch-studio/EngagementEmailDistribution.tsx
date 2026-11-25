import {useEffect,useRef,useState} from "react";
import {NativeEngagementCampaigns} from "./NativeEngagementCampaigns";
import {Button} from "@/components/ui/button";
import {Checkbox} from "@/components/ui/choice";
import {Field} from "@/components/ui/field";
import {Textarea} from "@/components/ui/textarea";
import {ActionFooter, QueryState, WorkspaceNotice, WorkspacePanel} from "@/components/workspace";
import {prepareEngagementEmailDraft} from "@/modules/engagement/engagement-registry.functions";
import {buildInvitationMailto,parseInvitationRecipients,type EngagementInvitation} from "@/domain/engagement-distribution";

/** Shared operator-mediated handoff. Recipient addresses stay in this browser
 * and never appear in logs, links sent to participants or a shadow CRM. */
type DistributionProps={engagementId:string;linkId:string;onClose:()=>void};
export function EngagementEmailDistribution(props:DistributionProps){
  return <EmailDistributionSession key={props.engagementId+":"+props.linkId} {...props}/>;
}
function EmailDistributionSession({engagementId,linkId,onClose}:DistributionProps){
  const [draft,setDraft]=useState<EngagementInvitation|null>(null);
  const [recipients,setRecipients]=useState("");
  const [authorized,setAuthorized]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const [copying,setCopying]=useState(false);
  const active=useRef(false);
  const pending=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{let active=true;setDraft(null);setRecipients("");setAuthorized(false);setError("");setNotice("");
    prepareEngagementEmailDraft({data:{engagementId,linkId}})
      .then(value=>{if(active)setDraft(value);})
      .catch(()=>{if(active)setError("The saved email invitation could not be verified.");});
    return()=>{active=false;};
  },[engagementId,linkId,revision]);
  const parsed=parseInvitationRecipients(recipients);
  const ready=!!draft&&authorized&&parsed.recipients.length>0&&!parsed.invalid.length&&!parsed.tooMany;
  async function handoff(){
    if(!ready||pending.current)return;pending.current=true;setBusy(true);setError("");setNotice("");
    try{
      // Revalidate current link and permissions immediately before preparing
      // the external draft; no stale revoked link is silently distributed.
      const current=await prepareEngagementEmailDraft({data:{engagementId,linkId}});
      if(!active.current)return;
      const url=buildInvitationMailto(current,parsed.recipients);
      if(url.length>7000){setError("This draft is too long for a reliable email-client handoff. Copy the invitation instead.");return;}
      window.location.href=url;
      setNotice("Email draft requested from your email application. Sending and delivery have not been verified.");
    }catch{setError("The invitation is no longer available for distribution.");}
    finally{pending.current=false;if(active.current)setBusy(false);}
  }
  async function copy(){
    if(pending.current)return;
    pending.current=true;setCopying(true);setError("");setNotice("");
    try{const current=await prepareEngagementEmailDraft({data:{engagementId,linkId}});
      if(!active.current)return;
      await navigator.clipboard.writeText(current.subject+"\n\n"+current.body);
      setNotice("Invitation copied. No email sent.");
    }catch{setError("Could not copy a currently eligible invitation.");}
    finally{pending.current=false;if(active.current)setCopying(false);}
  }
  return <WorkspacePanel headingLevel="h3" title="Prepare email invitation" className="mt-4" actions={<Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button>}>
    <WorkspaceNotice className="mt-3">For a small external email draft, recipients stay in your browser and are placed in BCC. Native campaign sending below uses saved consented lists and separate provider receipts.</WorkspaceNotice>
    {draft&&<>
      <WorkspacePanel headingLevel="h4" title={draft.subject} className="mt-3"><p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{draft.body}</p></WorkspacePanel>
      <Field className="mt-3" label="Recipient email addresses (up to 20)" description={`${parsed.recipients.length} unique addresses.`}
        error={parsed.invalid.length?"Remove invalid or synthetic addresses.":parsed.tooMany?"Limit is 20 addresses.":undefined}>
        <Textarea value={recipients} maxLength={6000} rows={3} disabled={busy||copying} placeholder="Enter one address per line" onChange={e=>{setRecipients(e.target.value);setAuthorized(false);}}/>
      </Field>
      <label className="mt-3 flex items-start gap-2 text-sm"><Checkbox disabled={busy||copying} checked={authorized} onChange={e=>setAuthorized(e.target.checked)}/>I have permission to contact these recipients for this invitation and will honor their communication preferences.</label>
      <ActionFooter layout="inline"><Button type="button" disabled={!ready||busy||copying} loading={busy} onClick={()=>void handoff()}>Open email draft</Button><Button type="button" variant="outline" disabled={busy||copying} loading={copying} onClick={()=>void copy()}>Copy invitation</Button></ActionFooter>
    </>}
    {!draft&&<QueryState loading={!error?"Verifying saved invitation…":undefined} error={error||undefined} onRetry={()=>setRevision(v=>v+1)}/>}
    {draft&&<NativeEngagementCampaigns engagementId={engagementId} linkId={linkId} invitationReady/>}
    {notice&&<WorkspaceNotice tone="success" className="mt-3">{notice}</WorkspaceNotice>}
    {draft&&error&&<WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
  </WorkspacePanel>;
}
