import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getTeacherToday } from "@/modules/student-experience/teacher-today.functions";

export const Route = createFileRoute("/teacher/")({ component: TeacherTodayPage });

type Today = Awaited<ReturnType<typeof getTeacherToday>>;

function greeting() {
 const hour = new Date().getHours();
 return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function TeacherTodayPage() {
 const [data, setData] = useState<Today | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");

 useEffect(() => {
  let active = true;
  getTeacherToday().then(result => {
   if (active) { setData(result); setLoading(false); }
  }).catch(() => {
   if (active) { setError("Sign in with an authorized teacher account to view your day."); setLoading(false); }
  });
  return () => { active = false; };
 }, []);

 const ready = data && data.connected && !error;

 return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
  <div className="mx-auto max-w-5xl">
   <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Teacher</p>
   <h1 className="mt-2 font-serif text-4xl">{greeting()}{ready && data.teacher.firstName ? `, ${data.teacher.firstName}` : ""}</h1>
   <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Your sections, grading queue, and missing work across your school today.</p>

   {loading && <p className="mt-8 text-sm" role="status">Loading your day…</p>}
   {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
   {!loading && !error && data && !data.connected && <p className="mt-8 rounded-lg border p-4 text-sm" role="status">Neon is not connected. Today's snapshot cannot load.</p>}

   {ready && <div className="mt-8 grid grid-cols-3 gap-3" aria-label="Today summary">
    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Sections</p><p className="mt-1 text-2xl font-semibold">{data.sections.length}</p></div>
    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Needs grading</p><p className="mt-1 text-2xl font-semibold">{data.ungraded.length}</p></div>
    <div className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Missing work</p><p className="mt-1 text-2xl font-semibold">{data.missingWork.length}</p></div>
   </div>}

   {ready && <section className="mt-10">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">My sections</p>
    {data.sections.length === 0 && <p className="mt-4 rounded-xl border p-5 text-sm text-muted-foreground">No sections are assigned to you yet.</p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
     {data.sections.map(section => <article key={section.id} className="rounded-xl border bg-card p-5">
      <h2 className="font-semibold">{section.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{section.studentCount} enrolled {section.studentCount === 1 ? "student" : "students"}</p>
     </article>)}
    </div>
   </section>}

   {ready && <section className="mt-10">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
     <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Needs grading</p>
     <Link to="/teacher/missing-work" className="text-xs font-semibold underline">Open missing-work queue →</Link>
    </div>
    {data.ungraded.length === 0 && <p className="mt-4 rounded-xl border p-5 text-sm text-muted-foreground">Nothing waiting for a grade. Nice work.</p>}
    <div className="mt-4 grid gap-3">
     {data.ungraded.map(item => <article key={`${item.assessmentId}:${item.studentProfileId}`} className="rounded-xl border bg-card p-5">
      <p className="text-xs text-muted-foreground">{item.sectionTitle} · submitted {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "recently"}</p>
      <h2 className="mt-2 font-semibold">{item.assessmentTitle}</h2>
      <p className="mt-1 text-sm">{item.studentName}</p>
     </article>)}
    </div>
   </section>}

   {ready && <section className="mt-10">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Missing work</p>
    {data.missingWork.length === 0 && <p className="mt-4 rounded-xl border p-5 text-sm text-muted-foreground">No overdue missing work in your sections.</p>}
    <div className="mt-4 grid gap-3">
     {data.missingWork.map(item => <article key={`${item.assessmentId}:${item.studentProfileId}`} className="rounded-xl border bg-card p-5">
      <p className="text-xs text-muted-foreground">{item.sectionTitle} · due {new Date(item.dueAt).toLocaleDateString()}</p>
      <h2 className="mt-2 font-semibold">{item.assessmentTitle}</h2>
      <p className="mt-1 text-sm">{item.studentName} · no submission recorded</p>
     </article>)}
    </div>
   </section>}

   {ready && <section className="mt-10">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notices</p>
    {data.notices.length === 0 && <p className="mt-4 rounded-xl border p-5 text-sm text-muted-foreground">No recent notices.</p>}
    <div className="mt-4 grid gap-3">
     {data.notices.map(notice => <article key={notice.id} className="rounded-xl border bg-card p-5">
      <p className="text-xs text-muted-foreground">{new Date(notice.createdAt).toLocaleDateString()}{notice.status === "unread" ? " · unread" : ""}</p>
      <h2 className="mt-2 font-semibold">{notice.title}</h2>
      {notice.body && <p className="mt-1 text-sm text-muted-foreground">{notice.body}</p>}
     </article>)}
    </div>
   </section>}
  </div>
 </main>;
}
