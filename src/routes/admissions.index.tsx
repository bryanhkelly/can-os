import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { AdmissionsOfferPanel } from "@/components/enrollment/AdmissionsOfferPanel";
import { getAdmissionsDashboard } from "@/modules/enrollment/admissions-dashboard.functions";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { listAdmissionsPrograms } from "@/modules/enrollment/admissions-program-directory.functions";
import { getAdmissionOfferOptions } from "@/modules/enrollment/admissions-offer.functions";
import { admissionsPipelineSummary, pipelineStages, type AdmissionsStage } from "@/domain/admissions-pipeline";
import { selectActionableOffer } from "@/domain/admissions-offer-selection";
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

  return (
    <WorkspaceShell
      width="wide"
      eyebrow="CAN OS · Admissions"
      title="Admissions command center"
      subtitle="Registrar workspace: issue offers and activate accepted enrollments. Guardians respond from their own authenticated offer inbox."
      actions={<div className="flex flex-wrap gap-2"><Link to="/admissions/intake" search={{siteId:selected.siteId,programId:selected.programId}} className="rounded-lg bg-foreground px-3 py-2 text-sm text-background">New inquiry</Link><Link to="/admissions/transcripts" search={{query:""}} className="rounded-lg border px-3 py-2 text-sm">Official transcripts</Link></div>}
    >
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
         const next=row.stage==="declined"||row.stage==="withdrawn"?"Review closed application":
          row.disposition==="waitlisted"?"Restore waitlisted application to review":
          row.outstandingRequirements>0?`Review ${row.outstandingRequirements} blocking requirement(s)`:
          offer?.status==="issued"?"Awaiting family response":
          offer?.status==="accepted"&&!row.enrollments.some(enrollment=>enrollment.schoolYearId===offer.schoolYearId)?"Activate accepted enrollment":
          row.enrollments.length?"Review class placement":row.stage==="accepted"?"Review offer eligibility":"Review application evidence";
         return <tr key={row.id} className="align-top hover:bg-muted/40">
          <th scope="row" className="p-4 font-semibold"><Link to="/admissions/applications/$applicationId" params={{applicationId:row.id}} className="underline">{row.studentName??row.id}</Link><span className="mt-1 block text-xs font-normal text-muted-foreground">{row.submittedAt?`Submitted ${new Date(row.submittedAt).toLocaleDateString()}`:"Not submitted"}</span></th>
          <td className="p-4">{row.program}</td><td className="p-4"><StatusBadge tone={row.outstandingRequirements>0?"attention":"neutral"}>{row.disposition==="waitlisted"?"waitlisted":row.stage}</StatusBadge></td>
          <td className="p-4"><Link to="/admissions/applications/$applicationId" params={{applicationId:row.id}} className="underline">{next}</Link></td>
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
        return <article key={x.id} className="rounded-xl border p-4">
          <h3 className="mb-2 font-serif text-2xl"><Link to="/admissions/applications/$applicationId" params={{applicationId:x.id}} className="hover:underline">{x.studentName??x.id}</Link></h3>
          <p className="font-semibold"><Link to="/admissions/families" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="hover:underline">{x.program}</Link></p>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{x.stage} · {x.outstandingRequirements} outstanding blocking requirements</p>
          <div className="mt-2 flex flex-wrap gap-4 text-xs">
           <Link to="/admissions/applications/$applicationId" params={{applicationId:x.id}} className="font-semibold underline">Open applicant detail and next steps →</Link>
           <Link to="/admissions/intake" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="underline">Manage admissions decisions and waitlist →</Link>
           <Link to="/admissions/families" search={{siteId:selected.siteId,programId:x.programId,application:x.id}} className="underline">Manage household readiness →</Link>
          </div>
          <AdmissionsOfferPanel application={x} years={years}/>
        </article>;
      })}
        {!rows.length && <EmptyState title="No applications are available in your authorized programs." />}</div>
    </WorkspaceShell>
  );
}
