import { Link } from "@tanstack/react-router";
import type { FirstClassroom } from "@/domain/first-classroom";

/** Links stay inside the same authorized Section used by Teacher Today. */
export function TeacherFirstWeekCard({ id, title, studentCount, classroom }: {
  id: string;
  title: string;
  studentCount: number;
  classroom: FirstClassroom;
}) {
  return <article className="rounded-xl border bg-card p-5">
    <h2 className="font-semibold"><Link to="/classes" search={{ section: id }} className="hover:underline">{title}</Link></h2>
    <Link to="/teacher/gradebook" search={{ section: id }} className="mt-2 inline-block text-sm underline">Class gradebook</Link>
    <p className="mt-1 text-sm text-muted-foreground">{studentCount} enrolled {studentCount === 1 ? "student" : "students"}</p>
    <section className="mt-4 rounded-lg border p-3" aria-label={"First week in " + title}>
      <h3 className="text-sm font-semibold">First week: {classroom.ready ? "ready to teach" : "needs attention"}</h3>
      {classroom.ready ? <p className="mt-1 text-sm">Teach “{classroom.firstWeek.lesson!.title}” and review “{classroom.firstWeek.assessment!.title}”.</p> :
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs">{classroom.blockers.map(item => <li key={item.key}>{item.message}</li>)}</ul>}
      <div className="mt-3 flex flex-wrap gap-3 text-sm">
        {classroom.firstWeek.lesson && <Link to="/classes" search={{ section: id, tab: "lessons", lesson: classroom.firstWeek.lesson.id }} className="underline">Open first lesson</Link>}
        {classroom.firstWeek.assessment ? <Link to="/teacher/gradebook" search={{ section: id, assessment: classroom.firstWeek.assessment.id }} className="underline">Open first assessment</Link> :
          classroom.firstWeek.lesson && <Link to="/teacher/gradebook" search={{ section: id, lesson: classroom.firstWeek.lesson.id, kind: "classwork" }} className="underline">Create first assessment</Link>}
        <Link to="/classes" search={{ section: id, tab: "people" }} className="underline">Review class roster</Link>
      </div>
    </section>
  </article>;
}
