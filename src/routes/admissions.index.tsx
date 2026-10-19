import { listEnrollmentPlacements, placeEnrolledStudent } from "@/modules/enrollment/course-placement.functions";
import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { getAdmissionsDashboard } from "@/modules/enrollment/admissions-dashboard.functions";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { listAdmissionsPrograms } from "@/modules/enrollment/admissions-program-directory.functions";
import { getAdmissionOfferOptions, issueAdmissionOffer, activateOfferedEnrollment } from "@/modules/enrollment/admissions-offer.functions";
import { admissionsPipelineSummary } from "@/domain/admissions-pipeline";
import { selectActionableOffer, canIssueAnotherOffer } from "@/domain/admissions-offer-selection";
import { WorkspaceShell, StatCard, EmptyState } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadAdmissions = async (selection:{siteId?:string;programId?:string}={}) => ({
 rows: await getAdmissionsDashboard({data:selection}),
 options: await getAdmissionOfferOptions({data:selection}),
 sites: await listMySites(),
 programs: await listAdmissionsPrograms(),
});

export const Route = createFileRoute("/admissions/")({
  validateSearch:(search:Record<string,unknown>)=>({
    siteId:typeof search.siteId==="string"?search.siteId:undefined,
    programId:typeof search.programId==="string"?search.programId:undefined,
  }),
  loaderDeps:({search})=>({siteId:search.siteId,programId:search.programId}),
  loader:({deps})=>safeLoader(()=>loadAdmissions(deps),{
    authMessage:"Sign in with an authorized registrar account to view the admissions command center.",
  })(),
  component: Admissions,
});

function Admissions() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Admissions" title="Admissions command center" outcome={outcome} />;
  return <AdmissionsView data={outcome.data} />;
}

function AdmissionsView({ data }: { data: Awaited<ReturnType<typeof loadAdmissions>> }) {
  const { rows, options, sites, programs } = data;
  const selected=Route.useSearch();
  const programChoices=programs.filter(program=>!selected.siteId||program.siteId===selected.siteId);
  const familyScope=new URLSearchParams();
  if(selected.siteId)familyScope.set("siteId",selected.siteId);
  if(selected.programId)familyScope.set("programId",selected.programId);
  const openScope=(siteId?:string,programId?:string)=>{
    const query=new URLSearchParams();
    if(siteId)query.set("siteId",siteId);
    if(programId)query.set("programId",programId);
    window.location.assign("/admissions"+(query.size?"?"+query.toString():""));
  };
  const summary = admissionsPipelineSummary(rows);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");

  async function transact(id: string, fn: () => Promise<unknown>) {
    setBusy(id); setError(""); setNotice("");
    try { await fn(); await router.invalidate(); setNotice("Saved to enrollment records."); }
    catch (e) { setError(e instanceof Error ? e.message : "Admissions transaction failed"); }
    finally { setBusy(null); }
  }

  return (
    <WorkspaceShell
      className="[&>div]:max-w-6xl"
      eyebrow="CAN OS · Admissions"
      title="Admissions command center"
      subtitle="Registrar workspace: issue offers and activate accepted enrollments. Guardians respond from their own authenticated offer inbox."
      actions={<a href="/admissions/transcripts" className="rounded-lg border px-3 py-2 text-sm">Official transcripts</a>}
    >
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400 p-3">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border p-3">{notice}</p>}
      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <label className="text-sm">School
          <select aria-label="Admissions school" className="ml-2 rounded border bg-background p-2"
           value={selected.siteId??""} onChange={event=>openScope(event.target.value||undefined)}>
           <option value="">All permitted schools</option>
           {sites.map(site=><option key={site.id} value={site.id}>{site.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Program
          <select aria-label="Admissions program" className="ml-2 rounded border bg-background p-2"
           value={selected.programId??""} onChange={event=>openScope(selected.siteId,event.target.value||undefined)}>
           <option value="">All permitted programs</option>
           {programChoices.map(program=><option key={program.id} value={program.id}>{program.name}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Applications" value={summary.total} />
        <StatCard label="Awaiting decision" value={summary.awaitingDecision} />
        <StatCard label="Blocking requirements" value={summary.missingRequirements} />
      </div>
      <div className="mt-3 rounded-xl border p-4"><p className="text-sm">Active program enrollments across applications: <strong>{rows.reduce((n, x) => n + x.enrollments.length, 0)}</strong></p></div>
      <h2 className="mt-9 font-serif text-2xl">Pipeline</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{summary.byStage.map(x => <div className="rounded-xl border p-4" key={x.stage}><p className="text-sm capitalize">{x.stage}</p><p className="font-serif text-2xl">{x.count}</p></div>)}</div>
      <h2 className="mt-9 font-serif text-2xl">Applications</h2>
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
            {years.filter(year => canIssueAnotherOffer(x.stage, x.outstandingRequirements, x.offers, year.id)).map(year => <button key={year.id} disabled={busy !== null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => transact(x.id, () => issueAdmissionOffer({ data: { applicationId: x.id, schoolYearId: year.id } }))}>Registrar: Issue offer · {year.name}</button>)}
            {latest?.status === "issued" && <p className="text-xs text-muted-foreground">Waiting for guardian response in the guardian enrollment-offers workspace.</p>}
            {latest?.status === "accepted" && !activated && <button disabled={busy !== null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => transact(x.id, () => activateOfferedEnrollment({ data: { offerId: latest.id } }))}>Registrar: Activate enrollment</button>}
          </div>
          {x.enrollments.length > 0 && <CoursePlacement applicationId={x.id} />}
          <a href={"/admissions/families"+(selected.siteId||selected.programId?"?"+familyScope.toString():"")} className="mt-3 inline-block text-xs font-semibold underline">Manage household readiness →</a>
        </article>;
      })}
        {!rows.length && <EmptyState title="No applications are available in your authorized programs." />}</div>
    </WorkspaceShell>
  );
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
    catch(e) { setError(e instanceof Error ? e.message : "Cannot load course placements"); }
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
    } catch(e) { setError(e instanceof Error ? e.message : "Cannot assign course"); }
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
