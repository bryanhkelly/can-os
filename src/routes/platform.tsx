import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { normalizeClientError } from "@/lib/client-error";
import { approveAdultClassLearnerReview, revokeAdultClassLearnerReview } from "@/modules/classes/native-class-adult-review.functions";
import { ActionFooter, DirectoryTable, StatCard, WorkspaceNotice, WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { readPlatformAdminOverview } from "@/modules/identity/platform-admin.functions";

import { PlatformCatalogManager } from "@/components/platform/PlatformCatalogManager";
import { PlatformOwnerDelegationPanel } from "@/components/platform/PlatformOwnerDelegationPanel";
import { PlatformOwnerPilotAccessPanel } from "@/components/platform/PlatformOwnerPilotAccessPanel";
import { UniversalEngagementPublisher } from "@/components/launch-studio/UniversalEngagementPublisher";
import { SiteEngagementLibrary } from "@/components/launch-studio/SiteEngagementLibrary";
import type { OwnerEngagementSurface } from "@/components/links/OwnerEngagementDestinationPicker";
import { PlatformReportingHealth } from "@/components/platform/PlatformReportingHealth";
import { PlatformAccountHealth } from "@/components/platform/PlatformAccountHealth";
import { PlatformAcademicIntegrity } from "@/components/platform/PlatformAcademicIntegrity";
import { PlatformReleaseCenter } from "@/components/platform/PlatformReleaseCenter";

export const Route = createFileRoute("/platform")({
  loader: () => safeLoader(() => readPlatformAdminOverview())(),
  component: PlatformAdministration,
});

function PlatformAdministration() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <WorkspaceShell width="wide" eyebrow="CAN OS · Platform"
      title="Platform administration"
      subtitle="This area requires a verified App Admin or Platform Owner account.">
      <p role="alert" className="mt-6 border border-destructive p-4 text-sm text-destructive">
        {result.message}
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Site Admin and Registrar grants do not authorize platform administration.
        An authorized operator must provision the account-wide App Admin or Platform Owner membership.
      </p>
    </WorkspaceShell>;
  }
  const summary = result.data;
  const engagementSurface:OwnerEngagementSurface={owner:{kind:"platform"},sites:summary.siteReadiness.map(site=>({id:site.siteId,name:site.siteName}))};
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Platform"
    title="Platform administration"
    subtitle="Aggregate platform inventory. School operations and independent approvals retain their own permissions.">
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {([
        ["Organizations", summary.organizations],
        ["Sites", summary.sites],
        ["Active App Admin grants", summary.activePlatformAdmins],
      ] as const).map(([label, value]) => <StatCard key={label} label={label} value={value}/>)}
    </div>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Site operations readiness</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Each Site has one platform identity. This view shows Site lifecycle and
        whether an operational delivery assignment exists; it does not approve permissions.
      </p>
      <DirectoryTable label="Site identity readiness" caption="Authoritative Site identities and delivery assignments."
        rows={summary.siteReadiness} rowKey={site=>site.siteId}
        empty={<p className="p-4 text-sm text-muted-foreground">No Sites are registered in the school directory.</p>}
        columns={[
          {id:"site",title:"Site",render:site=>site.siteName},
          {id:"provisioning",title:"Delivery assignment",render:site=>site.hasDeliveryAssignment?"Assigned":"Not assigned"},
          {id:"lifecycle",title:"Site lifecycle",render:site=>site.siteLifecycle.replaceAll("_"," ")},
        ]}/>
      {summary.sites > summary.siteReadiness.length &&
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the first 100 Sites. Use the authorized reporting workflow for a complete inventory.
        </p>}
    </section>
    {summary.platformOwner && <PlatformOwnerPilotAccessPanel/>}
    {summary.platformOwner && <PlatformOwnerDelegationPanel/>}
    <PlatformAccountHealth health={summary.accountHealth}/>
    <PlatformReportingHealth/>
    <PlatformAcademicIntegrity integrity={summary.academicIntegrity}/>
    <PlatformCatalogManager/>
    <PlatformReleaseCenter records={summary.publisherReleaseReadiness}
      limited={summary.publisherReleasesLimited}/>

    {summary.platformOwner&&<section className="mt-6 space-y-4"><h2 className="font-serif text-xl">Platform invitations and distribution</h2><p className="text-sm text-muted-foreground">Platform-owned invitations do not establish an institutional partnership or approve training. Only already eligible registration destinations appear.</p><UniversalEngagementPublisher ownerSurface={engagementSurface}/><SiteEngagementLibrary ownerSurface={engagementSurface}/></section>}
    <AdultLearnerReviewSection ready={summary.reviewedAdultIdentityReady} cases={summary.reviewCases}/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Administration boundaries</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Platform-wide planning authoring does not grant Site-specific Class authority,
        institutional Blueprint approval, or access to individual learner records.
        Privileged platform mutations require separate audited server commands.
      </p>
    </section>
  </WorkspaceShell>;
}

/**
 * Controlled App Admin review. Only a reviewer who has independently
 * examined identity and age evidence can approve. The backend never trusts
 * these fields without a current non-demo platform grant and exact-person
 * checks. No person is enrolled or granted Site rights by this form.
 */
function AdultLearnerReviewSection({ready,cases}:{
  ready:boolean;
  cases:Array<{
    accessAccountId:string;status:string;reviewedAt:string;activated:boolean;
  }>;
}){
  const [accountId,setAccountId]=useState("");
  const [organizationId,setOrganizationId]=useState("");
  const [birthDate,setBirthDate]=useState("");
  const [evidenceReference,setEvidenceReference]=useState("");
  const [evidenceChecked,setEvidenceChecked]=useState(false);
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  async function approve(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!ready||!evidenceChecked||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      await approveAdultClassLearnerReview({data:{
        accessAccountId:accountId,organizationId,
        verifiedBirthDate:birthDate,evidenceReference,
        evidenceIndependentlyChecked:true,
      }});
      setMessage("Adult identity review approved. The learner may continue with their existing CAN sign-in.");
      setEvidenceChecked(false);setBirthDate("");setEvidenceReference("");
    }catch(e){setError(normalizeClientError(e,"Identity review was not approved.").message);}
    finally{setBusy(false);}
  }
  async function revoke(){
    if(!ready||busy||!reason.trim())return;
    setBusy(true);setError("");setMessage("");
    try{
      const result=await revokeAdultClassLearnerReview({data:{accessAccountId:accountId,reason}});
      setMessage(result.alreadyRevoked?"This review was already revoked.":
        "Review revoked. Native learner sessions and grants issued from this review were invalidated.");
      setReason("");
    }catch(e){setError(normalizeClientError(e,"Identity review could not be revoked.").message);}
    finally{setBusy(false);}
  }
  return <section className="mt-6 border border-border bg-card p-5" aria-label="Adult learner identity review">
    <h2 className="font-serif text-xl">Adult learner identity review</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">
      Independently verify the adult's identity and date of birth using evidence retained in
      an approved secure system. This decision establishes eligibility for one CAN login,
      not Class enrollment, Site membership, or staff access.
    </p>
    {!ready?<p role="status" className="mt-4 border border-border p-3 text-sm">
      Reviewer workflow unavailable. The reviewed-adult evidence migration and
      forced row-level security must be verified before identity decisions can be recorded.
    </p>:<>
      <div className="mt-5 border border-border p-4">
        <h3 className="text-sm font-semibold">Recent identity review decisions</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Account identifiers and lifecycle status only. Verified birth dates,
          document references and private identity evidence are not displayed.
        </p>
        {cases.length===0?<p className="mt-3 text-sm text-muted-foreground">
          No adult identity decisions have been recorded.
        </p>:<div className="mt-3 max-h-72 overflow-y-auto divide-y divide-border">
          {cases.map(item=><div className="flex flex-wrap items-center justify-between gap-3 py-3" key={item.accessAccountId}>
            <div>
              <p className="font-mono text-xs break-all">{item.accessAccountId}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.status.replaceAll("_"," ")} · Reviewed {new Date(item.reviewedAt).toLocaleDateString()}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm"
              onClick={()=>setAccountId(item.accessAccountId)}>Select account</Button>
          </div>)}
        </div>}
      </div>
      <form className="mt-5 grid gap-4" onSubmit={e=>void approve(e)}>
        <Field label="CAN account ID" required>
          <Input required value={accountId} onChange={e=>setAccountId(e.target.value)}
            placeholder="Verified account UUID"/>
        </Field>
        <Field label="Canonical learner home Organization ID" required>
          <Input required value={organizationId} onChange={e=>setOrganizationId(e.target.value)}
            placeholder="Active organization UUID"/>
        </Field>
        <Field label="Independently verified date of birth" required>
          <Input required type="date" value={birthDate} onChange={e=>setBirthDate(e.target.value)}/>
        </Field>
        <Field label="Secure evidence reference" required>
          <Input required value={evidenceReference} onChange={e=>setEvidenceReference(e.target.value)}
            placeholder="document:xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx"/>
        </Field>
        <Label className="flex items-start gap-3 text-sm leading-6">
          <Checkbox required checked={evidenceChecked}
            onChange={e=>setEvidenceChecked(e.target.checked)} className="mt-1"/>
          I independently checked identity and adult eligibility, and the secure evidence
          reference identifies an independently approved, restricted document for this exact CAN Person.
        </Label>
        <ActionFooter layout="form">
          <Button type="submit" disabled={!evidenceChecked||busy} loading={busy} loadingLabel="Recording review...">
            Approve adult learner identity
          </Button>
        </ActionFooter>
      </form>
      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Revoke an existing adult review</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Uses the CAN account ID above. Revocation ends dependent native learner credentials
          but preserves Class records and the original review evidence.
        </p>
        <Field label="Reason for revocation" className="mt-3">
          <Input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}
            placeholder="Required audit reason, at least 10 characters"/>
        </Field>
        <Button className="mt-3" type="button" variant="outline"
          disabled={busy||!accountId||reason.trim().length<10}
          onClick={()=>void revoke()}>Revoke reviewed identity</Button>
      </div>
      {message&&<WorkspaceNotice tone="success" className="mt-4">{message}</WorkspaceNotice>}
      {error&&<WorkspaceNotice tone="danger" className="mt-4">{error}</WorkspaceNotice>}
    </>}
  </section>;
}
