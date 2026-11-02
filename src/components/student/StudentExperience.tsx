import { Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, CalendarDays } from "lucide-react";
import { DailyCanvas, selectDailyCanvasContent, type DailyCanvasContent } from "./DailyCanvas";
import type { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { dateKeyInTimezone } from "@/modules/calendar/timezone";
import { EmptyState, WorkspaceShell, WorkspacePanel, StatusBadge } from "@/components/workspace";
import type { StudentSuccessPriorities } from "@/domain/student-success";
import { StudentSuccessPriorityPanel } from "./StudentSuccessPriorityPanel";
import { StudentSuccessSupportPanel } from "./StudentSuccessSupportPanel";
import type { StudentSuccessSupportSummary } from "@/domain/student-success-support";

const formatStatus=(status:string)=>status.replaceAll("_"," ").replace(/^\w/,letter=>letter.toUpperCase());

/** Read-only, canonical Student Today projection. All mutations live in the owning workflow. */
export function StudentExperience({ liveData, success, support }: {
  liveData: Awaited<ReturnType<typeof getMyStudentToday>>;
  success?: StudentSuccessPriorities | null;
  support?: StudentSuccessSupportSummary | null;
}) {
 const displayName=liveData.student.preferredName??liveData.student.firstName;
 const missing=liveData.coursework.filter(item=>item.timeliness==="missing");
 const upcoming=liveData.coursework.filter(item=>item.status==="assigned"&&item.timeliness!=="missing");
 const overdueCount=success ? success.overdue : missing.length;
 const upcomingCount=success ? success.dueSoon + success.toDo : upcoming.length;
 const summaryUnavailable=success === null;
 const otherOpenActions=liveData.openActions.filter(action => !support?.tasks.some(task=>task.id===action.id));
 const firstWeek=liveData.firstWeek??[];
 const starter=firstWeek.find(item=>item.ready);
 const format=(date:Date|string,timeZone?:string)=>new Intl.DateTimeFormat("en-US",{
  dateStyle:"medium",timeStyle:"short",...(timeZone?{timeZone}:{}),
 }).format(new Date(date));
 return <WorkspaceShell width="wide" eyebrow="CAN OS · Student" title={`Today, ${displayName}`}
  subtitle="Your schedule, coursework and next steps, all from your school records.">
  <DailyCanvas audience="student" content={selectDailyCanvasContent([
    { id: "student-default", audience: "student", priority: "default", headline: "Make today count.", supportingCopy: "A fresh start, a clear next step, and everything you need to keep learning.", campaignLabel: "Your learning day" },
  ] satisfies DailyCanvasContent[], "student", new Date())}
   operationalSummary={<span>{liveData.sections.length} classes · {summaryUnavailable ? "Assignments updating" : `${upcomingCount} assignments to do or due soon`}</span>}
   primaryAction={starter ? <Link to="/student/assignments" search={{section:starter.sectionId,assessment:starter.firstWeek.assessment!.id}} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Start first-week work <ArrowUpRight className="size-4" /></Link> : <Link to="/student/courses" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">View my classes <ArrowUpRight className="size-4" /></Link>}
   secondaryAction={<Link to="/student/assignments" className="inline-flex min-h-11 items-center rounded-xl border border-white/70 px-5 py-3 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Assignments</Link>}
  />
  <div className="mt-6 grid gap-3 sm:grid-cols-3">
   <Link to="/student/courses" className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2"><p className="flex items-center gap-2 text-sm text-muted-foreground"><BookOpen className="size-4" /> Classes</p><p className="mt-2 text-3xl font-semibold">{liveData.sections.length}</p></Link>
   <Link to="/student/assignments" className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2"><p className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" /> {success?"To do / due soon":"Upcoming assignments"}</p><p className="mt-2 text-3xl font-semibold">{summaryUnavailable?"—":upcomingCount}</p></Link>
   <Link to="/student/assignments" search={{filter:success?"todo":"missing"}} className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2"><p className="text-sm text-muted-foreground">{success?"Overdue / missing work":"Missing work"}</p><p className="mt-2 text-3xl font-semibold">{summaryUnavailable?"—":overdueCount}</p></Link>
  </div>
  <nav aria-label="Student workspace" className="mt-6 flex flex-wrap gap-2 text-sm">
   <Link to="/student/assignments" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Assignments</Link>
   <Link to="/student/courses" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Courses</Link>
   <Link to="/student/support" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Support</Link>
   <Link to="/student/study-groups" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Study groups</Link>
   <Link to="/student/experiences" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">School &amp; community</Link>
   <Link to="/student/report-card" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Report card</Link>
   <Link to="/calendar" className="rounded-lg border px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Calendar</Link>
  </nav>
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
  {liveData.sections.length>0&&<WorkspacePanel title="My classes" description="Go directly to your enrolled class workspace." className="mt-7">
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{liveData.sections.map(section=><Link key={section.sectionId} to="/student/courses" search={{section:section.sectionId}} className="rounded-lg border p-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">
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
     <p className="mt-3 text-xs text-muted-foreground">{item.dueAt?"Due "+format(item.dueAt):"No due date"}</p>
     <Link to="/student/assignments" search={{assessment:item.assessmentId}} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline focus-visible:outline-2">Open assignment →</Link>
    </article>;
    })}
    {!liveData.coursework.length&&<EmptyState title="No published coursework in your current classes." description="Published work will appear here when it is assigned to one of your classes."/>}</div>
   </WorkspacePanel>
   <div className="space-y-6">
   <WorkspacePanel title="Schedule" description="Events from your enrolled classes and school.">
    <div className="space-y-3">{liveData.events.map(event=><article key={event.id} className="rounded-xl border bg-background p-4">
     <h3 className="font-semibold"><Link to="/calendar" search={{date:dateKeyInTimezone(new Date(event.startsAt).toISOString(),event.timezone),event:event.id}} className="hover:underline focus-visible:outline-2">{event.title}</Link></h3>
     <p className="mt-1 text-sm text-muted-foreground">{format(event.startsAt,event.timezone)} · {event.timezone}</p>
     {event.description&&<p className="mt-2 text-sm">{event.description}</p>}
    </article>)}
    {!liveData.events.length&&<EmptyState title="No scheduled events today." description="Your school and class events will appear here when scheduled."/>}</div>
   </WorkspacePanel>
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
  </div>
 </WorkspaceShell>;
}
