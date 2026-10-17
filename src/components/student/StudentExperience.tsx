import { Link } from "@tanstack/react-router";
import type { StudentTodayData } from "@/modules/student-experience/student-today.server";

/** Read-only, canonical Student Today projection. All mutations live in the owning workflow. */
export function StudentExperience({ liveData }: { liveData: StudentTodayData }) {
 const displayName=liveData.student.preferredName??liveData.student.firstName;
 const missing=liveData.coursework.filter(item=>item.timeliness==="missing");
 const upcoming=liveData.coursework.filter(item=>item.status==="assigned"&&item.timeliness!=="missing");
 const format=(date:Date|string)=>new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(date));
 return <main className="mx-auto max-w-6xl px-5 py-10">
  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Student</p>
  <h1 className="mt-3 font-serif text-5xl">Today, {displayName}</h1>
  <p className="mt-3 text-sm text-muted-foreground">Your schedule, coursework and next steps, all from your school records.</p>
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
   <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Classes</p><p className="mt-2 text-3xl font-semibold">{liveData.sections.length}</p></div>
   <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Upcoming assignments</p><p className="mt-2 text-3xl font-semibold">{upcoming.length}</p></div>
   <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">Missing work</p><p className="mt-2 text-3xl font-semibold">{missing.length}</p></div>
  </div>
  <nav aria-label="Student workspace" className="mt-6 flex flex-wrap gap-2 text-sm">
   <Link to="/student/assignments" className="rounded-lg border px-4 py-2">Assignments</Link>
   <Link to="/student/courses" className="rounded-lg border px-4 py-2">Courses</Link>
   <Link to="/student/support" className="rounded-lg border px-4 py-2">Support</Link>
   <Link to="/student/study-groups" className="rounded-lg border px-4 py-2">Study groups</Link>
   <Link to="/student/report-card" className="rounded-lg border px-4 py-2">Report card</Link>
   <Link to="/calendar" className="rounded-lg border px-4 py-2">Calendar</Link>
  </nav>
  <div className="mt-10 grid gap-8 lg:grid-cols-2">
   <section>
    <h2 className="font-serif text-3xl">Coursework</h2>
    <div className="mt-4 space-y-3">{liveData.coursework.map(item=><article key={item.assessmentId} className="rounded-xl border bg-card p-4">
     <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{item.assessmentTitle}</h3><p className="mt-1 text-sm text-muted-foreground">{item.instructions??"Review course instructions"}</p></div><span className="text-xs text-muted-foreground">{item.timeliness==="missing"?"Missing":item.status}</span></div>
     <p className="mt-3 text-xs text-muted-foreground">{item.dueAt?"Due "+format(item.dueAt):"No due date"}</p>
     <a href={"/student/assignments?assessment="+encodeURIComponent(item.assessmentId)} className="mt-3 inline-block text-sm font-semibold underline">Open assignment →</a>
    </article>)}
    {!liveData.coursework.length&&<p className="rounded-xl border p-4 text-sm text-muted-foreground">No assignments require attention today.</p>}</div>
   </section>
   <section>
    <h2 className="font-serif text-3xl">Schedule</h2>
    <div className="mt-4 space-y-3">{liveData.events.map(event=><article key={event.id} className="rounded-xl border bg-card p-4">
     <h3 className="font-semibold">{event.title}</h3>
     <p className="mt-1 text-sm text-muted-foreground">{format(event.startsAt)} · {event.timezone}</p>
     {event.description&&<p className="mt-2 text-sm">{event.description}</p>}
    </article>)}
    {!liveData.events.length&&<p className="rounded-xl border p-4 text-sm text-muted-foreground">No scheduled events today.</p>}</div>
    <h2 className="mt-8 font-serif text-3xl">Needs your attention</h2>
    <div className="mt-4 space-y-3">{liveData.openActions.map(action=><article key={action.id} className="rounded-xl border bg-card p-4">
      <h3 className="font-semibold">{action.title}</h3><p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
      <Link to="/student/experiences" className="mt-3 inline-block text-sm underline">Review action →</Link>
    </article>)}
    {!liveData.openActions.length&&<p className="rounded-xl border p-4 text-sm text-muted-foreground">Nothing needs your attention right now.</p>}</div>
   </section>
  </div>
 </main>;
}
