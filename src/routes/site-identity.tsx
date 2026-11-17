import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { normalizeClientError } from "@/lib/client-error";
import {
  verifyCANStaffCanonicalPrincipal,
  revokeCANStaffCanonicalPrincipal,
} from "@/modules/sites/staff-principal-verification.functions";

/**
 * Legacy route retained for existing reviewer bookmarks. Site identity
 * correspondence is RETIRED. One platform Site ID is used everywhere.
 * This reviewer workspace is limited to the remaining independently
 * verified Person authorization migration.
 */
export const Route=createFileRoute("/site-identity")({
  validateSearch:(input:Record<string,unknown>)=>z.object({
    mode:z.enum(["staff"]).optional().catch("staff"),
    siteId:z.string().uuid().optional().catch(undefined),
  }).parse(input),
  component:StaffIdentityReview,
});

function StaffIdentityReview(){
  const {siteId:preferredSiteId}=Route.useSearch();
  const [accountId,setAccountId]=useState("");
  const [siteId,setSiteId]=useState(preferredSiteId??"");
  const [canonicalPersonId,setCanonicalPersonId]=useState("");
  const [evidence,setEvidence]=useState("");
  const [attested,setAttested]=useState(false);
  const [revokeAccountId,setRevokeAccountId]=useState("");
  const [revokeReason,setRevokeReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const uuid=z.string().uuid();

  async function run(task:()=>Promise<unknown>,success:string){
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      await task();
      setNotice(success);
    }catch(cause){
      setError(normalizeClientError(cause,
        "This independent staff review was not authorized or could not be completed.").message);
    }finally{setBusy(false);}
  }

  function verify(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!attested||busy||!uuid.safeParse(accountId).success||
      !uuid.safeParse(siteId).success||!uuid.safeParse(canonicalPersonId).success||
      evidence.trim().length<25)return;
    void run(()=>verifyCANStaffCanonicalPrincipal({data:{
      publicAccountId:accountId,publicSiteId:siteId,
      canonicalPersonId,evidenceReference:evidence.trim(),identityVerified:true,
    }}),"Staff Person verification recorded. Site access still requires a current scoped grant.");
  }
  function revoke(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||!uuid.safeParse(revokeAccountId).success||revokeReason.trim().length<25)return;
    void run(()=>revokeCANStaffCanonicalPrincipal({data:{
      publicAccountId:revokeAccountId,reason:revokeReason.trim(),
    }}),"Staff Person verification revoked. The CAN account and historical audit remain.");
  }

  return <WorkspaceShell eyebrow="CAN OS / Access" title="Staff identity review"
    width="wide" subtitle="Independent verification of an existing staff Person and scoped role. There is one Site ID, not a public-to-canonical Site identity link.">
    <section className="mt-6 max-w-3xl border border-border bg-card p-6">
      <h2 className="font-serif text-2xl">Verify existing staff authority</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Only an authorized independent institutional reviewer can verify the Person
        associated with an existing CAN staff account. The platform Site UUID must
        match the active native staff grant exactly. Neither Site creation nor
        identity review creates a Class, staff grant, or publication approval.
      </p>
      {error&&<p role="alert" className="mt-4 border border-destructive p-3 text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="mt-4 border border-border p-3 text-sm">{notice}</p>}
      <form onSubmit={verify} className="mt-5 space-y-4">
        <label className="block text-sm font-semibold">CAN staff account UUID
          <Input className="mt-2" required value={accountId}
            onChange={e=>setAccountId(e.target.value)}/>
        </label>
        <label className="block text-sm font-semibold">Shared Site UUID
          <Input className="mt-2" required value={siteId}
            onChange={e=>setSiteId(e.target.value)}/>
        </label>
        <label className="block text-sm font-semibold">Verified native Person UUID
          <Input className="mt-2" required value={canonicalPersonId}
            onChange={e=>setCanonicalPersonId(e.target.value)}/>
        </label>
        <label className="block text-sm font-semibold">Independent verification evidence
          <Textarea required minLength={25} maxLength={1200} value={evidence}
            onChange={e=>setEvidence(e.target.value)}
            className="mt-2 min-h-24" />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={attested}
            onChange={e=>setAttested(e.target.checked)}/>
          <span>I independently verified the staff Person and am not the account holder.</span>
        </label>
        <Button type="submit" disabled={busy||!attested||
          !uuid.safeParse(accountId).success||!uuid.safeParse(siteId).success||
          !uuid.safeParse(canonicalPersonId).success||evidence.trim().length<25}>
          Verify staff identity
        </Button>
      </form>
    </section>
    <section className="mt-6 max-w-3xl border border-border bg-card p-6">
      <h2 className="font-serif text-xl">Revoke a staff Person verification</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Revocation does not remove the CAN account or historical audit records.
      </p>
      <form onSubmit={revoke} className="mt-4 space-y-4">
        <label className="block text-sm font-semibold">CAN account UUID
          <Input className="mt-2" required value={revokeAccountId}
            onChange={e=>setRevokeAccountId(e.target.value)}/>
        </label>
        <label className="block text-sm font-semibold">Revocation reason
          <Textarea required minLength={25} maxLength={1200} value={revokeReason}
            onChange={e=>setRevokeReason(e.target.value)} className="mt-2 min-h-24"/>
        </label>
        <Button variant="outline" type="submit" disabled={busy||
          !uuid.safeParse(revokeAccountId).success||revokeReason.trim().length<25}>
          Revoke staff verification
        </Button>
      </form>
    </section>
  </WorkspaceShell>;
}
