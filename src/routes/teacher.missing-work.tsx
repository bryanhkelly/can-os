import {createFileRoute,Link} from "@tanstack/react-router";
import {getAssignments} from "@/modules/student-experience/assignments.functions";
import {missingWorkQueue} from "@/domain/missing-work";
export const Route=createFileRoute("/teacher/missing-work")({loader:()=>getAssignments(),component:TeacherMissingWork});
function TeacherMissingWork(){
 const data=Route.useLoaderData();
 const queue=missingWorkQueue(data.assignments,new Date());
 return <main className="mx-auto max-w-5xl px-5 py-10">
  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic teacher preview</p>
  <h1 className="mt-2 font-serif text-4xl">Missing work</h1>
  <p className="mt-3 text-sm text-muted-foreground">Overdue assignments without a submitted attempt for the named synthetic student. This is not a real classwide teacher roster.</p>
  <div className="mt-6 rounded-xl border bg-card p-5"><p className="font-serif text-3xl">{queue.length} overdue</p><p className="mt-2 text-xs text-muted-foreground">Student-facing data reused for a safe preview; teacher section roster and outreach require scoped access later.</p></div>
  <section className="mt-6 space-y-3">{queue.map(x=><article key={x.assessmentId} className="rounded-xl border bg-card p-5"><p className="text-xs text-muted-foreground">{x.course} · due {new Date(x.dueAt!).toLocaleDateString()}</p><h2 className="mt-2 font-semibold">{x.title}</h2><Link to={"/student/assignments?assessment="+encodeURIComponent(x.assessmentId)} className="mt-3 inline-block text-xs font-semibold underline">Open assignment →</Link></article>)}
  {!queue.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No overdue assignments in this synthetic student's current records.</p>}</section>
 </main>;
}
