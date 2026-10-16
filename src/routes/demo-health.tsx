import {createFileRoute,Link} from "@tanstack/react-router";
import {getSyntheticFixtureHealth} from "@/modules/operations/fixture-health.functions";
export const Route=createFileRoute("/demo-health")({loader:()=>getSyntheticFixtureHealth(),component:DemoHealth});
function DemoHealth(){
 const data=Route.useLoaderData();
 return <main className="mx-auto max-w-5xl px-5 py-10">
 <Link to="/operations" className="text-xs underline">← School operations</Link>
 <p className="mt-5 text-xs font-bold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic development</p>
 <h1 className="mt-2 font-serif text-4xl">Demo fixture health</h1>
 <p className="mt-3 max-w-3xl text-sm text-muted-foreground">These checks query the current Neon database. A passing record count means this workflow has sample data, not that its interactions have passed end-to-end tests.</p>
 <div className="mt-6 rounded-xl border p-5"><p className="text-sm">Database: <strong>{data.connected?"Connected":"Not configured"}</strong></p><p className="mt-1 font-serif text-3xl">{data.ready} / {data.total}</p><p className="text-sm text-muted-foreground">Workflow fixture categories populated</p></div>
 <section className="mt-6 rounded-xl border p-5"><h2 className="font-serif text-2xl">Admissions scenario coverage</h2><p className="mt-2 text-sm text-muted-foreground">Actual synthetic records, not simulated progress or test-pass evidence.</p><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Fresh applications",data.admissions.fresh],["Accepted offers",data.admissions.accepted],["Active students",data.admissions.active],["Declined scenarios",data.admissions.blocked]].map(([label,count])=><div key={label} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-serif text-2xl">{count}</p></div>)}</div></section><div className="mt-6 grid gap-3 sm:grid-cols-2">{data.checks.map(c=><article key={c.key} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><h2 className="font-semibold">{c.name}</h2><span className={c.ok?"text-xs font-semibold":"text-xs font-semibold text-red-600"}>{c.ok?"Populated":"Missing"}</span></div><p className="mt-2 text-2xl font-serif">{c.count}</p><p className="text-xs text-muted-foreground">Minimum useful records: {c.minimum}</p><Link to={c.route} className="mt-3 inline-block text-xs underline">Open workflow →</Link></article>)}</div>
 <p className="mt-6 text-sm text-muted-foreground">Fixture reset and scenario switching require separate disposable-database operations; this read-only verification page deliberately cannot reset a shared database.</p>
 </main>;
}