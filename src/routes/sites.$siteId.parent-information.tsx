import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import {
  getPublicParentIdentityReview, setPublicParentIdentityReview,
} from "@/modules/sites/site-parent-identity-review.functions";

export const Route=createFileRoute("/sites/$siteId/parent-information")({
  loader:({params})=>safeLoader(
    ()=>getPublicParentIdentityReview({data:{siteId:params.siteId}}),
    {authMessage:"Only an authorized institutional Site publisher can review public identity claims."},
  )(),
  component:SiteParentInformationReviewPage,
});

function SiteParentInformationReviewPage(){
  const outcome=Route.useLoaderData();
  if(!outcome.ok)return <LoaderFailure eyebrow="Institutional publishing"
    title="Public parent information review" outcome={outcome}/>;
  return <SiteParentInformationEditor
    key={outcome.data.siteRevision+":"+outcome.data.reviewRevision}
    data={outcome.data}/>;
}

const reviewStatusLabels={
  never_reviewed:"Never reviewed",
  approved:"Approved and current",
  expired:"Review expired or lacks a valid expiry",
  source_changed:"Source changed — reapproval required",
  withdrawn:"Withdrawn",
  invalid_review:"Invalid approval record — reapproval required",
} as const;

function SiteParentInformationEditor({data}:{
  data:Awaited<ReturnType<typeof getPublicParentIdentityReview>>
}){
  const router=useRouter();
  const mutation=useMutationFeedback(()=>router.invalidate());
  const [addressDecision,setAddressDecision]=useState<"approve"|"withdraw">(
    data.address.publicApproved?"approve":"withdraw");
  const [contactDecision,setContactDecision]=useState<"approve"|"withdraw">(
    data.contact.publicApproved?"approve":"withdraw");
  const [publicLocationConfirmed,setPublicLocationConfirmed]=useState(false);
  const [schoolControlledContactConfirmed,setSchoolControlledContactConfirmed]=useState(false);
  const [reviewed,setReviewed]=useState(false);
  const [reason,setReason]=useState("");
  const [evidenceReference,setEvidenceReference]=useState("");
  const [expiresOn,setExpiresOn]=useState(data.expiresOn??"");
  const [attempted,setAttempted]=useState(false);
  const busy=mutation.pending||mutation.refreshFailed;
  const location=data.address.value;
  const contact=data.contact.value;
  const approvalRequested=addressDecision==="approve"||contactDecision==="approve";

  async function save(event:FormEvent){
    event.preventDefault();
    setAttempted(true);
    if((addressDecision==="approve"&&(!location||!publicLocationConfirmed))||
      (contactDecision==="approve"&&(!contact||!schoolControlledContactConfirmed))||
      (approvalRequested&&!expiresOn)||evidenceReference.trim().length<10||reason.trim().length<10||!reviewed)return;
    await mutation.run(()=>setPublicParentIdentityReview({data:{
      siteId:data.siteId,
      expectedSiteRevision:data.siteRevision,
      expectedReviewRevision:data.reviewRevision,
      addressDecision,contactDecision,
      expectedAddressDigest:addressDecision==="approve"?data.address.digest:null,
      expectedContactDigest:contactDecision==="approve"?data.contact.digest:null,
      publicLocationConfirmed:addressDecision==="approve"&&publicLocationConfirmed,
      schoolControlledContactConfirmed:contactDecision==="approve"&&schoolControlledContactConfirmed,
      expiresOn:addressDecision==="approve"||contactDecision==="approve"
        ? expiresOn||null:null,
      reviewed:true,reason,evidenceReference,
    }}),{
      successMessage:"Public identity review saved. This does not authorize opening or admissions.",
      commandErrorMessage:"Unable to publish or withdraw the reviewed Site identity. Refresh and review the current source.",
    });
  }
  return <WorkspaceShell eyebrow="Institutional publishing"
    title="Public address and contact review"
    subtitle="Independent approval of exact existing Site facts; never a second Site configuration.">
    <p className="mt-4 text-sm"><Link to="/sites/$siteId/publish"
      params={{siteId:data.siteId}} className="underline">
      Return to Site publication</Link></p>
    <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
      Nothing is published by saving a physical address or draft contact alone.
      An institutional publisher must review what families are allowed to see.
      Revoking this review immediately withdraws the public fact on the next
      anonymous read. This review does not confirm that a campus is open for visitors.
    </p>
    <MutationFeedback state={mutation} className="mt-5"
      pendingMessage="Saving the institutional review…"/>
    <section className="mt-5 rounded-xl border bg-card p-4" aria-label="Review provenance">
      <h2 className="text-sm font-semibold">Institutional review history</h2>
      <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Most recent review</dt>
          <dd>{data.reviewedAt?new Date(data.reviewedAt).toLocaleDateString():"Never reviewed"}</dd></div>
        <div><dt className="text-muted-foreground">Current review expiry</dt>
          <dd>{data.expiresOn??"No valid expiry on file"}</dd></div>
        <div><dt className="text-muted-foreground">Address</dt>
          <dd>{reviewStatusLabels[data.address.status]}</dd></div>
        <div><dt className="text-muted-foreground">Contact</dt>
          <dd>{reviewStatusLabels[data.contact.status]}</dd></div>
      </dl>
      {data.evidenceReference&&<p className="mt-2 text-xs text-muted-foreground">
        Previous institutional evidence: {data.evidenceReference}
      </p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Approval status is recalculated from current canonical Site facts; editing the
        Site location or contact can invalidate a previous publication decision.
      </p>
    </section>

    <form noValidate onSubmit={save} className="mt-6 space-y-5">
      <fieldset className="rounded-xl border bg-card p-5">
        <legend className="px-2 text-lg font-semibold">Public school location</legend>
        {location?<p className="text-sm">{location.street1}
          {location.street2?", "+location.street2:""}, {location.city}, {location.state} {location.postalCode}, {location.country}</p>:
          <p className="text-sm">No valid current physical location; public address approval is unavailable.</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Current public review: {reviewStatusLabels[data.address.status]}.
          A legal or billing address is not necessarily an address to show families.
        </p>
        <Field label="Publication decision" className="mt-3 text-sm">
          <Select
            value={addressDecision} disabled={busy}
            onChange={e=>{setAddressDecision(e.target.value as "approve"|"withdraw");setReviewed(false);}}>
            <option value="withdraw">Keep private / withdraw public address</option>
            <option value="approve" disabled={!location}>Approve exact public address</option>
          </Select>
        </Field>
        {addressDecision==="approve"&&<Field className="mt-3 text-sm"
          label="I independently verified this exact address is suitable for public school communications, is authorized for disclosure, and is not solely a private legal or billing address."
          required error={attempted&&!publicLocationConfirmed?"Confirm that this exact address is authorized for public disclosure.":undefined}>
          <Checkbox checked={publicLocationConfirmed} disabled={busy} onChange={e=>setPublicLocationConfirmed(e.target.checked)}/>
        </Field>}
      </fieldset>
      <fieldset className="rounded-xl border bg-card p-5">
        <legend className="px-2 text-lg font-semibold">School-controlled public contact</legend>
        {contact?<div className="text-sm">
          <p>Display: {contact.displayName}</p>
          <p>Email: {contact.email||"Not supplied"} · Phone: {contact.phone||"Not supplied"}</p>
          <p>Website: {contact.website||"Not supplied"}</p>
        </div>:<p className="text-sm">No valid current Site contact; public approval is unavailable.</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          Current public review: {reviewStatusLabels[data.contact.status]}.
          Never publish an employee's private contact details without the right to do so.
        </p>
        <Field label="Publication decision" className="mt-3 text-sm">
          <Select
            value={contactDecision} disabled={busy}
            onChange={e=>{setContactDecision(e.target.value as "approve"|"withdraw");setReviewed(false);}}>
            <option value="withdraw">Keep private / withdraw public contact</option>
            <option value="approve" disabled={!contact}>Approve exact public contact</option>
          </Select>
        </Field>
        {contactDecision==="approve"&&<Field className="mt-3 text-sm"
          label="I verified the listed channels are school-controlled and may be displayed to the public, not a staff member's private phone or email."
          required error={attempted&&!schoolControlledContactConfirmed?"Confirm that the listed channels may be published.":undefined}>
          <Checkbox checked={schoolControlledContactConfirmed} disabled={busy} onChange={e=>setSchoolControlledContactConfirmed(e.target.checked)}/>
        </Field>}
      </fieldset>
      {(addressDecision==="approve"||contactDecision==="approve")&&
        <Field label="Approval expiry (within 12 months)" required className="text-sm"
          error={attempted&&!expiresOn?"Choose an expiry date for the public approval.":undefined}>
          <Input type="date" value={expiresOn} disabled={busy} onChange={e=>setExpiresOn(e.target.value)}/>
        </Field>}
      <Field label="Institutional evidence reference" required className="text-sm"
        error={attempted&&evidenceReference.trim().length<10?"Enter at least 10 characters identifying the evidence reviewed.":undefined}>
        <Input minLength={10} maxLength={500} value={evidenceReference} disabled={busy}
          onChange={e=>setEvidenceReference(e.target.value)}
          placeholder="Reviewed school contact proof or location disclosure authorization"/>
      </Field>
      <Field label="Review reason" required className="text-sm"
        error={attempted&&reason.trim().length<10?"Enter at least 10 characters explaining the review.":undefined}>
        <Textarea minLength={10} maxLength={500} value={reason} disabled={busy}
          onChange={e=>setReason(e.target.value)}/>
      </Field>
      <Field label="I reviewed both publication decisions against current Site configuration. Publication, legal authorization, and admissions remain separate." required
        error={attempted&&!reviewed?"Confirm that you reviewed both publication decisions.":undefined}>
        <Checkbox checked={reviewed} disabled={busy} onChange={e=>setReviewed(e.target.checked)}/>
      </Field>
      <Button type="submit" disabled={busy}>
        {busy?"Saving review…":"Save institutional public identity review"}
      </Button>
    </form>
  </WorkspaceShell>;
}
