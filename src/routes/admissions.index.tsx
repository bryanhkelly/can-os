import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { ArrowUpRight } from "lucide-react";
import { listEnrollmentPlacements, placeEnrolledStudent } from "@/modules/enrollment/course-placement.functions";
import {StudentLearningAccessHandoff} from "@/components/enrollment/StudentLearningAccessHandoff";
import {FirstSchoolDayHandoff} from "@/components/enrollment/FirstSchoolDayHandoff";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getAdmissionsDashboard } from "@/modules/enrollment/admissions-dashboard.functions";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { listAdmissionsPrograms } from "@/modules/enrollment/admissions-program-directory.functions";
import { getAdmissionOfferOptions, issueAdmissionOffer, activateOfferedEnrollment,withdrawIssuedAdmissionOffer } from "@/modules/enrollment/admissions-offer.functions";
import { admissionsPipelineSummary, pipelineStages, type AdmissionsStage } from "@/domain/admissions-pipeline";
import { selectActionableOffer, canIssueAnotherOffer } from "@/domain/admissions-offer-selection";
import { WorkspaceShell, StatCard, EmptyState, DetailNavigation, StatusBadge } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadAdmissions = async (selection:{siteId?:string;programId?:string}={}) => ({
 rows: await getAdmissionsDashboard({data:selection}),
 options: await getAdmissionOfferOptions({data:selection}),
 sites: await listMySites(),
 programs: await listAdmissionsPrograms(),
});

export const Route = createFileRoute("/admissions/")({
  validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;application?:string;stage?:AdmissionsStage}=>({
    siteId:typeof search.siteId==="string"?search.siteId:undefined,
    programId:typeof search.programId==="string"?search.programId:undefined,
    application:typeof search.application==="string"?search.application:undefined,
    stage:pipelineStages.find(stage=>stage===search.stage),
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
  const openScope=(siteId?:string,programId?:string)=>{
    const query=new URLSearchParams();
    if(siteId)query.set("siteId",siteId);
    if(programId)query.set("programId",programId);
    void router.navigate({href:"/admissions"+(query.size?"?"+query.toString():"")});
  };
  const summary = admissionsPipelineSummary(rows);
  const router = useRouter();
  const [pending, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [interactive,setInteractive]=useState(false);
  useEffect(()=>setInteractive(true),[]);
  const busy=interactive?pending:"hydrating";

  async function transact(id: string, fn: () => Promise<unknown>) {
    setBusy(id); setError(""); setNotice("");
    try { await fn(); await router.invalidate(); setNotice("Saved to enrollment records."); }
    catch (e) { setError(e instanceof Error ? e.message : "Admissions transaction failed"); }
    finally { setBusy(null); }
  }

  return (
    <WorkspaceShell
      width="wide"
      eyebrow="CAN OS · Admissions"
      title="Admissions command center"
      subtitle="Registrar workspace: issue offers and activate accepted enrollments. Guardians respond from their own authenticated offer inbox."
      actions={<div className="flex flex-wrap gap-2"><Link to="/admissions/intake" search={{siteId:selected.siteId,programId:selected.programId}} className="rounded-lg bg-foreground px-3 py-2 text-sm text-background">New inquiry</Link><Link to="/admissions/invite-families" className="rounded-lg border px-3 py-2 text-sm">Invite transfer families</Link><Link to="/admissions/transcripts" search={{query:""}} className="rounded-lg border px-3 py-2 text-sm">Official transcripts</Link><Link to="/admissions/capacity" search={{siteId:selected.siteId,programId:selected.programId}} className="rounded-lg border px-3 py-2 text-sm">Program capacity</Link></div>}
    >
      <WorkflowIntro eyebrow="Admissions & enrollment" title="A thoughtful path from inquiry to enrollment." description="Track each family's progress, review decisions, and hand accepted offers into authorized enrollment. Guardian verification remains independent." actions={<Link to="/admissions/intake" search={{siteId:selected.siteId,programId:selected.programId}} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Open intake <ArrowUpRight className="size-4" /></Link>} />
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-400 p-3">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl border p-3">{notice}</p>}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
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
      <DetailNavigation label="Admissions stages">
       <Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId}} aria-current={!selected.stage?"page":undefined}>All ({summary.total})</Link>
       {summary.byStage.map(item=><Link key={item.stage} to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,stage:item.stage}}
        aria-current={selected.stage===item.stage?"page":undefined} className="capitalize">{item.stage} ({item.count})</Link>)}
      </DetailNavigation>
      {!selected.application&&<div className="overflow-x-auto rounded-xl border bg-card">
       <table className="w-full text-left text-sm">
        <caption className="sr-only">Authorized admissions pipeline and next steps</caption>
        <thead className="border-b bg-muted/50"><tr><th scope="col" className="p-4">Applicant</th><th scope="col" className="p-4">Program</th><th scope="col" className="p-4">Stage</th><th scope="col" className="p-4">Next step</th></tr></thead>
        <tbody className="divide-y">{rows.filter(row=>!selected.stage||row.stage===selected.stage).map(row=>{
         const offer=selectActionableOffer(row.offers);
         const next=row.enrollments.length && row.activeSectionCount===0?"Assign staffed instructional class":
          row.enrollments.length && row.studentAccessStatus==="access_unavailable"?"Review revoked student access":
          row.enrollments.length && row.studentAccessStatus==="pending_review"?"Review student sign-in request":
          row.enrollments.length && row.studentAccessStatus==="not_requested"?"Await guardian student sign-in consent":
          row.enrollments.length && row.studentAccessStatus==="approved"?"Prepare scheduled onsite school day":
          row.enrollments.length?"Review student access":
          row.stage==="declined"||row.stage==="withdrawn"?"Review closed application":
          row.disposition==="waitlisted"?"Restore waitlisted application to review":
          row.outstandingRequirements>0?`Review ${row.outstandingRequirements} blocking requirement(s)`:
          offer?.status==="issued"?"Awaiting family response":
          offer?.status==="accepted"&&!row.enrollments.some(enrollment=>enrollment.schoolYearId===offer.schoolYearId)?"Activate accepted enrollment":
          row.stage==="accepted"?"Review offer eligibility":"Review application evidence";
         return <tr key={row.id} className="align-top hover:bg-muted/40">
          <th scope="row" className="p-4 font-semibold"><Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,application:row.id}} className="underline">{row.studentName??row.id}</Link><span className="mt-1 block text-xs font-normal text-muted-foreground">{row.submittedAt?`Submitted ${new Date(row.submittedAt).toLocaleDateString()}`:"Not submitted"}</span></th>
          <td className="p-4">{row.program}</td><td className="p-4"><StatusBadge tone={row.outstandingRequirements>0?"attention":"neutral"}>{row.disposition==="waitlisted"?"waitlisted":row.stage}</StatusBadge></td>
          <td className="p-4"><Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId,application:row.id}} className="underline">{next}</Link></td>
         </tr>;
        })}</tbody>
       </table>
       {!rows.some(row=>!selected.stage||row.stage===selected.stage)&&<p className="p-5 text-sm text-muted-foreground">No applications in this stage and scope.</p>}
      </div>}
      <h2 className="mt-9 font-serif text-2xl">Applications</h2>
      {selected.application&&<Link to="/admissions" search={{siteId:selected.siteId,programId:selected.programId}} className="mt-3 inline-block text-sm underline">View all applications</Link>}
      {selected.application&&!rows.some(row=>row.id===selected.application)&&<p role="alert" className="mt-4 rounded-xl border p-4">This application is unavailable in the current admissions view.</p>}
      <div className="mt-4 space-y-3">{rows.filter(row=>row.id===selected.application).map(x => {
        const years = options.find(o => o.applicationId === x.id)?.years ?? [];
        const latest = selectActionableOffer(x.offers);
        const activated = latest ? x.enrollments.some(e => e.schoolYearId === latest.schoolYearId) : false;
        return <article key={x.id} className="rounded-xl border p-4">
          <h3 className="mb-2 font-serif text-2xl">{x.studentName??x.id}</h3>
          <p className="font-semibold"><Link to="/admissions/families" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="hover:underline">{x.program}</Link></p>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{x.stage} · {x.outstandingRequirements} outstanding blocking requirements</p>
          {x.disposition==="waitlisted"&&<p role="status" className="mt-2 text-sm">Waitlisted - restore this application to review in admissions intake before issuing an offer.</p>}
          <Link to="/admissions/intake" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="mt-2 inline-block text-xs underline">Manage admissions decisions and waitlist →</Link>
          <div className="mt-3 flex flex-wrap gap-2">{x.offers.map(o => <span key={o.id} className="rounded-lg border px-3 py-1 text-xs">Offer: {o.status}{o.expiresAt ? ` · Expires ${new Date(o.expiresAt).toLocaleDateString()}` : ""}</span>)}{!latest && <span className="text-xs text-muted-foreground">No currently actionable offer</span>}</div>
          {activated && <p className="mt-3 text-sm font-semibold">Enrollment active · Student is enrolled in this school year</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {years.filter(year => canIssueAnotherOffer(x.stage, x.outstandingRequirements, x.offers, year.id,new Date(),x.disposition)).map(year => <button key={year.id} disabled={busy !== null} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50" onClick={() => transact(x.id, () => issueAdmissionOffer({ data: { applicationId: x.id, schoolYearId: year.id } }))}>Registrar: Issue offer · {year.name}</button>)}
            {latest?.status === "issued" && <p className="text-xs text-muted-foreground">Waiting for guardian response in the guardian enrollment-offers workspace.</p>}
            {latest?.status === "accepted" && !activated && <p role="status" className="text-xs">Accepted offer ready. Select a staffed class below to activate enrollment and placement together.</p>}
          </div>
          {x.offers.filter(offer=>offer.status==="issued").map(offer=><OfferWithdrawal key={offer.id} offerId={offer.id}/>)}
          {(x.enrollments.length > 0 || latest?.status === "accepted") &&
             <CoursePlacement applicationId={x.id}
               acceptedOfferId={latest?.status==="accepted"?latest.id:undefined}
               enrollmentActivated={activated} />}
          {activated&&<StudentLearningAccessHandoff applicationId={x.id} role="registrar"/>}
          {activated&&<FirstSchoolDayHandoff applicationId={x.id} programId={x.programId}/>}
          {activated&&<div className="mt-3 rounded-lg border p-3 text-sm">
            <p className="font-semibold">Enrollment → learning → supervised school day</p>
            <ol className="mt-2 space-y-1 text-muted-foreground" aria-label="School start handoff">
              <li>1. School-year enrollment active.</li>
              <li>2. {x.activeSectionCount>0
                ? `${x.activeSectionCount} active instructional class assignment(s) recorded.`
                : "Assign a staffed instructional class above before starting student learning access."}</li>
              <li>3. {x.studentAccessStatus==="approved"
                ? "Separate student learning account approved. The student signs in with their own email."
                : x.studentAccessStatus==="access_unavailable"
                  ? "Prior approval remains on record, but the actual student login grant is inactive or unavailable. Review the student-access restoration workflow."
                  : x.studentAccessStatus==="pending_review"
                    ? "Guardian consent received. Complete the independent registrar identity review above."
                    : "Guardian must authorize a separate student account; registrar then verifies the student's identity."}</li>
              <li>4. Site staff confirm an actual scheduled school day, expected onsite roster, supervision
                and physical attendance. Enrollment never records presence automatically.</li>
            </ol>
            {x.activeSectionCount>0
              ? <Link to="/staff/attendance" search={{programId:x.programId}} className="mt-2 inline-block font-semibold underline">
                  Open expected school-day attendance →
                </Link>
              : <p className="mt-2 text-xs">The school-day attendance handoff opens after a class is assigned.</p>}
          </div>}
          <Link to="/admissions/families" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="mt-3 inline-block text-xs font-semibold underline">Manage household readiness →</Link>
        </article>;
      })}
        {!rows.length && <EmptyState title="No applications are available in your authorized programs." />}</div>
    </WorkspaceShell>
  );
}

function OfferWithdrawal({offerId}:{offerId:string}){
 const router=useRouter();
 const [reason,setReason]=useState(""),[confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 return <details className="mt-3 rounded border p-3 text-sm">
  <summary>Withdraw an unaccepted offer</summary>
  <p className="mt-2">This releases the offered seat without deleting the application or its history.
   Accepted offers and active enrollments cannot be withdrawn here.</p>
  <form className="mt-3 space-y-3" onSubmit={async event=>{
   event.preventDefault();
   if(!confirmed||reason.trim().length<10){setError("Enter a withdrawal reason and confirm the family notification.");return;}
   setBusy(true);setError("");
   try{await withdrawIssuedAdmissionOffer({data:{offerId,reason,confirmed:true}});await router.invalidate();}
   catch(failure){setError(failure instanceof Error?failure.message:"Unable to withdraw offer");}
   finally{setBusy(false);}
  }}>
   <label className="block">Reason for withdrawal (internal)
    <textarea required minLength={10} maxLength={2000} value={reason} onChange={event=>setReason(event.target.value)}
     className="mt-1 block w-full rounded border bg-background p-2"/>
   </label>
   <label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed}
    onChange={event=>setConfirmed(event.target.checked)}/>I confirm withdrawal of this unaccepted offer. The family will be notified.</label>
   <button type="submit" disabled={busy||!confirmed||reason.trim().length<10}
    className="rounded border px-3 py-2 disabled:opacity-50">Withdraw offer</button>
   {error&&<p role="alert">{error}</p>}
  </form>
 </details>;
}

function CoursePlacement({ applicationId, acceptedOfferId, enrollmentActivated }: {
  applicationId: string; acceptedOfferId?: string; enrollmentActivated: boolean;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<Awaited<ReturnType<typeof listEnrollmentPlacements>>["sections"]>([]);
  const [loaded, setLoaded] = useState(false);
  const [chosen, setChosen] = useState("");
  const [transferBlocker,setTransferBlocker]=useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // An activated student's eligible classes should be visible immediately.
  // Reload on application change, and never reuse another child's prior choices.
  useEffect(() => {
    let current = true;
    setSections([]);
    setChosen("");
    setTransferBlocker(null);
    setLoaded(false);
    listEnrollmentPlacements({ data: { applicationId } }).then(result => {
      if (current) { setSections(result.sections); setTransferBlocker(result.transferBlocker); setLoaded(true); }
    }).catch(cause => {
      if (current) { setError(cause instanceof Error ? cause.message : "Cannot load course placements"); setLoaded(true); }
    });
    return () => { current = false; };
  }, [applicationId]);
  async function refresh() {
    const result = await listEnrollmentPlacements({ data: { applicationId } });
    setSections(result.sections);
    setTransferBlocker(result.transferBlocker);
    setLoaded(true);
  }
  async function open() {
    setBusy(true); setError("");
    try { await refresh(); }
    catch(e) { setError(e instanceof Error ? e.message : "Cannot load course placements"); }
    finally { setBusy(false); }
  }
  async function place() {
    if (!chosen || (acceptedOfferId&&!enrollmentActivated&&transferBlocker)) return;
    setBusy(true); setError("");
    try {
      if(acceptedOfferId&&!enrollmentActivated)
        await activateOfferedEnrollment({data:{offerId:acceptedOfferId,sectionId:chosen}});
      else await placeEnrolledStudent({ data: { applicationId, sectionId: chosen } });
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
        Refresh eligible classes
      </button>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
    {acceptedOfferId&&!enrollmentActivated&&transferBlocker&&
      <p role="status" className="mt-3 rounded-lg border p-3 text-sm">
        <strong>Receiving-school enrollment blocked:</strong> {transferBlocker}
        {" "}The family may retain an accepted offer while the origin school finishes its exit.
        <Link to="/admissions/intake" className="ml-2 font-semibold underline">Review admissions →</Link>
      </p>}
    {!loaded && !error && <p role="status" className="mt-3 text-xs text-muted-foreground">Loading eligible classes…</p>}
    {loaded && <div className="mt-3 space-y-3">
      <div className="flex flex-wrap gap-2">
        {sections.filter(s => s.enrolled).map(s =>
          <span key={s.id} className="rounded-full border px-2 py-1 text-xs">Assigned: {s.title}</span>)}
      </div>
      {sections.some(s => !s.enrolled && !s.readyForPlacement) && <p role="status" className="text-xs text-amber-700">
        Some classes cannot accept students yet: verify an institutional teacher
        with a published first lesson, a current CAN–church academic agreement,
         an open add/drop window, and available Section capacity.
      </p>}
      {sections.some(s => !s.enrolled && s.readyForPlacement) ? <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-48 flex-1 text-xs">Available section
          <select value={chosen} onChange={e => setChosen(e.target.value)}
            className="mt-1 block w-full rounded-md border bg-background p-2">
            <option value="">Select a section</option>
            {sections.filter(s => !s.enrolled && s.readyForPlacement).map(s =>
              <option key={s.id} value={s.id}>{s.title} ({s.code})</option>)}
          </select>
        </label>
        <button type="button" disabled={!chosen || busy || !!(acceptedOfferId&&!enrollmentActivated&&transferBlocker)} onClick={place}
          className="rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background disabled:opacity-50">
          {acceptedOfferId&&!enrollmentActivated?"Activate enrollment and assign class":"Assign student"}
        </button>
      </div> : <p className="text-xs text-muted-foreground">
        {sections.length
          ? sections.every(s => s.enrolled) ? "All currently available sections are assigned."
            : "No class is ready for placement: verify its teacher, first lesson, operating agreement, remaining capacity and add/drop deadline."
          : "No eligible sections are configured for this student's active school year."}
      </p>}
    </div>}
  </section>;
}
