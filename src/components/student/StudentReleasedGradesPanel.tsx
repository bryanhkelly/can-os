import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import type { StudentDashboardData } from "./student-dashboard-data";

/** Only school-released grades; no local calculation or inferred achievement. */
export function StudentReleasedGradesPanel({
  state,
}: {
  state?: StudentDashboardData["grades"];
}) {
  const unavailable = Boolean(state && !state.ok);
  const grades = state?.ok ? state.data : [];
  const textLink = "student-dashboard-link";
  return <DashboardPanel id="student-grades" title="My Grades"
          action={<Link to="/student/report-card" className={textLink}>View all →</Link>}>
          {unavailable ? <p role="alert" className="text-xs">Released grades could not be loaded. <Link to="/student/report-card" className="underline">Open report card to retry.</Link></p>
            : grades.length ? <div className="divide-y">{grades.slice(0,4).map(grade => <div key={grade.sectionGradeId} className="student-grade-row">
              <BookOpen aria-hidden="true" className="size-4 text-muted-foreground" /><div className="min-w-0"><p className="text-xs">{grade.sectionTitle}</p>
                <p className="mt-1 text-3xs text-muted-foreground">{grade.schoolYearName} · {grade.gradingPeriodName}</p></div>
              <b className="text-lg">{grade.letterGrade ?? (grade.percentage !== null ? `${grade.percentage}%` : "—")}</b><small className="text-3xs text-muted-foreground">Released grade</small>
            </div>)}</div> : <p role="status" className="text-xs text-muted-foreground">No finalized grades yet. Released grades appear here after school review.</p>}
        </DashboardPanel>;
}
