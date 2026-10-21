import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { activateOfferedEnrollment, issueAdmissionOffer, withdrawIssuedAdmissionOffer } from "@/modules/enrollment/admissions-offer.functions";
import { listEnrollmentPlacements, placeEnrolledStudent } from "@/modules/enrollment/course-placement.functions";
import { canIssueAnotherOffer, selectActionableOffer } from "@/domain/admissions-offer-selection";

export type OfferPanelApplication = {
  id: string; stage: string; disposition: string | null; outstandingRequirements: number;
  offers: { id: string; status: string; expiresAt: string | null; schoolYearId: string }[];
  enrollments: { schoolYearId: string | null; status: string }[];
};
export type OfferPanelYear = { id: string; name: string; capacity: number };

/** Registrar offer issuance, withdrawal, enrollment activation and course placement for one application. */
export function AdmissionsOfferPanel({ application: x, years, offerReady = true }: {
  application: OfferPanelApplication; years: OfferPanelYear[]; offerReady?: boolean;
}) {
  const router = useRouter();
  const [saving, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const busy = saving || !interactive;
  const latest = selectActionableOffer(x.offers);
  const activated = latest ? x.enrollments.some(e => e.schoolYearId === latest.schoolYearId) : false;
  async function transact(fn: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); await router.invalidate(); setNotice(message); }
    catch (e) { setError(e instanceof Error ? e.message : "Admissions transaction failed"); }
    finally { setBusy(false); }
  }
  const issuable = offerReady ? years.filter(year => canIssueAnotherOffer(x.stage, x.outstandingRequirements, x.offers, year.id, new Date(), x.disposition)) : [];
  return <div>
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-400 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="mt-3 rounded-lg border p-3 text-sm">{notice}</p>}
    {x.disposition === "waitlisted" && <p role="status" className="mt-2 text-sm">Waitlisted - restore this application to review before issuing an offer.</p>}
    <div className="mt-3 flex flex-wrap gap-2">{x.offers.map(o => <span key={o.id} className="rounded-lg border px-3 py-1 text-xs">Offer: {o.status}{o.expiresAt ? ` · Expires ${new Date(o.expiresAt).toLocaleDateString()}` : ""}</span>)}{!latest && <span className="text-xs text-muted-foreground">No currently actionable offer</span>}</div>
    {!years.length && !latest && <p className="mt-3 text-sm">No seat pool is configured for this program. Create one under Admissions → Program capacity before issuing an offer.</p>}
    {activated && <p className="mt-3 text-sm font-semibold">Enrollment active · Student is enrolled in this school year</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {issuable.map(year => <button key={year.id} type="button" disabled={busy} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => void transact(() => issueAdmissionOffer({ data: { applicationId: x.id, schoolYearId: year.id } }), "Enrollment offer issued. The family has been notified.")}>Registrar: Issue offer · {year.name}</button>)}
      {latest?.status === "issued" && <p className="text-xs text-muted-foreground">Waiting for guardian response in the guardian enrollment-offers workspace.</p>}
      {latest?.status === "accepted" && !activated && <button type="button" disabled={busy || x.outstandingRequirements > 0} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => void transact(() => activateOfferedEnrollment({ data: { offerId: latest.id } }), "Enrollment activated.")}>Registrar: Activate enrollment</button>}
    </div>
    {x.offers.filter(offer => offer.status === "issued").map(offer => <OfferWithdrawal key={offer.id} offerId={offer.id} />)}
    {x.enrollments.length > 0 && <CoursePlacement applicationId={x.id} />}
  </div>;
}

function OfferWithdrawal({ offerId }: { offerId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <details className="mt-3 rounded border p-3 text-sm">
    <summary>Withdraw an unaccepted offer</summary>
    <p className="mt-2">This releases the offered seat without deleting the application or its history.
      Accepted offers and active enrollments cannot be withdrawn here.</p>
    <form className="mt-3 space-y-3" onSubmit={async event => {
      event.preventDefault();
      if (!confirmed || reason.trim().length < 10) { setError("Enter a withdrawal reason and confirm the family notification."); return; }
      setBusy(true); setError("");
      try { await withdrawIssuedAdmissionOffer({ data: { offerId, reason, confirmed: true } }); await router.invalidate(); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to withdraw offer"); }
      finally { setBusy(false); }
    }}>
      <label className="block">Reason for withdrawal (internal)
        <textarea required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)}
          className="mt-1 block w-full rounded border bg-background p-2" />
      </label>
      <label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed}
        onChange={event => setConfirmed(event.target.checked)} />I confirm withdrawal of this unaccepted offer. The family will be notified.</label>
      <button type="submit" disabled={busy || !confirmed || reason.trim().length < 10}
        className="rounded border px-3 py-2 disabled:opacity-50">Withdraw offer</button>
      {error && <p role="alert">{error}</p>}
    </form>
  </details>;
}

function CoursePlacement({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [sections, setSections] = useState<Awaited<ReturnType<typeof listEnrollmentPlacements>>["sections"]>([]);
  const [loaded, setLoaded] = useState(false);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    const result = await listEnrollmentPlacements({ data: { applicationId } });
    setSections(result.sections);
    setLoaded(true);
  }
  async function open() {
    setBusy(true); setError("");
    try { await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Cannot load course placements"); }
    finally { setBusy(false); }
  }
  async function place() {
    if (!chosen) return;
    setBusy(true); setError("");
    try {
      await placeEnrolledStudent({ data: { applicationId, sectionId: chosen } });
      setChosen("");
      await refresh();
      await router.invalidate();
    } catch (e) { setError(e instanceof Error ? e.message : "Cannot assign course"); }
    finally { setBusy(false); }
  }
  return <section className="mt-4 rounded-lg border bg-card p-4" aria-label="Course placement">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Course placement</h3>
      <button type="button" disabled={busy} onClick={open}
        className="rounded-md border px-3 py-1.5 text-xs disabled:opacity-50">
        {loaded ? "Refresh sections" : "Choose courses"}
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {loaded && <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {sections.filter(s => s.enrolled).map(s =>
          <span key={s.id} className="rounded-full border px-2 py-1 text-xs">Assigned: {s.title}</span>)}
      </div>
      {sections.some(s => !s.enrolled) ? <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-xs">Available section
          <select value={chosen} onChange={e => setChosen(e.target.value)}
            className="mt-1 block w-full rounded-md border bg-background p-2">
            <option value="">Select a section</option>
            {sections.filter(s => !s.enrolled).map(s =>
              <option key={s.id} value={s.id}>{s.title} ({s.code})</option>)}
          </select>
        </label>
        <button type="button" disabled={!chosen || busy} onClick={place}
          className="rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">
          Assign student
        </button>
      </div> : <p className="text-xs text-muted-foreground">
        {sections.length ? "All currently available sections are assigned." :
          "No eligible sections are configured for this student's active school year."}
      </p>}
    </div>}
  </section>;
}
