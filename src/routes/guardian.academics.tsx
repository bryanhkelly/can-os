import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getGuardianAssignments, getGuardianStudents } from "@/modules/student-experience/guardian-assignments.functions";

export const Route = createFileRoute("/guardian/academics")({ component: GuardianAcademicsPage });

type Student = { studentPersonId: string; firstName: string; lastName: string };
type Assignment = Awaited<ReturnType<typeof getGuardianAssignments>>["assignments"][number];

function GuardianAcademicsPage() {
 const [students, setStudents] = useState<Student[]>([]);
 const [selected, setSelected] = useState("");
 const [assignments, setAssignments] = useState<Assignment[]>([]);
 const [loading, setLoading] = useState(true);
 const [loadingStudents, setLoadingStudents] = useState(true);
 const [error, setError] = useState("");

 useEffect(() => {
  let active = true;
  getGuardianStudents().then(result => {
   if (!active) return;
   setStudents(result.students);
   setSelected(result.students[0]?.studentPersonId ?? "");
   setLoadingStudents(false);
  }).catch(() => {
   if (active) { setError("Sign in with an authorized guardian account to view academic progress."); setLoadingStudents(false); setLoading(false); }
  });
  return () => { active = false; };
 }, []);

 useEffect(() => {
  if (!selected) { setAssignments([]); setLoading(false); return; }
  let active = true;
  setLoading(true);
  setError("");
  getGuardianAssignments({ data: { studentPersonId: selected } }).then(result => {
   if (active) { setAssignments(result.assignments); setLoading(false); }
  }).catch(() => {
   if (active) { setAssignments([]); setError("Unable to load academic progress for this student."); setLoading(false); }
  });
  return () => { active = false; };
 }, [selected]);

 return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
  <div className="mx-auto max-w-5xl">
   <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Guardian</p>
   <h1 className="mt-2 font-serif text-4xl">Academic progress</h1>
   <p className="mt-3 max-w-2xl text-sm text-muted-foreground">Review assignments and released teacher feedback for students connected to your account.</p>
   {students.length > 0 && <label className="mt-8 block max-w-sm text-sm font-semibold">
    Student
    <select className="mt-2 w-full rounded-lg border bg-background p-3" value={selected} onChange={event => setSelected(event.target.value)}>
     {students.map(student => <option key={student.studentPersonId} value={student.studentPersonId}>{student.firstName} {student.lastName}</option>)}
    </select>
   </label>}
   {(loading || loadingStudents) && <p className="mt-8 text-sm" role="status">Loading academic progress…</p>}
   {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
   {!loading && !loadingStudents && !error && students.length === 0 && <p className="mt-8 text-sm">No students with academic-viewing permission were found at your school.</p>}
   {!loading && !loadingStudents && !error && students.length > 0 && assignments.length === 0 && <p className="mt-8 text-sm">No published assignments found.</p>}
   {!loading && !loadingStudents && !error && assignments.length > 0 && <div className="mt-8 grid gap-4">
    {assignments.map(item => <section key={item.assessmentId} className="rounded-xl border bg-card p-5">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs text-muted-foreground">{item.course}</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2></div>
      <span className="rounded-full border px-3 py-1 text-xs capitalize">{item.status.replaceAll("_"," ")}</span>
     </div>
     <p className="mt-3 text-sm text-muted-foreground">Due: {item.dueAt ? new Date(item.dueAt).toLocaleDateString() : "Not set"}</p>
     {item.score !== null && <p className="mt-2 text-sm font-semibold">Grade: {item.score} / {item.pointsPossible}</p>}
     {item.feedback && <p className="mt-3 rounded-lg bg-muted p-3 text-sm">Teacher feedback: {item.feedback}</p>}
    </section>)}
   </div>}
  </div>
 </main>;
}
