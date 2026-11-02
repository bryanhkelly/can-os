import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, CalendarDays, Mail, Sparkles } from "lucide-react";
import { getFamilyHome, getGuardianNeedsYou } from "@/modules/family/family-home.functions";
import { listGuardianGradeFollowUps } from "@/modules/learning/guardian-grade-response.functions";
import { listGuardianCourseApprovals } from "@/modules/learning/guardian-course-approval.functions";
import { WorkspaceShell, QueryState, StatCard, PersonMark, StatusBadge } from "@/components/workspace";
import { prioritizeFamilyNeeds } from "@/domain/family-needs";
import { buildGuardianAttention } from "@/domain/daily-operations";
import { AttentionQueue } from "@/components/operations/AttentionQueue";

export const Route = createFileRoute("/guardian/")({
 validateSearch:(search:Record<string,unknown>):{action?:string;student?:string}=>({
  student:typeof search.student==="string"?search.student:undefined,
  action:typeof search.action==="string"?search.action:undefined,
 }),
 component:FamilyHomePage,
});

type Child = Awaited<ReturnType<typeof getFamilyHome>>["children"][number];
type NeedItem = Awaited<ReturnType<typeof getGuardianNeedsYou>>["items"][number];
type GradeFollowUp = Awaited<ReturnType<typeof listGuardianGradeFollowUps>>["items"][number];
type CourseApproval = Awaited<ReturnType<typeof listGuardianCourseApprovals>>[number];

function FamilyHomePage() {
 const {action,student}=Route.useSearch();
 const [children, setChildren] = useState<Child[]>([]);
 const [needs, setNeeds] = useState<NeedItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [needsWarning, setNeedsWarning] = useState("");
 const [gradeFollowUps, setGradeFollowUps] = useState<GradeFollowUp[]>([]);
 const [gradeFollowUpsWarning, setGradeFollowUpsWarning] = useState("");
 const [courseApprovals, setCourseApprovals] = useState<CourseApproval[]>([]);
 const [courseApprovalsWarning, setCourseApprovalsWarning] = useState("");

 useEffect(() => {
  let active = true;
  Promise.all([getFamilyHome(), getGuardianNeedsYou().then(
   result => ({items:result.items,unavailable:false,groupConsentsUnavailable:result.groupConsentsUnavailable,
    attendanceUnavailable:result.attendanceUnavailable}),
   () => ({items:[] as NeedItem[],unavailable:true,groupConsentsUnavailable:false,attendanceUnavailable:false}),
  ), listGuardianGradeFollowUps().then(
   result => ({items:result.items,unavailable:false}),
   () => ({items:[] as GradeFollowUp[],unavailable:true}),
  ), listGuardianCourseApprovals().then(
   items => ({items,unavailable:false}),
   () => ({items:[] as CourseApproval[],unavailable:true}),
  )]).then(([home, needsYou, schoolQuestions, classApprovals]) => {
   if (!active) return;
   setChildren(home.children);
   setNeeds(needsYou.items);
   setNeedsWarning(needsYou.unavailable
    ? "Your attention list is temporarily unavailable. You can still review each child, attendance and enrollment."
    : [
      needsYou.attendanceUnavailable ? "Attendance follow-ups could not load. Open Attendance & excuses to review current cases." : "",
      needsYou.groupConsentsUnavailable ? "Study group permissions could not load. Open Group permissions to check pending decisions." : "",
     ].filter(Boolean).join(" "));
   setGradeFollowUps(schoolQuestions.items);
   setGradeFollowUpsWarning(schoolQuestions.unavailable ? "School question status is temporarily unavailable. Open academics to review your child's feedback." : "");
   setCourseApprovals(classApprovals.items.filter(item=>!item.myDecision));
   setCourseApprovalsWarning(classApprovals.unavailable ? "Course approval status is unavailable. Open course approvals to check student requests." : "");
   setLoading(false);
  }).catch(() => {
   if (active) { setError("Sign in with an authorized guardian account to view your family home."); setLoading(false); }
  });
  return () => { active = false; };
 }, []);

 return <FamilyHomeView children={children} needs={needs} loading={loading} error={error} needsWarning={needsWarning}
  gradeFollowUps={gradeFollowUps} gradeFollowUpsWarning={gradeFollowUpsWarning}
  courseApprovals={courseApprovals} courseApprovalsWarning={courseApprovalsWarning} action={action} student={student}/>;
}

export function FamilyHomeView({children,needs,loading,error,needsWarning,gradeFollowUps=[],gradeFollowUpsWarning,
 courseApprovals=[],courseApprovalsWarning,action,student}:{
 children:Child[];needs:NeedItem[];loading:boolean;error:string;needsWarning?:string;
 gradeFollowUps?:GradeFollowUp[];gradeFollowUpsWarning?:string;
 courseApprovals?:CourseApproval[];courseApprovalsWarning?:string;action?:string;student?:string;
}){
 const selectedChild=children.find(child=>child.studentPersonId===student);
 const visibleChildren=selectedChild?[selectedChild]:children;
 // Site-wide notices remain visible; child-specific tasks follow the picker.
 const visibleNeeds=needs.filter(item=>!selectedChild||!item.studentPersonId||
  item.studentPersonId===selectedChild.studentPersonId);
 const visibleQuestions=gradeFollowUps.filter(question=>!selectedChild||
  question.studentPersonId===selectedChild.studentPersonId);
 const visibleApprovals=courseApprovals.filter(item=>!selectedChild||
  item.studentPersonId===selectedChild.studentPersonId);
 const approvalNeeds=visibleApprovals.map(item=>({
  id:item.id,
  kind:"course_approval",
  type:"course_registration_request",
  title:item.studentName+": approve class addition",
  detail:item.sectionTitle+" · reply before registration closes.",
  href:"/guardian/course-approvals?action="+encodeURIComponent(item.id),
  dueAt:item.deadline+"T23:59:59",
  priority:"high",
 }));
 const schoolworkItems=visibleChildren.flatMap(child=>child.workToReview.map(work=>({
  id:child.studentPersonId+":"+work.assessmentId,
  kind:"schoolwork",
  type:work.revisionLimitReached?"assignment_revision_limit":"assignment_action",
  title:child.displayName+": "+work.title,
  detail:work.revisionLimitReached?"Revision attempts are exhausted. Review the teacher's feedback and contact the school.":
   work.status==="returned"?"Teacher returned this work for revision.":
   work.status==="draft"?"Student has work in progress to finish.":"Student has an assignment to complete.",
  href:"/guardian/academics?student="+encodeURIComponent(child.studentPersonId)+
   "&section="+encodeURIComponent(work.sectionId)+"&assessment="+encodeURIComponent(work.assessmentId),
  dueAt:work.dueAt,
  priority:work.status==="returned"?"high":"normal",
 })));
 const prioritized=prioritizeFamilyNeeds([...visibleNeeds,...approvalNeeds,...schoolworkItems],Date.now());
 const schoolworkCount=visibleChildren.reduce((total,child)=>total+child.workNeedsAttentionCount,0);
 return <WorkspaceShell
  width="wide"
  eyebrow="CAN OS · Family"
  title="Family home"
  subtitle="Everything that needs your attention across your children, in one place."
  actions={<div className="flex flex-wrap gap-2">
   <Link to="/guardian/apply" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
    Apply to school
   </Link>
   <Link to="/guardian/enrichment" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
    Summer &amp; enrichment
   </Link>
   <Link to="/messages" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Family inbox</Link>
  </div>}
 >
  <QueryState loading={loading ? "Loading your family…" : ""} error={error}>
   <section aria-label="Family overview" className="relative overflow-hidden rounded-3xl border border-border/70 bg-card px-6 py-8 shadow-sm sm:px-9 sm:py-10">
    <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 size-64 rounded-full bg-accent opacity-70 blur-3xl" />
    <div className="relative max-w-2xl">
     <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><Sparkles className="size-4" /> Your family, connected</p>
     <h2 className="mt-3 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Every school day, together.</h2>
     <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">Follow your children’s progress, respond to what needs you, and stay connected with your school.</p>
     <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
      <Link to="/guardian/academics" search={{student:selectedChild?.studentPersonId}} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2"><BookOpen className="size-4" /> View academics <ArrowUpRight className="size-4" /></Link>
      <Link to="/guardian/experiences" search={{student:selectedChild?.studentPersonId}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">School &amp; conferences <ArrowUpRight className="size-4"/></Link>
      <Link to="/messages" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"><Mail className="size-4" /> Family inbox</Link>
      <Link to="/guardian/attendance" search={{student:selectedChild?.studentPersonId}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"><CalendarDays className="size-4" /> Attendance</Link>
      <Link to="/guardian/attendance" search={{student:selectedChild?.studentPersonId}} hash="pickup" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Pickup &amp; safety</Link>
      <Link to="/guardian/health" search={{student:selectedChild?.studentPersonId}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Health &amp; clearance</Link>
      <Link to="/guardian/enrollment-changes" search={{student:selectedChild?.studentPersonId}} className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">Transfer &amp; family changes</Link>
     </div>
    </div>
   </section>
   {children.length>1&&<nav aria-label="Filter family overview by child" className="mt-6 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show</span><Link to="/guardian" search={{action,student:undefined}} aria-current={!selectedChild?"page":undefined} className={"inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 "+(!selectedChild?"bg-primary text-primary-foreground":"bg-card")}>All children</Link>{children.map(child=><Link key={child.studentPersonId} to="/guardian" search={{action,student:child.studentPersonId}} aria-current={selectedChild?.studentPersonId===child.studentPersonId?"page":undefined} className={"inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 "+(selectedChild?.studentPersonId===child.studentPersonId?"bg-primary text-primary-foreground":"bg-card")}>{child.displayName}</Link>)}</nav>}
   {student&&!selectedChild&&!loading&&<p role="status" className="mt-4 text-sm text-muted-foreground">That child is not available in this family account. Showing all authorized children.</p>}
   <div className="mt-6 grid gap-3 sm:grid-cols-3">
    <StatCard label={selectedChild?"Selected child":"Your children"} value={visibleChildren.length}/>
    <StatCard label="Needs your attention" value={needsWarning||courseApprovalsWarning?"Limited":visibleNeeds.length+visibleApprovals.length+schoolworkCount}/>
    <StatCard label="Overdue unfinished work" value={visibleChildren.reduce((total,child)=>total+child.missingCount,0)}/>
   </div>
   <div className="mt-6">
    {needsWarning && <p role="status" className="mb-3 rounded-xl border p-4 text-sm">{needsWarning}</p>}
    {courseApprovalsWarning && <p role="status" className="mb-3 rounded-xl border p-4 text-sm">{courseApprovalsWarning}</p>}
    <AttentionQueue
     items={buildGuardianAttention(prioritized.filter(item=>!action||item.kind==="action"&&item.id===action))}
     empty={action?"The selected action is not available in your current family workspace.":"You are all caught up. Nothing needs your attention right now."}
    />
    {action&&<Link to="/guardian" search={{student}} className="mt-4 inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2">{student?"View all needs for this child":"View all family needs"}</Link>}
    {action&&!needsWarning&&!visibleNeeds.some(item=>item.kind==="action"&&item.id===action)&&!loading&&<p role="alert" className="mt-4 rounded-xl border p-4">This action is unavailable in your current family workspace.</p>}
   </div>

   <section aria-label="School responses to your grade questions" className="mt-10">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <h2 className="font-serif text-2xl font-semibold tracking-tight">Your school grade questions</h2>
     <Link to="/guardian/academics" search={{student:selectedChild?.studentPersonId}} className="inline-flex min-h-11 items-center text-sm font-semibold underline focus-visible:outline-2">Academic progress</Link>
    </div>
    <p className="mt-2 text-sm text-muted-foreground">Questions you sent about released grades, and your school's responses. Pending questions are awaiting school action, not another family task.</p>
    {gradeFollowUpsWarning&&<p className="mt-3 rounded-lg border p-3 text-sm" role="status">{gradeFollowUpsWarning}</p>}
    {!gradeFollowUpsWarning&&visibleQuestions.length===0&&<p className="mt-3 text-sm text-muted-foreground">No school grade questions to review in the current academic view.</p>}
    <div className="mt-4 space-y-3">
     {visibleQuestions.slice(0,6).map(question=><article key={question.id} className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
       <p className="font-semibold">{question.studentName} · {question.assessmentTitle}</p>
       <StatusBadge tone={question.status==="resolved"?"success":"info"}>{question.status==="resolved"?"School responded":"Awaiting school response"}</StatusBadge>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Your question: {question.question}</p>
      {question.status==="resolved"&&question.resolutionNote&&<p className="mt-3 whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">School response: {question.resolutionNote}</p>}
      <Link to="/guardian/academics"
       search={{student:question.studentPersonId,section:question.sectionId,assessment:question.assessmentId,submission:question.submissionId}}
       className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline focus-visible:outline-2">View grade and school follow-up</Link>
     </article>)}
    </div>
    {visibleQuestions.length>6&&<p className="mt-3 text-sm text-muted-foreground">Showing 6 of {visibleQuestions.length} recent questions. Open academic progress for your child's full assignment history.</p>}
   </section>

   <section aria-label="Your children" className="mt-12">
    <h2 className="font-serif text-2xl font-semibold tracking-tight">Your children</h2>
    {selectedChild&&<p className="mt-2 text-sm text-muted-foreground">Showing {selectedChild.displayName}’s school information. <Link to="/guardian" search={{action,student:undefined}} className="inline-flex min-h-11 items-center font-semibold underline focus-visible:outline-2">Show all children</Link></p>}
    {children.length === 0 && <div className="mt-4 rounded-xl border bg-card p-5">
     <p className="font-semibold">Waiting for your first child to be enrolled?</p>
     <p className="mt-2 text-sm text-muted-foreground">Your school must connect a verified guardian relationship before your child appears here. You can review any pending admission offer or enrollment checklist without an active class assignment.</p>
     <Link to="/guardian/admission-offers" search={{student:undefined}}
       className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
       View applications and enrollment offers →
     </Link>
     <p className="mt-2 text-xs text-muted-foreground">If your verified family account has been invited to an eligible school, you can submit a new application. Otherwise, contact admissions to connect your family membership. Signing in alone does not authorize student access.</p>
     <Link to="/guardian/apply" className="mt-3 inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
       Start or check my application →
     </Link>
    </div>}
    {children.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2">
     {visibleChildren.map(child => <article key={child.studentProfileId} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="flex items-start gap-3">
        <PersonMark name={`${child.displayName} ${child.lastName}`}/>
        <div>
        <h3 className="text-lg font-semibold"><Link to="/guardian/academics" search={{student:child.studentPersonId}} className="hover:underline focus-visible:outline-2">{child.displayName} {child.lastName}</Link></h3>
        <p className="mt-1 text-xs text-muted-foreground">{child.awaitingSections ? "Program enrollment active; classes not assigned yet" : `${child.sectionCount} active ${child.sectionCount === 1 ? "class" : "classes"}`}</p>
        </div>
       </div>
       <StatusBadge tone={child.status==="on_track"?"success":"attention"}>
        {child.status === "awaiting_courses" ? "Enrolled · awaiting classes" : child.status === "on_track" ? "On track" : "Needs attention"}
       </StatusBadge>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/academics" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Overdue</Link></dt><dd className="text-lg font-semibold">{child.missingCount}</dd></div>
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/attendance" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Absences</Link></dt><dd className="text-lg font-semibold">{child.unexcusedAbsences}</dd></div>
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/attendance" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Tardies</Link></dt><dd className="text-lg font-semibold">{child.unexcusedTardies}</dd></div>
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/academics" search={{student:child.studentPersonId}} className="underline focus-visible:outline-2">Next due</Link></dt><dd className="text-sm font-semibold">{child.nextDueAt ? new Date(child.nextDueAt).toLocaleDateString() : "—"}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">{child.missingCount>0?`${child.missingCount} overdue assignment(s) need follow-through.`:child.workNeedsAttentionCount>0?`${child.workNeedsAttentionCount} assignment(s) to complete or revise.`:child.unexcusedAbsences>0||child.unexcusedTardies>0?"Unexcused attendance marks remain. Check Attendance for the school's review status.":child.awaitingSections?"Your school is arranging class placement.":"No overdue unfinished work or unexcused attendance cases in this summary."}</p>
      {child.workToReview.length>0&&<div className="mt-4 rounded-lg border p-3">
       <p className="text-sm font-semibold">Schoolwork to review · {child.workNeedsAttentionCount}</p>
       <ul className="mt-2 space-y-2">{child.workToReview.map(work=><li key={work.assessmentId} className="text-sm">
        <Link to="/guardian/academics" search={{student:child.studentPersonId,section:work.sectionId,assessment:work.assessmentId}} className="font-semibold underline focus-visible:outline-2">{work.title}</Link>
        <span className="ml-2 text-xs text-muted-foreground">{work.revisionLimitReached?"School follow-up needed · no revision attempts remain":work.status==="returned"?"Revision requested":work.status==="draft"?"Draft in progress":"Not submitted"}</span>
       </li>)}</ul>
      </div>}
      <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={`${child.displayName} links`}>
       <Link to="/guardian/academics" search={{student:child.studentPersonId}} className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 hover:bg-muted focus-visible:outline-2">Academics</Link>
       <Link to="/guardian/attendance" search={{student:child.studentPersonId}} className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 hover:bg-muted focus-visible:outline-2">Attendance</Link>
       <Link to="/guardian/attendance" search={{student:child.studentPersonId}} hash="pickup" className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 hover:bg-muted focus-visible:outline-2">Pickup &amp; safety</Link>
       <Link to="/guardian/health" search={{student:child.studentPersonId}} className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 hover:bg-muted focus-visible:outline-2">Health &amp; clearance</Link>
       <Link to="/guardian/enrollment-changes" search={{student:child.studentPersonId}} className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 hover:bg-muted focus-visible:outline-2">Transfer &amp; family changes</Link>
       <Link to="/guardian/report-cards" search={{student:child.studentPersonId}} className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 hover:bg-muted focus-visible:outline-2">Report cards</Link>
       <Link to="/guardian/admission-offers" search={{student:child.studentPersonId}} className="inline-flex min-h-11 items-center rounded-full border px-3 py-2 hover:bg-muted focus-visible:outline-2">Offers</Link>
      </nav>
     </article>)}
    </div>}
   </section>

   <section aria-label="Family shortcuts" className="mt-12">
    <h2 className="font-serif text-2xl font-semibold tracking-tight">Family resources</h2>
    <div className="mt-4 flex flex-wrap gap-3 text-sm">
     <Link to="/ask" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">Ask CAN</Link>
     <Link to="/guardian/experiences" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">School calendar &amp; teacher conferences</Link>
     <Link to="/guardian/group-permissions" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">Study group permissions</Link>
     <Link to="/guardian/watching" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">Things CAN Is Watching</Link>
     <Link to="/guardian/admission-offers" search={{student:undefined}} className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">Admission offers</Link>
     <Link to="/guardian/course-approvals" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">Course approvals</Link>
     <Link to="/messages" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">Messages</Link>
     <Link to="/notifications" className="inline-flex min-h-11 items-center rounded-full border px-4 py-2 hover:bg-muted focus-visible:outline-2">Notifications</Link>
    </div>
   </section>
  </QueryState>
 </WorkspaceShell>;
}
