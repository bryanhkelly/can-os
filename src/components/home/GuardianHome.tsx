import { DashboardHome } from "@/components/workspace/dashboard-home";
import { DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, ClipboardList, MessageCircle } from "lucide-react";
import { getFamilyHome, getGuardianNeedsYou } from "@/modules/family/family-home.functions";
import { listGuardianGradeFollowUps } from "@/modules/learning/guardian-grade-response.functions";
import { listGuardianCourseApprovals } from "@/modules/learning/guardian-course-approval.functions";
import { getGuardianAdmissionOffers } from "@/modules/enrollment/guardian-admission-offers.functions";
import { QueryState, StatCard, StatusBadge } from "@/components/workspace";
import { prioritizeFamilyNeeds } from "@/domain/family-needs";
import { buildGuardianAttention } from "@/domain/daily-operations";
import { AttentionQueue } from "@/components/operations/AttentionQueue";
import { GuardianEnrollmentNextSteps } from "@/components/home/GuardianEnrollmentNextSteps";
import { GuardianGradeQuestions } from "@/components/home/GuardianGradeQuestions";
import { GuardianChildSummaryCard } from "@/components/home/GuardianChildSummaryCard";
import { dateTimeInputInTimezone } from "@/modules/calendar/timezone";

type Child = Awaited<ReturnType<typeof getFamilyHome>>["children"][number];
type NeedItem = Awaited<ReturnType<typeof getGuardianNeedsYou>>["items"][number];
type GradeFollowUp = Awaited<ReturnType<typeof listGuardianGradeFollowUps>>["items"][number];
type CourseApproval = Awaited<ReturnType<typeof listGuardianCourseApprovals>>[number];
type EnrollmentApplication = Awaited<ReturnType<typeof getGuardianAdmissionOffers>>[number];

export function FamilyHomePage({action,student}: {action?:string;student?:string}) {
 const [children, setChildren] = useState<Child[]>([]);
 const [needs, setNeeds] = useState<NeedItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");
 const [retryKey, setRetryKey] = useState(0);
 const [needsWarning, setNeedsWarning] = useState("");
 const [gradeFollowUps, setGradeFollowUps] = useState<GradeFollowUp[]>([]);
 const [gradeFollowUpsWarning, setGradeFollowUpsWarning] = useState("");
 const [courseApprovals, setCourseApprovals] = useState<CourseApproval[]>([]);
 const [courseApprovalsWarning, setCourseApprovalsWarning] = useState("");
 const [enrollmentApplications, setEnrollmentApplications] = useState<EnrollmentApplication[]>([]);
 const [enrollmentWarning, setEnrollmentWarning] = useState("");

 useEffect(() => {
  let active = true;
  setLoading(true);
  setError("");
  setChildren([]);
  setNeeds([]);
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
  ), getGuardianAdmissionOffers().then(
   items => ({items,unavailable:false}),
   () => ({items:[] as EnrollmentApplication[],unavailable:true}),
  )]).then(([home, needsYou, schoolQuestions, classApprovals, enrollment]) => {
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
   setEnrollmentApplications(enrollment.items);
   setEnrollmentWarning(enrollment.unavailable
    ? "Enrollment status is temporarily unavailable. Open applications and enrollment offers to review current steps."
    : "");
   setLoading(false);
  }).catch(() => {
   if (active) { setError("Sign in with an authorized guardian account to view your family home."); setLoading(false); }
  });
  return () => { active = false; };
 }, [retryKey]);

 return <FamilyHomeView children={children} needs={needs} loading={loading} error={error} needsWarning={needsWarning}
  gradeFollowUps={gradeFollowUps} gradeFollowUpsWarning={gradeFollowUpsWarning}
   courseApprovals={courseApprovals} courseApprovalsWarning={courseApprovalsWarning}
   enrollmentApplications={enrollmentApplications} enrollmentWarning={enrollmentWarning}
   action={action} student={student} onRetry={()=>setRetryKey(key=>key+1)}/>;
}

export function FamilyHomeView({children,needs,loading,error,needsWarning,gradeFollowUps=[],gradeFollowUpsWarning,
  courseApprovals=[],courseApprovalsWarning,enrollmentApplications=[],enrollmentWarning,action,student,onRetry}:{
 children:Child[];needs:NeedItem[];loading:boolean;error:string;needsWarning?:string;
 gradeFollowUps?:GradeFollowUp[];gradeFollowUpsWarning?:string;
 courseApprovals?:CourseApproval[];courseApprovalsWarning?:string;
 enrollmentApplications?:EnrollmentApplication[];enrollmentWarning?:string;action?:string;student?:string;onRetry?:()=>void;
}){
 const selectedChild=children.find(child=>child.studentPersonId===student);
 const selectedEnrollment=enrollmentApplications.find(app=>app.studentPersonId===student);
 // Unrecognized child links must not turn an authorized family dashboard into an empty one.
 const activeStudent=student&&(selectedChild||selectedEnrollment)?student:undefined;
 const visibleChildren=activeStudent?(selectedChild?[selectedChild]:[]):children;
 const visibleEnrollmentApplications=enrollmentApplications.filter(app=>
  !children.some(child=>child.studentPersonId===app.studentPersonId)&&
  (!activeStudent||app.studentPersonId===activeStudent)&&
  app.applicationStage!=="declined"&&app.applicationStage!=="withdrawn");
 const childCount=new Set([...visibleChildren.map(child=>child.studentPersonId),
  ...visibleEnrollmentApplications.map(app=>app.studentPersonId)]).size;
 // Site-wide notices remain visible; child-specific tasks follow the picker.
 const visibleNeeds=needs.filter(item=>!activeStudent||!item.studentPersonId||item.studentPersonId===activeStudent);
 const visibleQuestions=gradeFollowUps.filter(question=>!activeStudent||question.studentPersonId===activeStudent);
 const visibleApprovals=courseApprovals.filter(item=>!activeStudent||item.studentPersonId===activeStudent);
 const approvalNeeds=visibleApprovals.map(item=>({
  id:item.id,
  kind:"course_approval",
  type:"course_registration_request",
  title:item.studentName+": approve class addition",
  detail:item.sectionTitle+" · reply before registration closes.",
  href:"/guardian/course-approvals?action="+encodeURIComponent(item.id),
  dueAt:dateTimeInputInTimezone(item.deadline+"T23:59",item.timezone),
  timezone:item.timezone,
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
  href:"/guardian/students?student="+encodeURIComponent(child.studentPersonId)+
   "&section="+encodeURIComponent(work.sectionId)+"&assessment="+encodeURIComponent(work.assessmentId),
  dueAt:work.dueAt,
  timezone:work.timezone,
  priority:work.status==="returned"?"high":"normal",
 })));
 const prioritized=prioritizeFamilyNeeds([...visibleNeeds,...approvalNeeds,...schoolworkItems],Date.now());
 const schoolworkCount=visibleChildren.reduce((total,child)=>total+child.workNeedsAttentionCount,0);
 return <DashboardHome
  eyebrow="Family"
  subtitle="Your children, enrollment steps, and school follow-ups in one place."
  shortcuts={<>
  <DashboardShortcut title="Students" description="Released grades and schoolwork" icon={<BookOpen className="size-5" />}><Link to="/guardian/students" search={{student:selectedChild?.studentPersonId}} /></DashboardShortcut>
   <DashboardShortcut title="Applications & offers" description="Review enrollment next steps" icon={<ClipboardList className="size-5" />}><Link to="/guardian/admission-offers" search={{student:activeStudent}} /></DashboardShortcut>
   <DashboardShortcut title="Community Classes" description="Class applications and guardian consent" icon={<BookOpen className="size-5" />}><Link to="/guardian/native-classes" /></DashboardShortcut>
   <DashboardShortcut title="Calendar" description="Your family's authorized schedule" icon={<CalendarDays className="size-5" />}><Link to="/calendar" /></DashboardShortcut>
   <DashboardShortcut title="Family inbox" description="Conversations with your school" icon={<MessageCircle className="size-5" />}><Link to="/messages" /></DashboardShortcut>
  </>}
  actions={<div className="flex flex-wrap gap-2">
   <Link to="/launch/family" className=" border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
    Start a new school application
   </Link>
   <Link to="/guardian/enrichment" className=" border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
    Summer &amp; enrichment
   </Link>
   <Link to="/messages" className=" border bg-card px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">Family inbox</Link>
  </div>}
 >
  <QueryState loading={loading ? "Loading your family…" : ""} error={error} onRetry={error?onRetry:undefined}>
   <nav aria-label="Family quick links" className="mt-4 flex flex-wrap gap-2">
     <Link to="/guardian/experiences" search={{student:selectedChild?.studentPersonId}} className="border bg-card px-3 py-2 text-sm">School &amp; conferences</Link>
     <Link to="/guardian/attendance" search={{student:selectedChild?.studentPersonId}} className="border bg-card px-3 py-2 text-sm">Attendance</Link>
     <Link to="/guardian/report-cards" search={{student:selectedChild?.studentPersonId}} className="border bg-card px-3 py-2 text-sm">Report cards</Link>
     <Link to="/guardian/field-trips" className="border bg-card px-3 py-2 text-sm">Field trip permissions</Link>
     <Link to="/guardian/attendance" search={{student:selectedChild?.studentPersonId}} hash="pickup" className="border bg-card px-3 py-2 text-sm">Pickup &amp; safety</Link>
     <Link to="/guardian/health" search={{student:selectedChild?.studentPersonId}} className="border bg-card px-3 py-2 text-sm">Health &amp; clearance</Link>
     <Link to="/guardian/enrollment-changes" search={{student:selectedChild?.studentPersonId}} className="border bg-card px-3 py-2 text-sm">Transfer &amp; family changes</Link>
   </nav>
   <GuardianEnrollmentNextSteps applications={visibleEnrollmentApplications}
    enrollmentWarning={enrollmentWarning} activeStudent={activeStudent} />
   {children.length>1&&<nav aria-label="Filter family overview by child" className="mt-6 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show</span><Link to="/home" search={{action,student:undefined}} aria-current={!selectedChild?"page":undefined} className={"inline-flex min-h-11 items-center  border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 "+(!selectedChild?"bg-primary text-primary-foreground":"bg-card")}>All children</Link>{children.map(child=><Link key={child.studentPersonId} to="/home" search={{action,student:child.studentPersonId}} aria-current={selectedChild?.studentPersonId===child.studentPersonId?"page":undefined} className={"inline-flex min-h-11 items-center  border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 "+(selectedChild?.studentPersonId===child.studentPersonId?"bg-primary text-primary-foreground":"bg-card")}>{child.displayName}</Link>)}</nav>}
   {student&&!selectedChild&&!selectedEnrollment&&!loading&&<p role="status" className="mt-4 text-sm text-muted-foreground">That child is not available in this family account. Showing all authorized children.</p>}
   <div className="mt-6 grid gap-3 sm:grid-cols-3">
    <StatCard label={activeStudent?"Selected child":"Your children"} value={childCount}/>
    <StatCard label="Needs your attention" value={needsWarning||courseApprovalsWarning?"Limited":visibleNeeds.length+visibleApprovals.length+schoolworkCount}/>
    <StatCard label="Overdue enrolled-class assignments" value={visibleChildren.reduce((total,child)=>total+child.missingCount,0)}/>
   </div>
   <div className="mt-6">
    {needsWarning && <p role="status" className="mb-3  border p-4 text-sm">{needsWarning}</p>}
    {courseApprovalsWarning && <p role="status" className="mb-3  border p-4 text-sm">{courseApprovalsWarning}</p>}
    <AttentionQueue
     items={buildGuardianAttention(prioritized.filter(item=>!action||item.kind==="action"&&item.id===action))}
     empty={action?"The selected action is not available in your current family workspace.":"You are all caught up. Nothing needs your attention right now."}
    />
    {action&&<Link to="/home" search={{student}} className="mt-4 inline-flex min-h-11 items-center text-sm underline focus-visible:outline-2">{student?"View all needs for this child":"View all family needs"}</Link>}
    {action&&!needsWarning&&!visibleNeeds.some(item=>item.kind==="action"&&item.id===action)&&!loading&&<p role="alert" className="mt-4  border p-4">This action is unavailable in your current family workspace.</p>}
   </div>

   <GuardianGradeQuestions questions={visibleQuestions}
    warning={gradeFollowUpsWarning} selectedStudentId={selectedChild?.studentPersonId} />

   <section aria-label="Your children" className="mt-12">
    <h2 className="font-serif text-2xl font-semibold tracking-tight">Your children</h2>
    {student&&(selectedChild||selectedEnrollment)&&<p className="mt-2 text-sm text-muted-foreground">Showing {selectedChild?.displayName??selectedEnrollment?.studentName}’s family information. <Link to="/home" search={{action,student:undefined}} className="inline-flex min-h-11 items-center font-semibold underline focus-visible:outline-2">Show all children</Link></p>}
    {children.length === 0 && visibleEnrollmentApplications.length===0 && <div className="mt-4  border bg-card p-5">
     <p className="font-semibold">No active enrollments to show yet</p>
     <p className="mt-2 text-sm text-muted-foreground">Children with an application or enrollment step in progress appear below by name and school stage. Once enrollment is active, their school information appears here.</p>
     <Link to="/guardian/admission-offers" search={{student:undefined}}
       className="mt-3 inline-flex min-h-11 items-center  border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
       View applications and enrollment offers →
     </Link>
    </div>}
    
    {visibleEnrollmentApplications.length>0&&<div className="mt-6 space-y-3" aria-label="Admissions and enrollment in progress">
     <h3 className="font-serif text-xl font-semibold">Admissions &amp; enrollment in progress</h3>
     {visibleEnrollmentApplications.map(app=>{
      const activeOffer=app.offers.find(offer=>offer.enrollmentActive);
      const issuedOffer=app.offers.find(offer=>offer.progress.canAccept);
      const acceptedOffer=app.offers.find(offer=>offer.status==="accepted");
      const stage=activeOffer?"Enrollment active":acceptedOffer?"Accepted · enrollment checklist":
       issuedOffer?"Offer ready for response":app.waitlisted?"Waitlisted":
       app.offers.some(offer=>offer.progress.state==="requirements_pending")?"Enrollment requirements pending":
       `Admissions · ${app.applicationStage.replaceAll("_"," ")}`;
      return <article key={app.applicationId} className=" border bg-card p-4">
       <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="font-semibold">{app.studentName}</h3><p className="mt-1 text-sm text-muted-foreground">{app.program}</p></div>
        <StatusBadge tone={activeOffer?"success":app.waitlisted?"attention":issuedOffer?"info":"neutral"}>{stage}</StatusBadge>
       </div>
       {app.blockers.length>0&&<ul className="mt-3 space-y-1 text-sm">
        {app.blockers.map(requirement=><li key={requirement.id}>{requirement.title} · {requirement.status.replaceAll("_"," ")}</li>)}
       </ul>}
       {activeOffer?.progress.message&&<p className="mt-3 text-sm text-muted-foreground">{activeOffer.progress.message}</p>}
       <Link to="/guardian/admission-offers" search={{student:app.studentPersonId,application:app.applicationId}}
        className="mt-3 inline-flex min-h-11 items-center font-semibold underline focus-visible:outline-2">
        Open {app.studentName.split(" ")[0]}'s admissions and enrollment →
       </Link>
      </article>;
     })}
    </div>}
    {children.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2">
     {visibleChildren.map(child => <GuardianChildSummaryCard key={child.studentProfileId} child={child} />)
    </div>}
   </section>

   <section aria-label="Family shortcuts" className="mt-12">
    <h2 className="font-serif text-2xl font-semibold tracking-tight">Family resources</h2>
    <div className="mt-4 flex flex-wrap gap-3 text-sm">
     <Link to="/ask" className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">Ask CAN</Link>
     <Link to="/guardian/experiences" className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">School calendar &amp; teacher conferences</Link>
     <Link to="/guardian/group-permissions" className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">Study group permissions</Link>
     <Link to="/guardian/watching" className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">Things CAN Is Watching</Link>
     <Link to="/guardian/admission-offers" search={{student:undefined}} className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">Admission offers</Link>
     <Link to="/guardian/course-approvals" className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">Course approvals</Link>
     <Link to="/admissions/my-credentials" className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">Official records and credentials</Link>
     <Link to="/messages" className="inline-flex min-h-11 items-center  border px-4 py-2 hover:bg-muted focus-visible:outline-2">Messages</Link>
    </div>
   </section>
  </QueryState>
 </DashboardHome>;
}
