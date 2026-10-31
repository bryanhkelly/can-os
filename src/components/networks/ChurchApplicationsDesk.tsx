import { useEffect, useState } from "react";
import {
  approveChurchOnboardingRequest, declineChurchOnboardingRequest,
  listChurchOnboardingRequests, verifyChurchOnboardingRequest, resendApprovedChurchInvitation,
} from "@/modules/networks/network-steward.functions";
import { cancelChurchOnboardingRequest, requestChurchOnboardingEvidence } from "@/modules/networks/church-applications.functions";

type Applications = Awaited<ReturnType<typeof listChurchOnboardingRequests>>;
const field = "mt-1 w-full rounded-lg border bg-background p-2 text-sm";

export function ChurchApplicationsDesk() {
  const [applications, setApplications] = useState<Applications>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [evidenceReference, setEvidenceReference] = useState<Record<string, string>>({});
  const [verificationMethod, setVerificationMethod] = useState<Record<string, "signed_authority" | "denominational_confirmation" | "independent_church_confirmation">>({});
  const [declineNote, setDeclineNote] = useState<Record<string, string>>({});
  const [followupNote, setFollowupNote] = useState<Record<string, string>>({});
  const [cancelConfirm, setCancelConfirm] = useState<Record<string, boolean>>({});
  const [reviewChecklist, setReviewChecklist] = useState<Record<string, { source: boolean; authority: boolean; identity: boolean; expiry: boolean }>>({});
  const checklistComplete = (id: string) => {
    const check = reviewChecklist[id];
    return !!check && check.source && check.authority && check.identity && check.expiry;
  };

  async function refresh() {
    const records = await listChurchOnboardingRequests();
    setApplications(records);
  }
  useEffect(() => {
    void refresh().catch(() => setError("Unable to load church applications."))
      .finally(() => setLoading(false));
  }, []);
  async function act(id: string, operation: "verify" | "approve" | "decline" | "followup" | "cancel") {
    setWorking(id); setError(""); setNotice("");
    try {
      if (operation === "verify") {
        await verifyChurchOnboardingRequest({ data: { requestId: id, evidenceReference: evidenceReference[id] ?? "", verificationMethod: verificationMethod[id] ?? "signed_authority" } });
        setNotice("Independent authority evidence recorded. Another CAN steward must approve the invitation.");
      } else if (operation === "approve") {
        const result = await approveChurchOnboardingRequest({ data: id });
        setNotice(result.emailSent
          ? "Church and Site prepared. Email accepted by the provider, not confirmed delivered; access starts on secure invitation acceptance."
          : "Church and Site prepared, but email delivery is unconfirmed. Check the mail provider and resend access.");
      } else if (operation === "cancel") {
        await cancelChurchOnboardingRequest({ data: id });
        setNotice("Application canceled. Previous evidence is invalidated; no invitation was issued.");
      } else if (operation === "followup") {
        const result = await requestChurchOnboardingEvidence({ data: { requestId: id, note: followupNote[id] ?? "" } });
        setNotice(result.providerAccepted
          ? "Evidence follow-up accepted by the email provider; delivery is not confirmed. Approval is blocked pending fresh verification."
          : "Evidence follow-up recorded, but the email was not accepted by the provider. Contact the applicant through an independently established channel.");
      } else {
        const result = await declineChurchOnboardingRequest({ data: { requestId: id, note: declineNote[id] ?? "" } });
        setNotice(result.providerAccepted
          ? "Application declined and authority evidence invalidated. Decision notice accepted by the provider, not confirmed delivered."
          : "Application declined and authority evidence invalidated. Decision email was not accepted by the provider; follow up through a verified channel.");
      }
      setCancelConfirm(previous => ({ ...previous, [id]: false }));
      setEvidenceReference(previous => ({...previous, [id]: ""})); setDeclineNote(previous => ({...previous, [id]: ""})); setFollowupNote(previous => ({...previous, [id]: ""})); setReviewChecklist(previous => { const next = { ...previous }; delete next[id]; return next; });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to complete church review.");
    } finally { setWorking(null); }
  }

  return <section className="mt-6 rounded-xl border bg-card p-5" aria-label="Church application review">
    <h2 className="font-serif text-2xl">Church partnership applications</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      New churches apply at <a href="/church/apply" className="underline">/church/apply</a>.
      CAN must independently confirm church authority and record a verifiable external evidence reference.
      A different CAN steward approves provisioning. No application alone authorizes a school to open.
    </p>
    {loading&&<p role="status" className="mt-3 text-sm">Loading church requests…</p>}
    {error&&<p role="alert" className="mt-3 rounded-lg border border-destructive p-3 text-sm">{error}</p>}
    {notice&&<p role="status" className="mt-3 rounded-lg border p-3 text-sm">{notice}</p>}
    <div className="mt-4 space-y-4">
      {applications.filter(x=>x.status==="submitted"||x.status==="needs_evidence"||x.status==="verified").map(request =>
        <article key={request.id} className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{request.churchName}</h3>
            <span className="text-xs font-semibold uppercase tracking-wider">{request.status}</span>
          </div>
          <p className="mt-1 text-sm">{request.siteName} · {request.timezone}</p>
          <p className="text-sm">{request.firstName} {request.lastName} · {request.leaderTitle} · {request.contactEmail}</p>
          {request.churchWebsite&&<a href={request.churchWebsite} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm underline">Church website</a>}
          <p className="mt-1 text-xs text-muted-foreground">Received {new Date(request.createdAt).toLocaleDateString()} · Request {request.id}</p>
          {request.status!=="verified" ? <div className="mt-4 space-y-3">
            {request.status==="needs_evidence" && <p role="status" className="rounded border p-3 text-sm">Additional evidence requested. Fresh independent verification is required before approval. Do not rely on an applicant-submitted claim alone.</p>}
            <p className="text-xs text-muted-foreground">Review church records and contact an independently established church authority. Do not rely solely on this application, its email address, or its website.</p>
            <label className="block text-sm font-semibold">How authority was verified
              <select className={field} value={verificationMethod[request.id] ?? "signed_authority"} onChange={e=>setVerificationMethod(previous=>({...previous,[request.id]:e.target.value as "signed_authority" | "denominational_confirmation" | "independent_church_confirmation"}))}>
                <option value="signed_authority">Reviewed signed authorization</option>
                <option value="denominational_confirmation">Independent denomination confirmation</option>
                <option value="independent_church_confirmation">Independent church officer confirmation</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">External evidence record or reference
              <input required minLength={8} maxLength={500} className={field} value={evidenceReference[request.id] ?? ""}
                onChange={e=>setEvidenceReference(previous=>({...previous,[request.id]:e.target.value}))} placeholder="Document vault reference or verified contact record" />
            </label>
            <button type="button" disabled={!!working||(evidenceReference[request.id] ?? "").trim().length<8}
              onClick={()=>void act(request.id,"verify")}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
              Record independent verification
            </button>
          </div> : <div className="mt-4 space-y-3">
            <p className="text-sm">Authority recorded by the verifying steward. A different CAN steward must independently review this evidence before issuing access.</p>
            {request.authorityEvidence ? <div className="rounded-lg border bg-background p-3 text-sm">
              <p><strong>Verification method:</strong> {request.authorityEvidence.method.replaceAll("_"," ")}</p>
              <p className="mt-1 break-words"><strong>External evidence reference:</strong> {request.authorityEvidence.reference}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Verified {request.authorityEvidence.verifiedAt ? new Date(request.authorityEvidence.verifiedAt).toLocaleString() : "at an unknown time"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Expires {request.authorityEvidence.expiresAt ? new Date(request.authorityEvidence.expiresAt).toLocaleString() : "not recorded"}</p>
              {!request.authorityEvidence.usable && <p role="alert" className="mt-2 text-sm font-semibold text-destructive">Evidence is expired, unbound, or cannot be approved by this steward. Approval is blocked.</p>}
              <p className="mt-1 text-xs text-muted-foreground">Check the independent source yourself. A reference alone is not proof of church authority.</p>
            </div> : <p role="alert" className="text-sm text-destructive">Authority evidence is missing; approval is unavailable.</p>}
            <fieldset className="space-y-2 rounded-lg border p-3 text-sm" disabled={!!working || !request.authorityEvidence?.usable}>
              <legend className="px-1 font-semibold">Independent approval checklist</legend>
              {([
                ["source", "Confirmed the evidence source independently; not from application-submitted contact details"],
                ["authority", "Confirmed this person is authorized to represent the church"],
                ["identity", "Matched church, named representative, and invitation email to the verified record"],
                ["expiry", "Checked evidence provenance, authenticity, and expiration"],
              ] as const).map(([key, label]) => <label key={key} className="flex items-start gap-2">
                <input type="checkbox" checked={reviewChecklist[request.id]?.[key] ?? false}
                  onChange={e=>setReviewChecklist(previous=>({
                    ...previous,
                    [request.id]: { source: false, authority: false, identity: false, expiry: false,
                      ...previous[request.id], [key]: e.target.checked },
                  }))} />
                {label}
              </label>)}
            </fieldset>
            <button type="button" disabled={!!working||!request.authorityEvidence?.usable||!checklistComplete(request.id)}
              onClick={()=>void act(request.id,"approve")}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
              Approve and invite church leader
            </button>
          </div>}
          {request.status!=="needs_evidence" && <details className="mt-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Request missing authority evidence</summary>
            <p className="mt-2 text-xs text-muted-foreground">Send only the minimum missing information. Do not request sensitive IDs or student records by ordinary email. This invalidates previous authority evidence and requires fresh CAN verification.</p>
            <label className="mt-2 block text-sm">Applicant-facing follow-up details
              <textarea minLength={15} maxLength={1000} className={field}
                value={followupNote[request.id] ?? ""}
                onChange={e=>setFollowupNote(previous=>({...previous,[request.id]:e.target.value}))} />
            </label>
            <button type="button" disabled={!!working||(followupNote[request.id] ?? "").trim().length<15}
              onClick={()=>void act(request.id,"followup")}
              className="mt-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
              Request evidence and notify applicant
            </button>
          </details>}
          <details className="mt-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Cancel duplicate or withdrawn request</summary>
            <p className="mt-2 text-xs text-muted-foreground">Cancel only after confirming withdrawal or duplication through an established channel. This invalidates prior evidence.</p>
            <label className="mt-2 flex items-start gap-2 text-sm">
              <input type="checkbox" checked={cancelConfirm[request.id] ?? false}
                onChange={e=>setCancelConfirm(previous=>({...previous,[request.id]:e.target.checked}))} />
              I independently confirmed this request was withdrawn or is a duplicate.
            </label>
            <button type="button" disabled={!!working || !cancelConfirm[request.id]}
              onClick={()=>void act(request.id,"cancel")}
              className="mt-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
              Confirm cancellation
            </button>
          </details>
          <details className="mt-4 rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-semibold">Decline application</summary>
            <label className="mt-2 block text-sm">Reason for decision
              <textarea minLength={10} maxLength={1000} className={field} value={declineNote[request.id] ?? ""}
                onChange={e=>setDeclineNote(previous=>({...previous,[request.id]:e.target.value}))}/>
            </label>
            <button type="button" disabled={!!working||(declineNote[request.id] ?? "").trim().length<10}
              onClick={()=>void act(request.id,"decline")} className="mt-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">
              Confirm decline
            </button>
          </details>
        </article>)}
      {!loading&&!applications.some(x=>x.status==="submitted"||x.status==="needs_evidence"||x.status==="verified")&&
        <p className="text-sm text-muted-foreground">No church applications awaiting review.</p>}
    </div>
    {applications.some(x=>x.status==="approved")&&<details className="mt-5 rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-semibold">Recently approved churches</summary>
      <ul className="mt-3 space-y-2 text-sm">
        {applications.filter(x=>x.status==="approved").map(x=><li key={x.id} className="rounded-lg border p-3">
          <strong>{x.churchName}</strong> · {x.siteName} · {x.contactEmail}
          <p className="mt-1 text-xs text-muted-foreground">
            {x.invitationAcceptedAt
              ? `Leader accepted secure access on ${new Date(x.invitationAcceptedAt).toLocaleString()}. School setup is available under their Site.`
              : "Leader has not accepted the invitation. School setup remains inaccessible until secure acceptance."}
          </p>
          {!x.invitationAcceptedAt&&<button type="button" disabled={!!working} className="mt-2 rounded border px-2 py-1 text-xs disabled:opacity-50"
            onClick={async ()=>{
              setWorking(x.id);setError("");setNotice("");
              try { const result=await resendApprovedChurchInvitation({data:x.id});setNotice(result.deliveryStatus==="dispatched" ? "Email accepted by the configured sender; leader acceptance is still pending." : result.deliveryStatus==="cooldown" ? "Recent access link still in cooldown; try again shortly." : result.deliveryStatus==="already_accepted" ? "The leader has already accepted access; refresh the desk." : "Access link not sent; review the account and pending invitation."); }
              catch(cause){setError(cause instanceof Error?cause.message:"Unable to request access email.");}
              finally{setWorking(null);}
            }}>Resend access link</button>}
        </li>)}
      </ul>
    </details>}
  </section>;
}
