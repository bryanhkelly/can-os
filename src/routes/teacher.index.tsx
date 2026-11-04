import { DailyCanvas } from "@/components/student/DailyCanvas";
import { resolveEditorialCanvas } from "@/domain/editorial-campaigns";
import { TeacherGradeResponsesPanel, type TeacherGradeResponseItem } from "@/components/learning/TeacherGradeResponsesPanel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { getTeacherToday } from "@/modules/learning/teacher-today.functions";
import { getTeacherLearningEvidence } from "@/modules/learning/teacher-learning-evidence.functions";
import { TeacherLearningFollowUpForm } from "@/components/learning/TeacherLearningFollowUpForm";
import { TeacherLearningFollowUpsPanel } from "@/components/learning/TeacherLearningFollowUpsPanel";
import { TeacherConferencePanel } from "@/components/teacher/TeacherConferencePanel";
import { TeacherFirstWeekCard } from "@/components/teacher/TeacherFirstWeekCard";
import { TeacherDaySchedule } from "@/components/teacher/TeacherDaySchedule";
import { WorkspaceShell, StatCard, EmptyState, QueryState } from "@/components/workspace";
import { AttentionQueue } from "@/components/operations/AttentionQueue";
import { buildTeacherAttention } from "@/domain/daily-operations";

export const Route = createFileRoute("/teacher/")({
 validateSearch:(search:Record<string,unknown>)=>({
  gradeAction:typeof search.gradeAction==="string"?search.gradeAction:undefined,
 }),
 component: TeacherTodayPage,
});

type Today = Awaited<ReturnType<typeof getTeacherToday>>;
type Evidence = Awaited<ReturnType<typeof getTeacherLearningEvidence>>;

function greeting() {
 const hour = new Date().getHours();
 return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function TeacherTodayPage() {
 const {gradeAction}=Route.useSearch();
 const [data, setData] = useState<Today | null>(null);
 const [activity, setActivity] = useState<Evidence | null>(null);
 const [activityError, setActivityError] = useState("");
 const [gradeQuestions, setGradeQuestions] = useState<TeacherGradeResponseItem[] | null>(null);
 const onQuestionsChange = useCallback((items: TeacherGradeResponseItem[] | null) => {
  setGradeQuestions(items);
 }, []);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");

 useEffect(() => {
  let active = true;
  getTeacherToday().then(result => {
   if (active) { setData(result); setLoading(false); }
  }).catch(() => {
   if (active) { setError("Sign in with an authorized teacher account to view your day."); setLoading(false); }
  });
  void getTeacherLearningEvidence().then(result => {
   if (active) setActivity(result);
  }).catch(() => {
   if (active) setActivityError("Learning evidence is unavailable.");
  });
  return () => { active = false; };
 }, []);

 const ready = data && data.connected && !error;

 return <WorkspaceShell
  eyebrow="CAN OS · Teacher"
  title={<>{greeting()}{ready && data.teacher.firstName ? `, ${data.teacher.firstName}` : ""}</>}
  subtitle="Your sections, grading queue, and missing work across your school today."
 >
  <QueryState loading={loading ? "Loading your day…" : ""} error={error}>
   <DailyCanvas audience="teacher" content={resolveEditorialCanvas("teacher", new Date())}
     primaryAction={<Link to="/classes" className="inline-flex min-h-11 items-center gap-2 border border-white bg-white px-4 py-2 text-sm font-semibold !text-slate-900">My classes <ArrowUpRight className="size-4" /></Link>}
     secondaryAction={<Link to="/teacher/gradebook" className="inline-flex min-h-11 items-center gap-2 border border-white/70 px-4 py-2 text-sm font-semibold text-white">Gradebook</Link>}
    />
   {data && !data.connected && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">Neon is not connected. Today's snapshot cannot load.</p>}

   {ready && <>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Today summary">
     <StatCard asChild label="Sections" value={data.sections.length}><Link to="/classes" /></StatCard>
     <StatCard asChild label="Needs grading" value={data.ungraded.length}><Link to="/teacher/gradebook" /></StatCard>
     <StatCard asChild label="Missing work" value={data.missingWork.length}><Link to="/teacher/missing-work" /></StatCard>
     <StatCard asChild label="Guardian questions" value={gradeQuestions===null?"…":gradeQuestions.filter(item=>item.status!=="resolved" && item.status!=="cancelled").length}><a href="#grade-follow-ups" /></StatCard>
    </div>

    <TeacherDaySchedule sections={data.sections} />
    <section className="mt-7 rounded-2xl border border-border/70 bg-card p-5 shadow-sm" aria-label="Teaching next actions">
      <h2 className="font-serif text-2xl font-semibold">What needs you next</h2>
      {data.ungraded.length>0 ? <div className="mt-3">
        <p className="font-semibold">{data.ungraded.length} submitted work item{data.ungraded.length===1?"":"s"} to review</p>
        <p className="mt-1 text-sm text-muted-foreground">Start with a submission from your current assigned sections.</p>
        <Link to="/teacher/gradebook" search={{section:data.ungraded[0]!.sectionId,assessment:data.ungraded[0]!.assessmentId}}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Grade next submission <ArrowUpRight className="ml-2 size-4"/></Link>
      </div> : data.missingWork.length>0 ? <div className="mt-3">
        <p className="font-semibold">{data.missingWork.length} missing-work follow-up{data.missingWork.length===1?"":"s"}</p>
        <p className="mt-1 text-sm text-muted-foreground">Review missing work and follow up with students through the existing teacher workflow.</p>
        <Link to="/teacher/missing-work" className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Review missing work <ArrowUpRight className="ml-2 size-4"/></Link>
      </div> : <div className="mt-3">
        <p className="text-sm text-muted-foreground">No grading or missing-work items in the current snapshot. Review your schedule and prepare your next class.</p>
        <Link to="/classes" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Open my classes →</Link>
      </div>}
    </section>


    <section className="mt-10">
     <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">My sections</p>
     {data.sections.length === 0 && <EmptyState className="mt-4" title="No currently authorized teaching sections." description="A named delegation, Section assignment, required qualification or school agreement may be missing, revoked or expired. Contact your school administrator. Historical grades and issued transcripts are unchanged." />}
     <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {data.sections.map(section => <TeacherFirstWeekCard key={section.id} id={section.id}
       title={section.title} studentCount={section.studentCount} classroom={section.classroom}/>)}
     </div>
    </section>

    <AttentionQueue items={buildTeacherAttention({...data,guardianQuestions:gradeQuestions??[]})}
      empty="No grading, missing-work follow-up or assigned notices need your attention."/>

    <TeacherGradeResponsesPanel selectedAction={gradeAction} onQuestionsChange={onQuestionsChange}/>

    <section className="mt-10" aria-label="Observed learning participation">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Learning participation</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Verified CAN OS interaction evidence from your assigned sections, not attendance, grades or a diagnosis of disengagement.
        Uninstrumented and offline learning may not appear.
      </p>
      {activityError && <p role="status" className="mt-3 text-sm">{activityError}</p>}
      {!activity && !activityError && <p role="status" className="mt-3 text-sm">Loading observed activity…</p>}
      {activity && <>
        <p className="mt-2 text-xs text-muted-foreground">{activity.note}</p>
        {activity.truncated && <p className="mt-2 text-xs">Large roster: showing a limited evidence sample.</p>}
        <div className="mt-4 grid gap-3">
          {activity.students.filter(student => student.observedEvents7d > 0).slice(0, 12).map(student =>
            <article key={student.sectionId + ":" + student.studentProfileId} className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">{student.sectionTitle}</p>
              <Link to="/staff/students/$personId" params={{ personId: student.studentPersonId }} className="mt-1 block font-semibold underline">{student.studentName}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{student.observedEvents7d} recorded interactions in 7 days
                · latest {student.latestObservedAt ? new Date(student.latestObservedAt).toLocaleString() : "not recorded"}
                · up to {Math.round(student.estimatedActiveMs7d / 60_000)} min estimated active time</p>
              {student.latestEventId && <TeacherLearningFollowUpForm
                sectionId={student.sectionId} studentProfileId={student.studentProfileId}
                learningEventId={student.latestEventId} />}
            </article>)}
          {!activity.students.some(student => student.observedEvents7d > 0) &&
            <p className="text-sm">No interaction evidence has been collected for these classes yet. This does not mean students have not been learning.</p>}
        </div>
        <p className="mt-3 text-sm">Use existing <Link to="/teacher/missing-work" className="underline">missing-work follow-up</Link> and authorized support referrals for human-reviewed interventions.</p>
      </>}
    </section>

    <TeacherLearningFollowUpsPanel />

    <TeacherConferencePanel />

   </>}
  </QueryState>
 </WorkspaceShell>;
}
