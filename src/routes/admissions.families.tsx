import {createFileRoute,Link} from "@tanstack/react-router";
import {getFamilyReadiness} from "@/modules/enrollment/family-readiness.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {ApplicationReadinessPanel} from "@/components/enrollment/ApplicationReadinessPanel";
const loadFamilyReadiness=(selection:{siteId?:string;programId?:string}={})=>getFamilyReadiness({data:selection});
export const Route=createFileRoute("/admissions/families")({
 validateSearch:(search:Record<string,unknown>):{siteId?:string;programId?:string;application?:string}=>({
  siteId:typeof search.siteId==="string"?search.siteId:undefined,
  programId:typeof search.programId==="string"?search.programId:undefined,
  application:typeof search.application==="string"?search.application:undefined,
 }),
 loaderDeps:({search})=>({siteId:search.siteId,programId:search.programId}),
 loader:({deps})=>safeLoader(()=>loadFamilyReadiness(deps),{
  authMessage:"Sign in with an authorized registrar account to view family enrollment readiness.",
 })(),
 component:Families
});
function Families(){
 const outcome=Route.useLoaderData();
 if(!outcome.ok)return <LoaderFailure eyebrow="CAN OS · Enrollment" title="Family enrollment readiness" outcome={outcome}/>;
 return <FamiliesView apps={outcome.data}/>;
}
function FamiliesView({apps}:{apps:Awaited<ReturnType<typeof loadFamilyReadiness>>}){
 const selection=Route.useSearch();
 const visibleApps=apps.filter(app=>!selection.application||app.id===selection.application);
 const families=[...new Set(visibleApps.map(a=>a.householdId))];
 return <main className="mx-auto max-w-5xl px-5 py-10">
  <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Enrollment</p>
  <h1 className="mt-2 font-serif text-4xl">Family enrollment readiness</h1>
  <p className="mt-3 text-sm text-muted-foreground">Review each household journey and its supporting private documents. Uploads are available only where the deployment has enabled the relevant R2 workflow.</p>
  {selection.application&&<Link to="/admissions/families" search={{siteId:selection.siteId,programId:selection.programId}} className="mt-4 inline-block text-sm underline">View all household readiness</Link>}
  {selection.application&&!visibleApps.length&&<p role="alert" className="mt-4 rounded-xl border p-4">This application is unavailable in the current family readiness view.</p>}
  <div className="mt-6 rounded-xl border p-5"><p className="text-sm">Households represented</p><p className="font-serif text-3xl">{families.length}</p></div>
  <div className="mt-6 space-y-4">{families.map((id,i)=><section key={id} className="rounded-xl border p-5">
   <h2 className="font-serif text-xl">Household {i+1}</h2>
   <div className="mt-3 space-y-3">{visibleApps.filter(a=>a.householdId===id).map(a=><article key={a.id} className="rounded-lg border p-3">
    <p className="font-semibold">{a.program} · {a.stage}</p>
    <p className="mt-2 text-sm">Next step: <strong>{a.activeSchoolYears.length?"Enrollment active — prepare for school":a.offers.some(o=>o.status==="accepted")?"Registrar activation pending":a.offers.some(o=>o.status==="issued")?"Guardian response pending":a.readiness.blockers?"Complete blocking requirements":"Ready for an admissions offer"}</strong></p>
    <div className="mt-3 flex flex-wrap gap-2">{a.offers.map(o=><span key={o.schoolYearId+":"+o.status} className="rounded-md border px-2 py-1 text-xs">Offer: {o.status}{o.respondedAt?" · Responded "+new Date(o.respondedAt).toLocaleDateString():""}</span>)}</div>
    <p className="mt-2 text-sm">Journey: <strong>{a.journeyStatus?.replaceAll("_"," ")??"Not started"}</strong> · Program enrollment: <strong>{a.activeSchoolYears.length?"Active":"Not active"}</strong></p>
    {a.activeSchoolYears.length>0&&<p className="mt-1 text-xs text-muted-foreground">Active school-year records: {a.activeSchoolYears.length}</p>}
    <p className="mt-1 text-sm text-muted-foreground">{a.readiness.completed} of {a.readiness.total} requirements complete · {a.readiness.blockers} blocking</p>
    <Link to="/admissions" search={{siteId:selection.siteId,programId:selection.programId,application:a.id}} className="mt-2 inline-block text-xs font-semibold underline">Review offers and enrollment →</Link>
    <Link to="/admissions/applications/$applicationId" params={{applicationId:a.id}} className="ml-4 mt-2 inline-block text-xs font-semibold underline">Open applicant detail and next steps →</Link>
    {a.activeSchoolYears.length>0&&<p className="mt-2 text-xs text-muted-foreground">The admissions checklist is now a historical record. Active enrollment requirements are managed separately.</p>}
    <ApplicationReadinessPanel application={a}/>
   </article>)}</div>
  </section>)}
  {!families.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No family enrollment cases found in your authorized programs.</p>}
  </div>
 </main>;
}
