import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { provisionInquiryGuardianAccount, sendAdmissionsGuardianInvitation, transitionAdmissionsStage, verifyAdmissionsGuardianRelationship } from "@/modules/enrollment/admissions-intake.functions";

export type DecisionPanelRecord = {
  id: string; stage: string; disposition: string | null; applicantDraft: boolean;
  guardianVerified: boolean; guardianLoginProvisioned: boolean;
};
type Decision = "application" | "eligibility" | "accept" | "decline" | "withdraw" | "waitlist" | "restore";
type VerificationMethod = "in_person_id" | "verified_school_record" | "live_video_verification";
const methods: [VerificationMethod, string][] = [
  ["verified_school_record", "Verified school record"],
  ["in_person_id", "In-person identification"],
  ["live_video_verification", "Live video verification"],
];

export function stageDecisions(stage: string, disposition: string | null): [Decision, string][] {
  if (stage === "inquiry") return [["application", "Start application"], ["decline", "Decline"], ["withdraw", "Withdraw"]];
  if (stage === "application") return [["eligibility", "Begin eligibility review"], ["decline", "Decline"], ["withdraw", "Withdraw"]];
  if (stage !== "eligibility") return [];
  if (disposition === "waitlisted") return [["restore", "Restore to review"], ["decline", "Decline"], ["withdraw", "Withdraw"]];
  if (disposition === "ready_for_offer") return [["waitlist", "Waitlist"], ["decline", "Decline"], ["withdraw", "Withdraw"]];
  return [["accept", "Approve for offer"], ["waitlist", "Waitlist"], ["decline", "Decline"], ["withdraw", "Withdraw"]];
}

/** Registrar guardian verification, access provisioning and stage decisions for one application. */
export function AdmissionsDecisionPanel({ record: r }: { record: DecisionPanelRecord }) {
  const router = useRouter();
  const [saving, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const busy = saving || !interactive;
  const [method, setMethod] = useState<VerificationMethod>("verified_school_record"), [evidence, setEvidence] = useState("");
  async function perform(fn: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); await router.invalidate(); setNotice(message); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save"); }
    finally { setBusy(false); }
  }
  if (r.applicantDraft) return <p className="mt-3 text-sm text-muted-foreground">The family has not submitted this application yet. Registrar decisions open after submission.</p>;
  return <div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-500 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg border p-3 text-sm">{notice}</p>}
    <p className="mt-3 text-xs text-muted-foreground">
      Guardian verification: <strong>{r.guardianVerified ? "Verified" : "Required"}</strong> ·
      {" "}Sign-in access: <strong>{r.guardianLoginProvisioned ? "Provisioned" : "Not provisioned"}</strong>.
      Verify the relationship independently before granting or inviting access.
    </p>
    {!r.guardianVerified && <form aria-label="Verify guardian relationship" className="mt-3 grid gap-2 rounded-lg border p-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
      onSubmit={e => { e.preventDefault(); void perform(() => verifyAdmissionsGuardianRelationship({ data: { applicationId: r.id, method, evidenceNote: evidence.trim() } }), "Guardian relationship verified and family permissions enabled."); }}>
      <label className="text-xs">Verification method
        <select value={method} onChange={e => setMethod(e.target.value as VerificationMethod)} className="mt-1 block w-full rounded border bg-background p-2 text-sm">
          {methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-xs">Verification record
        <input required minLength={12} maxLength={2000} value={evidence} onChange={e => setEvidence(e.target.value)} placeholder="Documentation or identification reviewed (12+ characters)" className="mt-1 block w-full rounded border bg-background p-2 text-sm" />
      </label>
      <button type="submit" disabled={busy || evidence.trim().length < 12} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Verify guardian relationship</button>
    </form>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy || !r.guardianVerified || r.guardianLoginProvisioned}
        onClick={() => void perform(() => provisionInquiryGuardianAccount({ data: { applicationId: r.id } }), "Verified guardian sign-in access provisioned.")}
        className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
        {r.guardianLoginProvisioned ? "Login provisioned" : "Provision guardian login"}
      </button>
      <button type="button" disabled={busy || !r.guardianLoginProvisioned}
        onClick={() => void perform(() => sendAdmissionsGuardianInvitation({ data: { applicationId: r.id } }), "A secure email sign-in invitation was requested for this guardian.")}
        className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
        Send secure guardian invitation
      </button>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      {stageDecisions(r.stage, r.disposition).map(([decision, label]) =>
        <button key={decision} type="button" disabled={busy} onClick={() => void perform(() => transitionAdmissionsStage({ data: { applicationId: r.id, decision } }), label + " saved.")}
          className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">{label}</button>)}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Withdraw unaccepted offers before waitlisting, declining or withdrawing an application.
      Accepted offers and active enrollments require their enrollment workflow and cannot be cancelled here.</p>
  </div>;
}
