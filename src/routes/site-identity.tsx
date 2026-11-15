import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeClientError } from "@/lib/client-error";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import {
  requestSiteIdentityLink, getSiteIdentityLinkStatus,
  confirmCanonicalSiteIdentityLink, listPendingSiteIdentityReviews,
  reviewSiteIdentityLink, verifyCANStaffCanonicalPrincipal,
} from "@/modules/sites/site-identity-links.functions";

type Mode="request"|"confirm"|"review"|"staff";
export const Route=createFileRoute("/site-identity")({
  validateSearch:(s:Record<string,unknown>)=>z.object({
    mode:z.enum(["request","confirm","review","staff"]).optional().catch("request"),
    siteId:z.string().uuid().optional().catch(undefined),
  }).parse(s),
  component:SiteIdentityWorkspace,
});

function SiteIdentityWorkspace(){
  const params=Route.useSearch();
  const mode:Mode=params.mode??"request";
  const client=useQueryClient();
  const [siteId,setSiteId]=useState(params.siteId??"");
  const [canonicalSiteId,setCanonicalSiteId]=useState("");
  const [evidence,setEvidence]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [target,setTarget]=useState("");
  const [revokeSiteId,setRevokeSiteId]=useState("");
  const [revokeReason,setRevokeReason]=useState("");
  const [staffAccountId,setStaffAccountId]=useState("");
  const [staffPublicSiteId,setStaffPublicSiteId]=useState("");
  const [staffCanonicalPersonId,setStaffCanonicalPersonId]=useState("");
  const [staffEvidence,setStaffEvidence]=useState("");
  const [staffAttested,setStaffAttested]=useState(false);
  const sites=useQuery({
    queryKey:["site-identity-own-sites"],
    queryFn:()=>listLaunchOptions(),enabled:mode==="request",retry:false,
  });
  const ownStatus=useQuery({
    queryKey:["site-identity-own-status",siteId],
    queryFn:()=>getSiteIdentityLinkStatus({data:{publicSiteId:siteId}}),
    enabled:mode==="request"&&!!siteId,retry:false,
  });
  const pending=useQuery({
    queryKey:["site-identity-pending-reviews"],
    queryFn:()=>listPendingSiteIdentityReviews(),
    enabled:mode==="review",retry:false,
  });

  async function run(task:()=>Promise<unknown>,message:string){
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await task();
      setNotice(message);
      await client.invalidateQueries({queryKey:["site-identity-own-status"]});
      await client.invalidateQueries({queryKey:["site-identity-pending-reviews"]});
    }catch(cause){
      setError(normalizeClientError(cause,"This Site identity action was not authorized or could not be completed.").message);
    }finally{setBusy(false);}
  }
  function request(e:FormEvent){
    e.preventDefault();
    void run(()=>requestSiteIdentityLink({data:{
      publicSiteId:siteId,canonicalSiteId,evidenceReference:evidence,
    }}),"Identity link requested. A native canonical Site operator must confirm it before independent CAN review.");
  }
  function confirm(e:FormEvent){
    e.preventDefault();
    void run(()=>confirmCanonicalSiteIdentityLink({data:{publicSiteId:siteId}}),
      "Canonical Site authority confirmed. The independent CAN reviewer can now decide.");
  }
  function verifyStaff(e:FormEvent){
    e.preventDefault();
    if(!staffAttested)return;
    void run(()=>verifyCANStaffCanonicalPrincipal({data:{
      publicAccountId:staffAccountId,
      publicSiteId:staffPublicSiteId,
      canonicalPersonId:staffCanonicalPersonId,
      evidenceReference:staffEvidence.trim(),
      identityVerified:true,
    }}),"The existing CAN account is now explicitly linked to the verified canonical Person. One CAN sign-in is sufficient for authorized Site operations.");
  }
  function review(decision:"approve"|"reject"|"revoke",overrideSiteId?:string,overrideReason?:string){
    const publicSiteId=overrideSiteId??target;
    const explanation=overrideReason??reason;
    if(!publicSiteId||explanation.trim().length<15)return;
    void run(()=>reviewSiteIdentityLink({data:{
      publicSiteId,decision,reason:explanation.trim(),
    }}),"Review decision recorded. No enrollment or publication grant was created.");
  }

  return <WorkspaceShell eyebrow="CAN OS / Site identity"
    title="Connect your Site records"
    width="wide"
    subtitle="Match the Site behind your website to the same authorized Site in canonical educational operations. A correspondence never grants publication or enrollment rights.">
    <nav aria-label="Site identity workflow roles" className="mt-6 flex flex-wrap gap-2">
      {([
        {mode:"request",label:"1 · Request",detail:"Local Site operator"},
        {mode:"confirm",label:"2 · Confirm",detail:"Canonical Site operator"},
        {mode:"review",label:"3 · Review",detail:"Independent CAN reviewer"},
        {mode:"staff",label:"4 · Connect staff",detail:"One CAN sign-in"},
      ] as const).map(item=><Link key={item.mode} to="/site-identity" search={{mode:item.mode}}
        aria-current={mode===item.mode?"page":undefined}
        className={`inline-flex min-h-11 flex-col justify-center border px-5 py-3 text-sm ${mode===item.mode?"border-primary bg-accent text-primary":"bg-card"}`}>
        <strong>{item.label}</strong><span className="text-xs text-muted-foreground">{item.detail}</span>
      </Link>)}
    </nav>
    {error&&<p className="mt-5 border border-destructive p-4 text-sm text-destructive" role="alert">{error}</p>}
    {notice&&<p className="mt-5 border border-primary p-4 text-sm" role="status">{notice}</p>}
    {mode==="request"&&<section className="mt-6 max-w-3xl border bg-card p-6">
      <h2 className="font-serif text-2xl">Request a verified Site connection</h2>
      <p className="mt-2 text-sm text-muted-foreground">Choose a Site you administer and the exact canonical Site UUID from your authorized operations workspace. Provide the review evidence reference. Matching names is not enough.</p>
      {sites.isError&&<p role="alert" className="mt-4 text-sm">Your current account cannot request Site identity connections. Use an authorized local Site registrar.</p>}
      {sites.isPending&&<p role="status" className="mt-4 text-sm">Loading your authorized Sites…</p>}
      {sites.data&&<form onSubmit={request} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Your Site
          <select required value={siteId} onChange={e=>{setSiteId(e.target.value);setNotice("");}}
            className="mt-2 min-h-11 w-full border border-border bg-background px-3">
            <option value="">Select your Site</option>
            {sites.data.sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        {ownStatus.data&&<p className="border bg-muted p-3 text-sm" role="status">
          Existing connection: <strong>{ownStatus.data.status}</strong>
          {ownStatus.data.confirmed?" · Native operator confirmed":" · Awaiting native operator"}
          {" · "}Canonical Site: {ownStatus.data.canonicalSiteId}
        </p>}
        <label className="block text-sm font-semibold">Canonical Site UUID
          <Input className="mt-2" required value={canonicalSiteId}
            onChange={e=>setCanonicalSiteId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </label>
        <label className="block text-sm font-semibold">Evidence reference
          <textarea required minLength={12} maxLength={700} value={evidence}
            onChange={e=>setEvidence(e.target.value)}
            placeholder="Reference the approved Site setup record and identity verification evidence."
            className="mt-2 min-h-24 w-full border border-border bg-background p-3 text-sm"/>
        </label>
        <Button disabled={!siteId||busy||!!ownStatus.data} type="submit">Request identity review</Button>
      </form>}
    </section>}
    {mode==="confirm"&&<section className="mt-6 max-w-3xl border bg-card p-6">
      <h2 className="font-serif text-2xl">Confirm canonical Site authority</h2>
      <p className="mt-2 text-sm text-muted-foreground">This is an initial Site setup approval performed by an authorized canonical Site operator. After independent Site and staff identity verification, the Site Admin uses their regular CAN sign-in across workspaces.</p>
      <form onSubmit={confirm} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Public Site UUID from the request
          <Input className="mt-2" required value={siteId}
            onChange={e=>setSiteId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </label>
        <Button disabled={busy||!z.string().uuid().safeParse(siteId).success} type="submit">Confirm my canonical Site</Button>
      </form>
    </section>}
    {mode==="review"&&<section className="mt-6 max-w-5xl border bg-card p-6">
      <h2 className="font-serif text-2xl">Independent Site identity review</h2>
      <p className="mt-2 text-sm text-muted-foreground">Only CAN institutional reviewers can complete this step. The requester cannot approve their own link; native Site confirmation and current authority are rechecked on approval.</p>
      {pending.isPending&&<p role="status" className="mt-4 text-sm">Loading pending Site identity reviews…</p>}
      {pending.isError&&<p role="alert" className="mt-4 text-sm">No authorized CAN institutional reviewer session is available.</p>}
      {pending.data?.length===0&&<p className="mt-4 text-sm">There are no pending requests.</p>}
      <div className="mt-4 space-y-3">{pending.data?.map(item=><div key={item.publicSiteId} className={`border p-4 ${target===item.publicSiteId?"border-primary":"border-border"}`}>
        <label className="flex items-start gap-3">
          <input type="radio" name="review-site" checked={target===item.publicSiteId}
            onChange={()=>setTarget(item.publicSiteId)}/>
          <span className="min-w-0 text-sm"><strong>{item.publicSiteName}</strong>
            <span className="block text-muted-foreground">Canonical: {item.canonicalSiteName} · {item.canonicalSiteKind}</span>
            <span className="block break-all text-xs text-muted-foreground">Public {item.publicSiteId} · Native {item.canonicalSiteId}</span>
            <span className="mt-2 block text-xs">Evidence: {item.evidenceReference}</span>
            <span className="mt-2 block text-xs font-semibold">{item.canonicalConfirmed?"Native authority confirmed":"Waiting for native confirmation"}</span>
          </span>
        </label>
      </div>)}</div>
      {target&&<div className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">Independent decision rationale
          <textarea minLength={15} maxLength={1200} value={reason} onChange={e=>setReason(e.target.value)}
            className="mt-2 min-h-24 w-full border border-border bg-background p-3 text-sm"
            placeholder="Document the verified identity evidence and reason for the decision."/>
        </label>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy||reason.trim().length<15||
            !pending.data?.find(item=>item.publicSiteId===target)?.canonicalConfirmed}
            onClick={()=>review("approve")}>Approve verified connection</Button>
          <Button variant="outline" disabled={busy||reason.trim().length<15}
            onClick={()=>review("reject")}>Reject request</Button>
        </div>
      </div>}
            <div className="mt-7 border-t pt-5">
        <h3 className="font-semibold">Revoke an existing approved relationship</h3>
        <p className="mt-1 text-xs text-muted-foreground">If an identity connection is no longer valid, enter its exact public Site UUID and a substantive reason. Revocation immediately makes its link ineligible for public enrollment projections. Historical audit records remain.</p>
        <label className="mt-4 block text-sm font-semibold">Approved public Site UUID
          <Input className="mt-2" value={revokeSiteId}
            onChange={e=>setRevokeSiteId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </label>
        <label className="mt-4 block text-sm font-semibold">Revocation reason
          <textarea minLength={15} maxLength={1200} value={revokeReason}
            onChange={e=>setRevokeReason(e.target.value)}
            className="mt-2 min-h-24 w-full border border-border bg-background p-3 text-sm"
            placeholder="Explain why this Site relationship must no longer be trusted."/>
        </label>
        <Button className="mt-3" variant="outline"
          disabled={busy||revokeReason.trim().length<15||!z.string().uuid().safeParse(revokeSiteId).success}
          onClick={()=>review("revoke",revokeSiteId,revokeReason)}>Revoke approved connection</Button>
      </div>
    </section>}
    {mode==="staff"&&<section className="mt-6 max-w-3xl border bg-card p-6">
      <h2 className="font-serif text-2xl">Connect staff to one CAN login</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        An independent CAN institutional reviewer binds an existing CAN Site Admin
        or Registrar account to the same verified canonical Person. The public
        Site must already have an approved Site identity connection, and the
        canonical Person must have an active exact-Site staff grant. Matching
        names or email addresses does not prove identity.
      </p>
      <form className="mt-5 space-y-4" onSubmit={verifyStaff}>
        <label className="block text-sm font-semibold">CAN staff account UUID
          <Input className="mt-2" required value={staffAccountId}
            onChange={e=>setStaffAccountId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </label>
        <label className="block text-sm font-semibold">Approved school Site UUID
          <Input className="mt-2" required value={staffPublicSiteId}
            onChange={e=>setStaffPublicSiteId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </label>
        <label className="block text-sm font-semibold">Verified canonical Person UUID
          <Input className="mt-2" required value={staffCanonicalPersonId}
            onChange={e=>setStaffCanonicalPersonId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/>
        </label>
        <label className="block text-sm font-semibold">Independent identity verification evidence
          <textarea required minLength={25} maxLength={1200} value={staffEvidence}
            onChange={e=>setStaffEvidence(e.target.value)}
            placeholder="Document the review reference that confirms these two accounts represent the same individual."
            className="mt-2 min-h-24 w-full border border-border bg-background p-3 text-sm"/>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={staffAttested}
            onChange={e=>setStaffAttested(e.target.checked)}/>
          <span>I independently verified the CAN and canonical Person linkage, and I am not the account holder.</span>
        </label>
        <Button type="submit" disabled={busy||!staffAttested||
          !z.string().uuid().safeParse(staffAccountId).success||
          !z.string().uuid().safeParse(staffPublicSiteId).success||
          !z.string().uuid().safeParse(staffCanonicalPersonId).success||
          staffEvidence.trim().length<25}>
          Verify staff identity link
        </Button>
      </form>
      <p className="mt-5 text-xs text-muted-foreground">
        No account or native staff grant is created here. Revocation of the
        CAN account, either staff grant, canonical principal link, or approved
        Site connection removes this access on the next request.
      </p>
    </section>}
  </WorkspaceShell>;
}
