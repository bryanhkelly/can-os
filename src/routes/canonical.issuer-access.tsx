import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeClientError } from "@/lib/client-error";
import {
  getMyCredentialIssuerApproval,requestCanonicalCredentialIssuerApproval,
  listPendingCredentialIssuerApprovals,listActiveCredentialIssuerApprovals,
  reviewCanonicalCredentialIssuerApproval,revokeCanonicalCredentialIssuerApproval,
} from "@/modules/identity/canonical-sensitive-approvals.functions";

export const Route=createFileRoute("/canonical/issuer-access")({
  component:CredentialIssuerAccess,
});

type Tab="request"|"review"|"revoke";
function CredentialIssuerAccess(){
  const [tab,setTab]=useState<Tab>("request");
  const [evidence,setEvidence]=useState("");
  const [reviewEvidence,setReviewEvidence]=useState("");
  const [reviewId,setReviewId]=useState("");
  const [expiry,setExpiry]=useState("");
  const [revokeId,setRevokeId]=useState("");
  const [revokeReason,setRevokeReason]=useState("");
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const client=useQueryClient();
  const my=useQuery({
    queryKey:["credential-issuer-my-approval"],
    queryFn:()=>getMyCredentialIssuerApproval(),
    enabled:tab==="request",retry:false,
  });
  const pending=useQuery({
    queryKey:["credential-issuer-pending-approvals"],
    queryFn:()=>listPendingCredentialIssuerApprovals(),
    enabled:tab==="review",retry:false,
  });
  const active=useQuery({
    queryKey:["credential-issuer-active-approvals"],
    queryFn:()=>listActiveCredentialIssuerApprovals(),
    enabled:tab==="revoke",retry:false,
  });
  async function perform(task:()=>Promise<unknown>,success:string){
    if(busy)return;
    setBusy(true);setNotice("");setError("");
    try {
      await task();
      await client.invalidateQueries({queryKey:["credential-issuer-my-approval"]});
      await client.invalidateQueries({queryKey:["credential-issuer-pending-approvals"]});
      await client.invalidateQueries({queryKey:["credential-issuer-active-approvals"]});
      setNotice(success);
    } catch(cause) {
      setError(normalizeClientError(cause,"Credential access action was denied or could not be completed.").message);
    } finally {setBusy(false);}
  }
  function request(e:FormEvent){
    e.preventDefault();
    if(evidence.trim().length<25)return;
    void perform(()=>requestCanonicalCredentialIssuerApproval({data:{
      evidenceReference:evidence.trim(),
    }}),"Issuer access requested. An independent CAN institutional reviewer must approve it.");
  }
  function decide(decision:"approve"|"reject"){
    const data={
      approvalId:reviewId,decision,
      evidenceReference:reviewEvidence.trim(),
      ...(decision==="approve" && expiry ? {expiresAt:new Date(expiry+"T23:59:59Z").toISOString()} : {}),
    };
    void perform(()=>reviewCanonicalCredentialIssuerApproval({data}),
      decision==="approve"?"Issuer authorization approved through the selected expiration date.":
        "The issuer request was rejected.");
  }
  function revoke(e:FormEvent){
    e.preventDefault();
    void perform(()=>revokeCanonicalCredentialIssuerApproval({data:{
      approvalId:revokeId,reason:revokeReason.trim(),
    }}),"Issuer authorization revoked. Future award issuance is denied.");
  }

  return <WorkspaceShell eyebrow="CAN OS / Credential governance"
    title="Credential Issuer Access"
    subtitle="One CAN login. Issuance requires independent, expiring approval for the exact canonical staff assignment. Being a Site Admin does not authorize awarding credentials."
    width="wide">
    <nav className="mt-6 flex flex-wrap gap-2" aria-label="Credential access workflow">
      {([
        {id:"request",label:"Request authority"},
        {id:"review",label:"Independent review"},
        {id:"revoke",label:"Revoke authority"},
      ] as const).map(item=><Button key={item.id} type="button"
        variant={tab===item.id?"default":"outline"}
        onClick={()=>{setTab(item.id);setError("");setNotice("");}}>
        {item.label}
      </Button>)}
    </nav>
    {notice&&<p className="mt-5 border border-primary p-4 text-sm" role="status">{notice}</p>}
    {error&&<p className="mt-5 border border-destructive p-4 text-sm text-destructive" role="alert">{error}</p>}
    {tab==="request"&&<section className="mt-6 max-w-3xl border border-border bg-card p-6">
      <h2 className="font-serif text-2xl">Request credential issuer authority</h2>
      <p className="mt-2 text-sm text-muted-foreground">An authorized Site Admin or Registrar may request issuance authority. Your verified active Site assignment determines the scope. The request itself grants nothing.</p>
      {my.isPending&&<p role="status" className="mt-4 text-sm">Checking your current authorization…</p>}
      {my.isError&&<p role="alert" className="mt-4 text-sm text-destructive">Your account is not yet linked to an authorized canonical staff assignment. Review your Site identity setup.</p>}
      {my.data&&<div className="mt-4 border bg-muted p-4 text-sm">
        <strong>Most recent request: {my.data.status}</strong>
        <p className="mt-1">Submitted {new Date(my.data.requestedAt).toLocaleDateString()}</p>
        {my.data.approvedUntil&&<p>Authorization expires {new Date(my.data.approvedUntil).toLocaleDateString()}</p>}
        {my.data.status==="approved"&&new Date(my.data.approvedUntil??0)<=new Date()&&
          <p className="mt-2 text-destructive">This approval has expired. An independent reviewer must revoke or close the old approval before a new request.</p>}
      </div>}
      <form className="mt-5 space-y-4" onSubmit={request}>
        <label className="block text-sm font-semibold">Evidence supporting the requested issuer responsibility
          <textarea required minLength={25} maxLength={1200} value={evidence}
            onChange={e=>setEvidence(e.target.value)}
            placeholder="Reference your organization’s independently reviewed authorization and credential policy."
            className="mt-2 min-h-28 w-full border border-border bg-background p-3 text-sm"/>
        </label>
        <Button type="submit" disabled={busy||my.isPending||my.isError||
          my.data?.status==="approved"||my.data?.status==="pending"||
          evidence.trim().length<25}>Submit for independent review</Button>
      </form>
    </section>}
    {tab==="review"&&<section className="mt-6 max-w-4xl border border-border bg-card p-6">
      <h2 className="font-serif text-2xl">Independent institutional review</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only authorized CAN network stewards can approve issuer authority. The requester and reviewer must be different verified persons. Approval automatically expires.</p>
      {pending.isPending&&<p role="status" className="mt-4 text-sm">Loading pending requests…</p>}
      {pending.isError&&<p role="alert" className="mt-4 text-sm text-destructive">No authorized institutional reviewer session is available.</p>}
      {pending.data?.length===0&&<p className="mt-4 text-sm">No pending issuer requests.</p>}
      {pending.data?.length===101&&<p className="mt-4 text-sm text-destructive">The review queue exceeds this view's limit. Narrow the review period before proceeding.</p>}
      <div className="mt-5 space-y-3">
        {pending.data?.slice(0,100).map(item=><label key={item.id}
          className={`flex cursor-pointer gap-3 border p-4 text-sm ${reviewId===item.id?"border-primary":"border-border"}`}>
          <input type="radio" name="issuer-review" checked={reviewId===item.id}
            onChange={()=>setReviewId(item.id)}/>
          <span>
            <strong>{item.nativeRole} · Site {item.nativeSiteId}</strong>
            <span className="mt-1 block text-muted-foreground">Requested {new Date(item.requestedAt).toLocaleDateString()} · Organization {item.nativeOrganizationId}</span>
            <span className="mt-2 block">Evidence: {item.evidenceReference}</span>
          </span>
        </label>)}
      </div>
      {reviewId&&<div className="mt-5 space-y-4 border-t pt-5">
        <label className="block text-sm font-semibold">Independent verification evidence
          <textarea minLength={25} maxLength={1200} value={reviewEvidence}
            onChange={e=>setReviewEvidence(e.target.value)}
            className="mt-2 min-h-28 w-full border border-border bg-background p-3 text-sm"
            placeholder="Record the institutional authority and policy evidence reviewed."/>
        </label>
        <label className="block text-sm font-semibold">Approval expiration (UTC)
          <Input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)}
            className="mt-2 max-w-xs"/>
        </label>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy||reviewEvidence.trim().length<25||!expiry||
            !Number.isFinite(new Date(expiry+"T23:59:59Z").getTime())||
            new Date(expiry+"T23:59:59Z")<=new Date()||
            new Date(expiry+"T23:59:59Z").getTime()>Date.now()+366*24*60*60*1000}
            onClick={()=>decide("approve")}>Approve with expiry</Button>
          <Button variant="outline" disabled={busy||reviewEvidence.trim().length<25}
            onClick={()=>decide("reject")}>Reject request</Button>
        </div>
      </div>}
    </section>}
    {tab==="revoke"&&<section className="mt-6 max-w-4xl border border-border bg-card p-6">
      <h2 className="font-serif text-2xl">Revoke issuer authority</h2>
      <p className="mt-2 text-sm text-muted-foreground">A revocation prevents future credential issuance and preserves historical awards and audit records.</p>
      {active.isPending&&<p role="status" className="mt-4 text-sm">Checking existing approvals…</p>}
      {active.isError&&<p role="alert" className="mt-4 text-sm text-destructive">Only independent institutional reviewers can revoke an issuer's authorization.</p>}
      {active.data?.length===0&&<p className="mt-4 text-sm">No approved issuer authorities found.</p>}
      <div className="mt-5 space-y-3">{active.data?.slice(0,100).map(item=>
        <label key={item.id} className="flex cursor-pointer gap-3 border border-border p-4 text-sm">
          <input type="radio" name="issuer-revoke" checked={revokeId===item.id}
            onChange={()=>setRevokeId(item.id)}/>
          <span><strong>Site {item.nativeSiteId}</strong>
            <span className="mt-1 block text-muted-foreground">Expires {item.approvedUntil?new Date(item.approvedUntil).toLocaleDateString():"Unknown"} · Organization {item.nativeOrganizationId}</span>
          </span>
        </label>)}</div>
      <form className="mt-5 space-y-4" onSubmit={revoke}>
        <label className="block text-sm font-semibold">Reason for revocation
          <textarea required minLength={25} maxLength={1200} value={revokeReason}
            onChange={e=>setRevokeReason(e.target.value)}
            className="mt-2 min-h-24 w-full border border-border bg-background p-3 text-sm"/>
        </label>
        <Button variant="outline" type="submit"
          disabled={!revokeId||revokeReason.trim().length<25||busy}>Revoke selected issuer</Button>
      </form>
    </section>}
  </WorkspaceShell>;
}
