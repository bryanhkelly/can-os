import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/textarea";
import {WorkspaceNotice} from "@/components/workspace";
import {prepareEngagementEmailDraft} from "@/modules/engagement/engagement-registry.functions";
import {buildInvitationMailto,parseInvitationRecipients,type EngagementInvitation} from "@/domain/engagement-distribution";

/** Shared operator-mediated handoff. Recipient addresses stay in this browser
 * and never appear in logs, links sent to participants or a shadow CRM. */
export function EngagementEmailDistribution({engagementId,linkId,onClose}:{
  engagementId:string;linkId:string;onClose:()=>void;
}){
  const [draft,setDraft]=useState<EngagementInvitation|null>(null);
  const [recipients,setRecipients]=useState("");
  const [authorized,setAuthorized]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;setDraft(null);setRecipients("");setAuthorized(false);setError("");setNotice("");
    prepareEngagementEmailDraft({data:{engagementId,linkId}})
      .then(value=>{if(active)setDraft(value);})
      .catch(()=>{if(active)setError("The saved email invitation could not be verified.");});
    return()=>{active=false;};
  },[engagementId,linkId]);
  const parsed=parseInvitationRecipients(recipients);
  const ready=!!draft&&authorized&&parsed.recipients.length>0&&!parsed.invalid.length&&!parsed.tooMany;
  async function handoff(){
    if(!ready||busy)return;setBusy(true);setError("");setNotice("");
    try{
      // Revalidate current link and permissions immediately before preparing
      // the external draft; no stale revoked link is silently distributed.
      const current=await prepareEngagementEmailDraft({data:{engagementId,linkId}});
      const url=buildInvitationMailto(current,parsed.recipients);
      if(url.length>7000){setError("This draft is too long for a reliable email-client handoff. Copy the invitation instead.");return;}
      window.location.href=url;
      setNotice("Email draft requested from your email application. Sending and delivery have not been verified.");
    }catch{setError("The invitation is no longer available for distribution.");}
    finally{setBusy(false);}
  }
  async function copy(){
    try{const current=await prepareEngagementEmailDraft({data:{engagementId,linkId}});
      await navigator.clipboard.writeText(current.subject+"\n\n"+current.body);
      setNotice("Invitation copied. No email sent.");
    }catch{setError("Could not copy a currently eligible invitation.");}
  }
  return <section className="mt-4 border p-4" aria-label="Email invitation distribution">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Prepare email invitation</h3><Button type="button" variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
    <WorkspaceNotice className="mt-3">Use your own authorized email account to send a small pilot invitation. Recipients are placed in BCC. Becomuna does not send, store these addresses, subscribe them, or claim delivery. For a bulk campaign, use your organization’s approved consent and unsubscribe system.</WorkspaceNotice>
    {draft&&<>
      <div className="mt-3 border p-3 text-sm"><p className="font-semibold">{draft.subject}</p><p className="mt-2 whitespace-pre-wrap break-words">{draft.body}</p></div>
      <label className="mt-3 grid gap-1 text-sm font-medium">Recipient email addresses (up to 20)
        <Textarea value={recipients} maxLength={6000} rows={3} placeholder="Enter one address per line" onChange={e=>{setRecipients(e.target.value);setAuthorized(false);}}/>
      </label>
      <p className="mt-1 text-xs text-muted-foreground">{parsed.recipients.length} unique addresses. {parsed.invalid.length>0?"Remove invalid or synthetic addresses.":""} {parsed.tooMany?"Limit is 20 addresses.":""}</p>
      <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={authorized} onChange={e=>setAuthorized(e.target.checked)}/>I have permission to contact these recipients for this invitation and will honor their communication preferences.</label>
      <div className="mt-3 flex flex-wrap gap-2"><Button type="button" disabled={!ready||busy} onClick={()=>void handoff()}>Open email draft</Button><Button type="button" variant="outline" onClick={()=>void copy()}>Copy invitation</Button></div>
    </>}
    {!draft&&!error&&<p role="status" className="mt-3 text-sm">Verifying saved invitation…</p>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}
