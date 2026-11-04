import { Link } from "@tanstack/react-router";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { EmptyState, WorkspacePanel, StatusBadge, WorkspaceNotice } from "@/components/workspace";
import type { StudentSuccessPriorities } from "@/domain/student-success";
import { StudentSuccessPriorityPanel } from "./StudentSuccessPriorityPanel";
import { StudentSuccessSupportPanel } from "./StudentSuccessSupportPanel";
import type { StudentSuccessSupportSummary } from "@/domain/student-success-support";
import { StudentDashboard } from "./StudentDashboard";
import type { StudentDashboardData } from "./student-dashboard-data";

const formatStatus=(status:string)=>status.replaceAll("_"," ").replace(/^\w/,letter=>letter.toUpperCase());

/** Read-only, canonical Student Today projection. All mutations live in the owning workflow. */
export function StudentExperience({ liveData, success, support, dashboard }: {
  liveData: Awaited<ReturnType<typeof getMyStudentToday>>;
  success?: StudentSuccessPriorities | null;
  support?: StudentSuccessSupportSummary | null;
  dashboard?: StudentDashboardData;
}) {
 const otherOpenActions=liveData.openActions.filter(action => !support?.tasks.some(task=>task.id===action.id));
 const firstWeek=liveData.firstWeek??[];
 const format=(date:Date|string,timeZone?:string)=>new Intl.DateTimeFormat("en-US",{
  dateStyle:"medium",timeStyle:"short",...(timeZone?{timeZone}:{}),
 }).format(new Date(date));
 return <main className="student-dashboard-page min-h-screen min-w-0 bg-background text-foreground">
  {liveData.hasEnrollmentGuardian === false && <WorkspaceNotice tone="danger">
   Your student record does not have a verified guardian with enrollment permission. Study-group requests need guardian permission. Ask your school office to verify the parent or guardian on your record; you cannot add or verify a guardian from this student account.
  </WorkspaceNotice>}
  <StudentDashboard liveData={liveData} data={dashboard} />
  <div className="student-dashboard-followups">
  {success !== undefined && <StudentSuccessPriorityPanel plan={success} />}
  {support !== undefined && <StudentSuccessSupportPanel support={support} />}
  {firstWeek.length>0&&<WorkspacePanel title="Your first week" description="Open actual published lessons and assignment work from your enrolled classes. Setup gaps are shown honestly." className="mt-7">
   <div className="grid gap-3 sm:grid-cols-2">{firstWeek.map(classroom=>{
    const title=liveData.sections.find(section=>section.sectionId===classroom.sectionId)?.sectionTitle??"Class";
    return <article key={classroom.sectionId} className="rounded-lg border p-4">
     <h3 className="font-semibold">{title}</h3>
     <StatusBadge tone={classroom.ready?"success":"attention"}>{classroom.ready?"Ready to start":"Setup in progress"}</StatusBadge>
     <p className="mt-2 text-xs text-muted-foreground">{classroom.ready?"Lesson and submission work are available.":"Your school still needs to complete this class setup."}</p>
     {classroom.ready?<div className="mt-3 space-y-2 text-sm">
      <p>1. <Link to="/classes" search={{section:classroom.sectionId,tab:"lessons",lesson:classroom.firstWeek.lesson!.id}} className="underline focus-visible:outline-2">Study “{classroom.firstWeek.lesson!.title}”</Link></p>
      <p>2. <Link to="/student/assignments" search={{section:classroom.sectionId,assessment:classroom.firstWeek.assessment!.id}} className="underline focus-visible:outline-2">Complete “{classroom.firstWeek.assessment!.title}”</Link></p>
     </div>:<ul className="mt-3 list-inside list-disc space-y-1 text-xs">{classroom.blockers.map(item=><li key={item.key}>{item.message}</li>)}</ul>}
    </article>;
   })}</div>
  </WorkspacePanel>}
  <details className="mt-6 border bg-card p-4">
  <summary className="cursor-pointer text-sm font-semibold">More learning details and school links</summary>
  <nav aria-label="Student workspace" className="mt-4 flex flex-wrap gap-2 text-sm">
   <Link to="/student/assignments" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Assignments</Link>
   <Link to="/student/courses" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Courses</Link>
   <Link to="/student/support" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Support</Link>
   <Link to="/student/study-groups" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Study groups</Link>
   <Link to="/student/my-school" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">School &amp; community</Link>
   <Link to="/profiles" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">My profile</Link>
   <Link to="/student/report-card" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Report card</Link>
   <Link to="/calendar" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Calendar</Link>
  </nav>
  {liveData.sections.length>0&&<WorkspacePanel title="My classes" description="Go directly to your enrolled class workspace." className="mt-7">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{liveData.sections.map(section=><Link key={section.sectionId} to="/classes" search={{section:section.sectionId,tab:"lessons"}} className="rounded-lg border p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">
    <h3 className="font-semibold">{section.sectionTitle}</h3><span className="mt-3 inline-block text-sm underline">Open class</span>
   </Link>)}</div>
  </WorkspacePanel>}
  <div className="mt-10 grid gap-6 lg:grid-cols-2">
   <WorkspacePanel title="Coursework" description="Published assignments and the latest saved status." className="min-w-0">
    <div className="space-y-3">{liveData.coursework.map(item=>{
     const status=item.timeliness==="missing"?"Missing":item.status==="returned"?"Revision requested":
      item.status==="submitted"&&item.timeliness==="late"?"Submitted · late":
      item.status==="assigned"&&item.timeliness==="late"?"Late":
      formatStatus(item.status??"assigned");
     const tone=item.timeliness==="missing"||item.status==="returned"||item.timeliness==="late"
      ?"attention":item.status==="graded"?"success":"neutral";
     return <article key={item.assessmentId} className="rounded-xl border bg-background p-4">
     <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-semibold"><Link to="/student/assignments" search={{assessment:item.assessmentId}} className="hover:underline focus-visible:outline-2">{item.assessmentTitle}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{item.instructions??"Review course instructions."}</p></div><StatusBadge tone={tone}>{status}</StatusBadge></div>
     <p className="mt-3 text-xs text-muted-foreground">{item.dueAt?"Due "+format(item.dueAt,liveData.sections.find(section=>section.sectionId===item.sectionId)?.timezone):"No due date"}</p>
     <Link to="/student/assignments" search={{assessment:item.assessmentId}} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline focus-visible:outline-2">Open assignment →</Link>
    </article>;
    })}
    {!liveData.coursework.length&&<EmptyState title="No published coursework in your current classes." description="Published work will appear here when it is assigned to one of your classes."/>}</div>
   </WorkspacePanel>
   <div className="space-y-6">
   <WorkspacePanel title="Schedule" description="Events from your enrolled classes and school.">
    <div className="space-y-3">{liveData.events.map(event=><article key={event.id} className="rounded-xl border bg-background p-4">
     <h3 className="font-semibold"><Link to="/calendar" search={{date:dateKeyInTimezone(new Date(event.startsAt).toISOString(),event.timezone),event:event.id}} className="hover:underline focus-visible:outline-2">{event.title}</Link></h3>
     {event.cancelled&&<StatusBadge tone="attention">Cancelled</StatusBadge>}
     <p className="mt-1 text-sm text-muted-foreground">{format(event.startsAt,event.timezone)} · {event.timezone}</p>
     {event.description&&<p className="mt-2 text-sm">{event.description}</p>}
    </article>)}
    {!liveData.events.length&&<EmptyState title="No scheduled events today." description="Your school and class events will appear here when scheduled."/>}</div>
   </WorkspacePanel>
    </div>
  </div>
  </details>
    <WorkspacePanel title="Other open actions" description="Support or follow-ups outside your assignment list.">
    <div className="space-y-3">{otherOpenActions.map(action=><article key={action.id} className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <h3 className="min-w-0 font-semibold">{action.subjectType==="assessment"?<Link to="/student/assignments" search={{assessment:action.subjectId}} className="hover:underline focus-visible:outline-2">{action.title}</Link>:<Link to="/student/experiences" search={{action:action.id}} className="hover:underline focus-visible:outline-2">{action.title}</Link>}</h3>
       <StatusBadge tone={action.priority==="urgent"||action.priority==="high"?"attention":"neutral"}>{action.priority==="urgent"?"Urgent":action.priority==="high"?"High priority":"Open"}</StatusBadge>
      </div>
      {action.description&&<p className="mt-1 text-sm text-muted-foreground">{action.description}</p>}
      {action.subjectType==="assessment"?
       <Link to="/student/assignments" search={{assessment:action.subjectId}} className="mt-2 inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2">Review assignment →</Link>:
       <Link to="/student/experiences" search={{action:action.id}} className="mt-2 inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2">Review action →</Link>}
    </article>)}
    {!otherOpenActions.length&&<EmptyState title="No additional open actions outside your learning support list."/>}</div>
    </WorkspacePanel>
  </div>
 </main>;
}
