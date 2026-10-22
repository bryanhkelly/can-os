import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTeacherToday } from "@/modules/learning/teacher-today.functions";
import { getTeacherLearningEvidence } from "@/modules/learning/teacher-learning-evidence.functions";
import { TeacherLearningFollowUpForm } from "@/components/learning/TeacherLearningFollowUpForm";
import { WorkspaceShell, StatCard, EmptyState, QueryState } from "@/components/workspace";

export const Route = createFileRoute("/teacher/")({ component: TeacherTodayPage });

type Today = Awaited<ReturnType<typeof getTeacherToday>>;
type Evidence = Awaited<ReturnType<typeof getTeacherLearningEvidence>>;

function greeting() {
 const hour = new Date().getHours();
 return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function TeacherTodayPage() {
 const [data, setData] = useState<Today | null>(null);
 const [activity, setActivity] = useState<Evidence | null>(null);
 const [activityError, setActivityError] = useState("");
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
   {data && !data.connected && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">Neon is not connected. Today's snapshot cannot load.</p>}

   {ready && <>
    <div className="mt-8 grid grid-cols-3 gap-3" aria-label="Today summary">
     <Link to="/classes"><StatCard label="Sections" value={data.sections.length} /></Link>
     <Link to="/teacher/gradebook"><StatCard label="Needs grading" value={data.ungraded.length} /></Link>
     <Link to="/teacher/missing-work"><StatCard label="Missing work" value={data.missingWork.length} /></Link>
    </div>

    <section className="mt-10">
     <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">My sections</p>
     {data.sections.length === 0 && <EmptyState className="mt-4" title="No sections are assigned to you yet." />}
     <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {data.sections.map(section => <article key={section.id} className="rounded-xl border bg-card p-5">
       <h2 className="font-semibold"><Link to="/classes" search={{section:section.id}} className="hover:underline">{section.title}</Link></h2>
       <Link to="/teacher/gradebook" search={{section:section.id}} className="mt-2 inline-block text-sm underline">Class gradebook</Link>
       <p className="mt-1 text-sm text-muted-foreground">{section.studentCount} enrolled {section.studentCount === 1 ? "student" : "students"}</p>
      </article>)}
     </div>
    </section>

    <section className="mt-10">
     <div className="flex flex-wrap items-baseline justify-between gap-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Needs grading</p>
      <Link to="/teacher/gradebook" className="text-xs font-semibold underline">Open gradebook →</Link>
     </div>
     {data.ungraded.length === 0 && <EmptyState className="mt-4" title="Nothing waiting for a grade. Nice work." />}
     <div className="mt-4 grid gap-3">
      {data.ungraded.map(item => <article key={`${item.assessmentId}:${item.studentProfileId}`} className="rounded-xl border bg-card p-5">
       <p className="text-xs text-muted-foreground">{item.sectionTitle} · submitted {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "recently"}</p>
       <h2 className="mt-2 font-semibold"><Link to="/teacher/gradebook" search={{section:item.sectionId,assessment:item.assessmentId,student:item.studentProfileId}} className="hover:underline">{item.assessmentTitle}</Link></h2>
       <p className="mt-1 text-sm">{item.studentName}</p>
      </article>)}
     </div>
    </section>

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

    <section className="mt-10">
     <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Missing work</p>
     {data.missingWork.length === 0 && <EmptyState className="mt-4" title="No overdue missing work in your sections." />}
     <div className="mt-4 grid gap-3">
      {data.missingWork.map(item => <article key={`${item.assessmentId}:${item.studentProfileId}`} className="rounded-xl border bg-card p-5">
       <p className="text-xs text-muted-foreground">{item.sectionTitle} · due {new Date(item.dueAt).toLocaleDateString()}</p>
       <h2 className="mt-2 font-semibold"><Link to="/teacher/gradebook" search={{section:item.sectionId,assessment:item.assessmentId,student:item.studentProfileId}} className="hover:underline">{item.assessmentTitle}</Link></h2>
       <p className="mt-1 text-sm">{item.studentName} · no submission recorded</p>
      </article>)}
     </div>
    </section>

    <section className="mt-10">
     <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notices</p>
     {data.notices.length === 0 && <EmptyState className="mt-4" title="No recent notices." />}
     <div className="mt-4 grid gap-3">
      {data.notices.map(notice => <article key={notice.id} className="rounded-xl border bg-card p-5">
       <p className="text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleDateString()}{notice.status === "unread" ? " · unread" : ""}</p>
       <h2 className="mt-2 font-semibold"><Link to="/notifications" search={{notification:notice.id}} className="hover:underline">{notice.title}</Link></h2>
       {notice.body && <p className="mt-1 text-sm text-muted-foreground">{notice.body}</p>}
      </article>)}
     </div>
    </section>
   </>}
  </QueryState>
 </WorkspaceShell>;
}
