import { DashboardHome } from "@/components/workspace/dashboard-home";
import { TeacherGradeResponsesPanel, type TeacherGradeResponseItem } from "@/components/learning/TeacherGradeResponsesPanel";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BookOpen, ClipboardList, CalendarDays, MessageCircle, School, Users } from "lucide-react";
import { getTeacherToday } from "@/modules/learning/teacher-today.functions";
import { getTeacherLearningEvidence } from "@/modules/learning/teacher-learning-evidence.functions";
import { TeacherLearningParticipationPanel } from "@/components/teacher/TeacherLearningParticipationPanel";
import { TeacherNextActionPanel } from "@/components/teacher/TeacherNextActionPanel";
import { TeacherLearningFollowUpsPanel } from "@/components/learning/TeacherLearningFollowUpsPanel";
import { TeacherConferencePanel } from "@/components/teacher/TeacherConferencePanel";
import { TeacherFirstWeekCard } from "@/components/teacher/TeacherFirstWeekCard";
import { TeacherDaySchedule } from "@/components/teacher/TeacherDaySchedule";
import { StatCard, EmptyState } from "@/components/workspace";
import { DashboardShortcut } from "@/components/workspace/dashboard-layout";
import { AttentionQueue } from "@/components/operations/AttentionQueue";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { buildTeacherAttention } from "@/domain/daily-operations";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const loadTeacherHome = safeLoader(() => getTeacherToday(), {
 authMessage: "Sign in with an authorized teacher account to view your day.",
});

type Today = Awaited<ReturnType<typeof getTeacherToday>>;
type Evidence = Awaited<ReturnType<typeof getTeacherLearningEvidence>>;

export function TeacherHome({ outcome, gradeAction }: {
 outcome: Awaited<ReturnType<typeof loadTeacherHome>>; gradeAction?: string;
}) {
 if (!outcome.ok) return <LoaderFailure eyebrow="Teacher" title="Teacher Today" outcome={outcome} />;
 return <TeacherTodayView data={outcome.data} gradeAction={gradeAction} />;
}

function TeacherTodayView({ data, gradeAction }: { data: Today; gradeAction?: string }) {
 const [activity, setActivity] = useState<Evidence | null>(null);
 const [activityError, setActivityError] = useState("");
 const [gradeQuestions, setGradeQuestions] = useState<TeacherGradeResponseItem[] | null>(null);
 const [followUpRevision, setFollowUpRevision] = useState(0);
 const onQuestionsChange = useCallback((items: TeacherGradeResponseItem[] | null) => {
  setGradeQuestions(items);
 }, []);

 useEffect(() => {
  let active = true;
  void getTeacherLearningEvidence().then(result => {
   if (active) setActivity(result);
  }).catch(() => {
   if (active) setActivityError("Learning evidence is unavailable.");
  });
  return () => { active = false; };
 }, []);

 const ready = data.connected;
 const nextUngraded = data.ungraded[0];
 const { session } = useWorkspaceSession();
 const school = session?.authenticated && session.sites.length === 1 ? session.sites[0] : undefined;

 return <DashboardHome
  eyebrow="Your teaching day"
  firstName={ready ? data.teacher.firstName : null}
  subtitle="Your sections, grading queue, and missing work across your school today."
  shortcuts={<>
    <DashboardShortcut title="My classes" description="Open your assigned sections" icon={<BookOpen className="size-5" />}>
     <Link to="/class" />
    </DashboardShortcut>
    <DashboardShortcut title="Study groups" description="Facilitate sessions and group discussion" icon={<Users className="size-5" />}>
     <Link to="/groups" />
    </DashboardShortcut>
    <DashboardShortcut title="Class discussions" description="Respond to students and moderate class discussions" icon={<MessageCircle className="size-5" />}>
     <Link to="/teacher/discussions" />
    </DashboardShortcut>
    <DashboardShortcut title="Gradebook" description={ready ? `${data.ungradedCount} submitted items to review` : "Review student work"} icon={<ClipboardList className="size-5" />}>
     <Link to="/teacher/gradebook" />
    </DashboardShortcut>
    <DashboardShortcut title="Messages" description="Review class and family conversations" icon={<MessageCircle className="size-5" />}>
     <Link to="/messages" />
    </DashboardShortcut>
    <DashboardShortcut title="Schedule" description="See today's classes and school events" icon={<CalendarDays className="size-5" />}>
     <Link to="/calendar" search={{ view: "agenda" }} />
    </DashboardShortcut>
    {school && <DashboardShortcut title="School profile" description={school.name} icon={<School className="size-5" />}>
     <Link to="/sites/$siteId/profile" params={{ siteId: school.id }} />
    </DashboardShortcut>}
   </>}
  rail={ready ? <TeacherDaySchedule sections={data.sections} /> : undefined}
  actions={<><Link to="/teacher/missing-work">Missing-work follow-up →</Link><Link to="/student/support">Student support →</Link><Link to="/profiles">Professional profile →</Link></>}
 >
   {!data.connected && <p className="mt-8 border p-4 text-sm" role="status">Neon is not connected. Today's snapshot cannot load.</p>}

   {ready && <>
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Today summary">
     <StatCard asChild label="Sections" value={data.sections.length}><Link to="/class" /></StatCard>
     <StatCard asChild label="Needs grading" value={data.ungradedCount}><Link to="/teacher/gradebook" /></StatCard>
     <StatCard asChild label="Missing work" value={data.missingWorkCount}><Link to="/teacher/missing-work" /></StatCard>
     <StatCard asChild label="Guardian questions" value={gradeQuestions===null?"…":gradeQuestions.filter(item=>item.status!=="resolved" && item.status!=="cancelled").length}><a href="#grade-follow-ups" /></StatCard>
    </div>

    <TeacherNextActionPanel ungradedCount={data.ungradedCount} missingWorkCount={data.missingWorkCount}
      nextUngraded={nextUngraded} />

    <section className="mt-10">
     <p className="text-xs font-bold uppercase tracking-eyebrow text-muted-foreground">My sections</p>
     {data.sections.length === 0 && <EmptyState className="mt-4" title="No currently authorized teaching sections." description="A named delegation, Section assignment, required qualification or school agreement may be missing, revoked or expired. Contact your school administrator. Historical grades and issued transcripts are unchanged." />}
     <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {data.sections.map(section => <TeacherFirstWeekCard key={section.id} id={section.id}
       title={section.title} studentCount={section.studentCount} classroom={section.classroom}/>)}
     </div>
    </section>

    <AttentionQueue items={buildTeacherAttention({...data,guardianQuestions:gradeQuestions??[]})}
      empty="No grading, missing-work follow-up or assigned notices need your attention."/>

    <TeacherGradeResponsesPanel selectedAction={gradeAction} onQuestionsChange={onQuestionsChange}/>

    <TeacherLearningParticipationPanel activity={activity} error={activityError}
      onCreated={() => setFollowUpRevision(value => value + 1)} />

    <TeacherLearningFollowUpsPanel revision={followUpRevision} />
    <TeacherConferencePanel />
   </>}
 </DashboardHome>;
}
