import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getSyntheticAdmissionsDashboard } from "@/modules/enrollment/admissions-dashboard.functions";
import { getSyntheticAdmissionOfferOptions, issueSyntheticOfferFromDemo, activateSyntheticOfferFromDemo } from "@/modules/enrollment/admissions-offer-demo.functions";
import { admissionsPipelineSummary } from "@/domain/admissions-pipeline";
import { selectActionableOffer, canIssueAnotherOffer } from "@/domain/admissions-offer-selection";
import { WorkspaceShell, StatCard, EmptyState } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadAdmissions = async () => ({ rows: await getSyntheticAdmissionsDashboard(), options: await getSyntheticAdmissionOfferOptions() });

export const Route = createFileRoute("/admissions/")({
  loader: safeLoader(loadAdmissions, { authMessage: "Sign in with an authorized registrar account to view the admissions command center." }),
  component: Admissions,
});

function Admissions() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Synthetic admissions" title="Admissions command center" outcome={outcome} />;
  return <AdmissionsView data={outcome.data} />;
}

function AdmissionsView({ data }: { data: Awaited<ReturnType<typeof loadAdmissions>> }) {
  const { rows, options } = data;
  const summary = admissionsPipelineSummary(rows);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");

  async function transact(id: string, fn: () => Promise<unknown>) {
    setBusy(id); setError(""); setNotice("");
    try { await fn(); await router.invalidate(); setNotice("Saved to the synthetic enrollment database."); }
    catch (e) { setError(e instanceof Error ? e.message : "Admissions transaction failed"); }
    finally { setBusy(null); }
  }

  return (
    <WorkspaceShell
      className="[&>div]:max-w-6xl"
      eyebrow="CAN OS · Synthetic admissions"
      title="Admissions command center"
      subtitle="Registrar workspace: issue offers and activate accepted enrollments. Guardians respond from their own authenticated offer inbox."
    >
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400 p-3">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border p-3">{notice}</p>}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Applications" value={summary.total} />
        <StatCard label="Awaiting decision" value={summary.awaitingDecision} />
        <StatCard label="Blocking requirements" value={summary.missingRequirements} />
      </div>
      <div className="mt-3 rounded-xl border p-4"><p className="text-sm">Active program enrollments across applications: <strong>{rows.reduce((n, x) => n + x.enrollments.length, 0)}</strong></p></div>
      <h2 className="mt-9 font-serif text-2xl">Pipeline</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{summary.byStage.map(x => <div className="rounded-xl border p-4" key={x.stage}><p className="text-sm capitalize">{x.stage}</p><p className="font-serif text-2xl">{x.count}</p></div>)}</div>
      <h2 className="mt-9 font-serif text-2xl">Synthetic applications</h2>
      <div className="mt-4 space-y-3">{rows.map(x => {
        const years = options.find(o => o.applicationId === x.id)?.years ?? [];
        const latest = selectActionableOffer(x.offers);
        const activated = latest ? x.enrollments.some(e => e.schoolYearId === latest.schoolYearId) : false;
        return <article key={x.id} className="rounded-xl border p-4">
          <p className="font-semibold">{x.program}</p>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{x.stage} · {x.outstandingRequirements} outstanding blocking requirements</p>
          <div className="mt-3 flex flex-wrap gap-2">{x.offers.map(o => <span key={o.id} className="rounded-lg border px-3 py-1 text-xs">Offer: {o.status}{o.expiresAt ? ` · Expires ${new Date(o.expiresAt).toLocaleDateString()}` : ""}</span>)}{!latest && <span className="text-xs text-muted-foreground">No currently actionable offer</span>}</div>
          {activated && <p className="mt-3 text-sm font-semibold">Enrollment active · Student is enrolled in this school year</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {years.filter(year => canIssueAnotherOffer(x.stage, x.outstandingRequirements, x.offers, year.id)).map(year => <button key={year.id} disabled={busy !== null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => transact(x.id, () => issueSyntheticOfferFromDemo({ data: { applicationId: x.id, schoolYearId: year.id } }))}>Registrar: Issue offer · {year.name}</button>)}
            {latest?.status === "issued" && <p className="text-xs text-muted-foreground">Waiting for guardian response in the guardian enrollment-offers workspace.</p>}
            {latest?.status === "accepted" && !activated && <button disabled={busy !== null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => transact(x.id, () => activateSyntheticOfferFromDemo({ data: { offerId: latest.id } }))}>Registrar: Activate enrollment</button>}
          </div>
          <Link to="/admissions/families" className="mt-3 inline-block text-xs font-semibold underline">Manage household readiness →</Link>
        </article>;
      })}
        {!rows.length && <EmptyState title="No synthetic applications loaded. Add controlled fixture data to exercise admissions." />}</div>
    </WorkspaceShell>
  );
}
