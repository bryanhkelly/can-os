import { Link } from "@tanstack/react-router";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { WorkspaceShell, WorkspacePanel, StatusBadge } from "@/components/workspace";
import type { StudentSuccessPriorities } from "@/domain/student-success";
import { StudentSuccessPriorityPanel } from "./StudentSuccessPriorityPanel";

/** Read-only, canonical Student Today projection. All mutations live in the owning workflow. */
export function StudentExperience({ liveData, success }: {
  liveData: Awaited<ReturnType<typeof getMyStudentToday>>;
  success?: StudentSuccessPriorities | null;
}) {
 const displayName=liveData.student.preferredName??liveData.student.firstName;
 const missing=liveData.coursework.filter(item=>item.timeliness==="missing");
 const upcoming=liveData.coursework.filter(item=>item.status==="assigned"&&item.timeliness!=="missing");
 const format=(date:Date|string)=>new Intl.DateTimeFormat("en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(date));
 return <WorkspaceShell width="wide" eyebrow="CAN OS · Student" title={`Today, ${displayName}`}
  subtitle="Your schedule, coursework and next steps, all from your school records."
  actions={<Link to="/student/courses" className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">Open my classes</Link>}>
  <div className="mt-7 grid gap-3 sm:grid-cols-3">
   <Link to="/student/courses" className="rounded-xl border bg-card p-5 hover:border-foreground focus-visible:outline-2"><p className="text-sm text-muted-foreground">Classes</p><p className="mt-2 text-3xl font-semibold">{liveData.sections.length}</p></Link>
   <Link to="/student/assignments" className="rounded-xl border bg-card p-5 hover:border-foreground focus-visible:outline-2"><p className="text-sm text-muted-foreground">Upcoming assignments</p><p className="mt-2 text-3xl font-semibold">{upcoming.length}</p></Link>
   <Link to="/student/assignments" search={{filter:"missing"}} className="rounded-xl border bg-card p-5 hover:border-foreground focus-visible:outline-2"><p className="text-sm text-muted-foreground">Missing work</p><p className="mt-2 text-3xl font-semibold">{missing.length}</p></Link>
  </div>
  <nav aria-label="Student workspace" className="mt-6 flex flex-wrap gap-2 text-sm">
   <Link to="/student/assignments" className="rounded-lg border px-4 py-2">Assignments</Link>
   <Link to="/student/courses" className="rounded-lg border px-4 py-2">Courses</Link>
   <Link to="/student/support" className="rounded-lg border px-4 py-2">Support</Link>
   <Link to="/student/study-groups" className="rounded-lg border px-4 py-2">Study groups</Link>
   <Link to="/student/report-card" className="rounded-lg border px-4 py-2">Report card</Link>
   <Link to="/calendar" className="rounded-lg border px-4 py-2">Calendar</Link>
  </nav>
  {success !== undefined && <StudentSuccessPriorityPanel plan={success} />}
  {liveData.sections.length>0&&<WorkspacePanel title="My classes" description="Go directly to your enrolled class workspace." className="mt-7">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{liveData.sections.map(section=><Link key={section.sectionId} to="/student/courses" search={{section:section.sectionId}} className="rounded-lg border p-4 hover:bg-muted">
    <h3 className="font-semibold">{section.sectionTitle}</h3><span className="mt-3 inline-block text-sm underline">Open class</span>
   </Link>)}</div>
  </WorkspacePanel>}
  <div className="mt-10 grid gap-8 lg:grid-cols-2">
   <section>
    <h2 className="font-serif text-3xl">Coursework</h2>
    <div className="mt-4 space-y-3">{liveData.coursework.map(item=><article key={item.assessmentId} className="rounded-xl border bg-card p-4">
     <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold"><Link to="/student/assignments" search={{assessment:item.assessmentId}} className="hover:underline">{item.assessmentTitle}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{item.instructions??"Review course instructions"}</p></div><StatusBadge tone={item.timeliness==="missing"?"attention":"neutral"}>{item.timeliness==="missing"?"Missing":item.status}</StatusBadge></div>
     <p className="mt-3 text-xs text-muted-foreground">{item.dueAt?"Due "+format(item.dueAt):"No due date"}</p>
     <Link to="/student/assignments" search={{assessment:item.assessmentId}} className="mt-3 inline-block text-sm font-semibold underline">Open assignment →</Link>
    </article>)}
    {!liveData.coursework.length&&<p className="rounded-xl border p-4 text-sm text-muted-foreground">No assignments require attention today.</p>}</div>
   </section>
   <section>
    <h2 className="font-serif text-3xl">Schedule</h2>
    <div className="mt-4 space-y-3">{liveData.events.map(event=><article key={event.id} className="rounded-xl border bg-card p-4">
     <h3 className="font-semibold"><Link to="/calendar" search={{date:dateKeyInTimezone(new Date(event.startsAt).toISOString(),event.timezone),event:event.id}} className="hover:underline">{event.title}</Link></h3>
     <p className="mt-1 text-sm text-muted-foreground">{format(event.startsAt)} · {event.timezone}</p>
     {event.description&&<p className="mt-2 text-sm">{event.description}</p>}
    </article>)}
    {!liveData.events.length&&<p className="rounded-xl border p-4 text-sm text-muted-foreground">No scheduled events today.</p>}</div>
    <h2 className="mt-8 font-serif text-3xl">Needs your attention</h2>
    <div className="mt-4 space-y-3">{liveData.openActions.map(action=><article key={action.id} className="rounded-xl border bg-card p-4">
      <h3 className="font-semibold">{action.subjectType==="assessment"?<Link to="/student/assignments" search={{assessment:action.subjectId}} className="hover:underline">{action.title}</Link>:<Link to="/student/experiences" search={{action:action.id}} className="hover:underline">{action.title}</Link>}</h3><p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
      {action.subjectType==="assessment"?
       <Link to="/student/assignments" search={{assessment:action.subjectId}} className="mt-3 inline-block text-sm underline">Review assignment →</Link>:
       <Link to="/student/experiences" search={{action:action.id}} className="mt-3 inline-block text-sm underline">Review action →</Link>}
    </article>)}
    {!liveData.openActions.length&&<p className="rounded-xl border p-4 text-sm text-muted-foreground">Nothing needs your attention right now.</p>}</div>
   </section>
  </div>
 </WorkspaceShell>;
}
