import {createFileRoute,Link} from "@tanstack/react-router";
import {getSyntheticTeacherMissingWork} from "@/modules/student-experience/teacher-missing-work.functions";
export const Route=createFileRoute("/teacher/missing-work")({loader:()=>getSyntheticTeacherMissingWork(),component:TeacherMissingWork});
function TeacherMissingWork(){
 const {connected,items}=Route.useLoaderData();
 const studentCount=new Set(items.map(x=>x.studentProfileId)).size;
 return <main className="mx-auto max-w-5xl px-5 py-10">
  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Synthetic teacher</p>
  <h1 className="mt-2 font-serif text-4xl">Missing work</h1>
  <p className="mt-3 text-sm text-muted-foreground">Overdue work across active students in the demo teacher's assigned sections. Only explicitly synthetic student records are included. This is not an authenticated teacher view.</p>
  {!connected&&<p role="status" className="mt-4 rounded-xl border p-4">Neon is not connected. The queue cannot load.</p>}
  <div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border bg-card p-5"><p className="font-serif text-3xl">{items.length}</p><p className="text-xs text-muted-foreground">Overdue student-assignment items</p></div><div className="rounded-xl border bg-card p-5"><p className="font-serif text-3xl">{studentCount}</p><p className="text-xs text-muted-foreground">Students needing follow-up</p></div></div>
  <section className="mt-6 space-y-3">{items.map(x=><article key={x.assessmentId+":"+x.studentProfileId} className="rounded-xl border bg-card p-5"><p className="text-xs text-muted-foreground">{x.course} · due {new Date(x.dueAt).toLocaleDateString()}</p><h2 className="mt-2 font-semibold">{x.title}</h2><p className="mt-1 text-sm">{x.studentName} · {x.status==="assigned"?"Assigned but not submitted":"No attempt recorded"}</p><Link to={"/student/assignments?assessment="+encodeURIComponent(x.assessmentId)} className="mt-3 inline-block text-xs font-semibold underline">Open student assignment demo →</Link></article>)}
  {connected&&!items.length&&<p className="rounded-xl border p-5 text-sm text-muted-foreground">No overdue missing work in the assigned synthetic sections.</p>}</section>
 </main>;
}
