import { Link } from "@tanstack/react-router";
import { StatusBadge } from "@/components/workspace";
import { schoolYearCounts, schoolYearStatus, type SchoolYear } from "@/components/operations/SchoolYearRecord";
import { plural } from "@/lib/format";
import { secondaryActionClassName } from "@/components/workspace/create-action";

/** Bounded list summary; terms, calendar and schedule editing live on the school-year record. */
export function SchoolYearCard({ year, siteName, scope }: { year: SchoolYear; siteName?: string; scope: { siteId?: string; programId?: string } }) {
  const counts = schoolYearCounts(year);
  const status = schoolYearStatus(year.status);
  return <article id={`school-year-${year.id}`} aria-labelledby={`school-year-${year.id}-name`}
    className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-3">
        <h3 id={`school-year-${year.id}-name`} className="text-lg font-semibold">
          <Link to="/operations/school-years/$yearId" params={{ yearId: year.id }} search={scope} className="hover:underline">{year.name}</Link>
        </h3>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{siteName ? `${siteName} · ` : ""}{year.startsOn} to {year.endsOn}</p>
      <p className="mt-2 text-sm">{plural(counts.terms, "term")} · {plural(counts.gradingPeriods, "grading period")} · {plural(counts.instructionalDays, "instructional day")} · {plural(counts.schedules, "schedule")}</p>
    </div>
    <Link to="/operations/school-years/$yearId" params={{ yearId: year.id }} search={scope} className={secondaryActionClassName}
      aria-label={`Open ${year.name}`}>Open</Link>
  </article>;
}