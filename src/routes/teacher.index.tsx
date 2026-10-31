import { TeacherGradeResponsesPanel, type TeacherGradeResponseItem } from "@/components/learning/TeacherGradeResponsesPanel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, ClipboardCheck, GraduationCap } from "lucide-react";
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
   <section aria-label="Teaching workspace" className="relative mt-3 overflow-hidden rounded-3xl border border-border/70 bg-card px-6 py-8 shadow-sm sm:px-9 sm:py-10">
    <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-accent opacity-75 blur-3xl" />
    <div className="relative max-w-2xl">
     <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary"><GraduationCap className="size-4" /> Your teaching day</p>
     <h2 className="mt-3 font-serif text-3xl leading-tight tracking-tight sm:text-4xl">Make room for great teaching.</h2>
     <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">Your classes, student work, and follow-ups are ready when you are.</p>
     <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
      <Link to="/classes" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"><BookOpen className="size-4" /> My classes <ArrowUpRight className="size-4" /></Link>
      <Link to="/teacher/gradebook" className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-background px-4 py-2 hover:bg-muted"><ClipboardCheck className="size-4" /> Gradebook</Link>
     </div>
    </div>
   </section>
   {data && !data.connected && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">Neon is not connected. Today's snapshot cannot load.</p>}

   {ready && <>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Today summary">
     <Link to="/classes"><StatCard label="Sections" value={data.sections.length} /></Link>
     <Link to="/teacher/gradebook"><StatCard label="Needs grading" value={data.ungraded.length} /></Link>
     <Link to="/teacher/missing-work"><StatCard label="Missing work" value={data.missingWork.length} /></Link>
     <a href="#grade-follow-ups"><StatCard label="Guardian questions" value={gradeQuestions===null?"…":gradeQuestions.filter(item=>item.status!=="resolved" && item.status!=="cancelled").length} /></a>
    </div>

    <TeacherDaySchedule sections={data.sections} />

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
