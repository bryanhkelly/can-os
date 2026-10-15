import {createFileRoute,Link} from "@tanstack/react-router";
import {getSyntheticPrograms} from "@/modules/operations/program-preview.functions";
import {schoolTemplates} from "@/domain/school-template";
import {programReadiness,readinessFromSnapshot} from "@/domain/program-readiness";
export const Route=createFileRoute("/readiness")({loader:()=>getSyntheticPrograms(),component:ReadinessPage});
function ReadinessPage(){
 const programs=Route.useLoaderData();
 const items=readinessFromSnapshot({academics:"ready",staffing:"needs_review",safeguarding:"missing",calendar:"ready",enrollment:"needs_review",records:"missing"});
 const summary=programReadiness(items);
 return <main className="mx-auto max-w-5xl px-5 py-10">
 <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic planning example</p>
 <h1 className="mt-2 font-serif text-5xl">Program launch readiness</h1>
 <p className="mt-4 text-sm text-muted-foreground">Illustrative K–8 high-school extension. Statuses are sample values, not accreditation or verified compliance findings.</p>
 <section className="mt-5 rounded-xl border bg-card p-5"><h2 className="font-semibold">Synthetic programs in the database</h2>{programs.length?programs.map(p=><p key={p.id} className="mt-2 text-sm">{p.name} · {p.organizationName} · {p.status} · grades {p.gradeRange.min}–{p.gradeRange.max} · {p.counts.sections} sections · {p.counts.teachers} teaching assignments · {p.counts.enrollments} enrollments</p>):<p className="mt-2 text-sm text-muted-foreground">No explicitly marked synthetic programs found. Planning example below is illustrative.</p>}</section>
 <div className="mt-6 rounded-xl border bg-card p-5"><p className="font-serif text-3xl">{summary.ready} of {summary.total} dimensions ready</p><p className="mt-2 text-sm text-muted-foreground">{summary.blockers} open planning dimensions</p></div>
 <section className="mt-7 grid gap-3 sm:grid-cols-2">{items.map(x=><article key={x.key} className="rounded-xl border bg-card p-5"><div className="flex items-start justify-between gap-4"><h2 className="font-semibold">{x.label}</h2><span className="text-xs text-muted-foreground">{x.state.replace("_"," ")}</span></div><p className="mt-2 text-sm text-muted-foreground">{x.detail}</p><Link to={x.href} className="mt-3 inline-block text-xs font-bold underline">Explore workflow →</Link></article>)}</section>
 <section className="mt-10"><h2 className="font-serif text-3xl">Reusable program starting points</h2><p className="mt-2 text-sm text-muted-foreground">Configuration presets only; jurisdictional requirements and responsible organizations must be assigned before approval.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{schoolTemplates.map(t=><article key={t.key} className="rounded-xl border bg-card p-5"><h3 className="font-semibold">{t.title}</h3><p className="mt-2 text-sm text-muted-foreground">{t.description}</p><p className="mt-2 text-xs text-muted-foreground">Suggested onsite days: {t.delivery.onsiteDaysPerWeek}/week</p></article>)}</div></section>
 </main>;
}
