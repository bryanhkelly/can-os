import { Link } from "@tanstack/react-router";
import type { ExpectedAttendanceSummary } from "@/domain/expected-attendance";

type Configuration = ExpectedAttendanceSummary["configuration"];
const nextSteps: Record<Exclude<Configuration, "configured" | "not_onsite">, string> = {
  no_active_year: "The school registrar must create or activate the school year covering this date.",
  missing_calendar: "The school registrar must configure the academic calendar and explicitly classify this date as instructional or non-instructional.",
  partial_calendar: "The school registrar must classify the missing academic calendar dates as instructional or non-instructional.",
  missing_schedule: "The school registrar must configure an effective onsite instructional schedule for this date.",
  onsite_pattern_mismatch: "The school registrar must reconcile the onsite schedule with the Program's delivery pattern.",
  no_active_enrollments: "The school registrar must review active Program enrollments for this school year. Creating a calendar does not enroll students.",
};

export function AttendanceConfigurationNotice({ programs, canConfigure, date }: {
  programs: readonly {
    id: string; siteId: string; name: string; configuration: Configuration; missingCalendarDates: number;
  }[];
  canConfigure: boolean;
  date: string;
}) {
  const incomplete = programs.filter(program =>
    program.configuration !== "configured" && program.configuration !== "not_onsite");
  if (!incomplete.length) return null;
  return <section role="status" aria-label="Attendance setup next steps" className="mt-4 rounded-xl border border-warning p-4 text-sm">
    <h2 className="font-semibold">Attendance setup needs attention for {date}</h2>
    <p className="mt-1">No presence or absence is inferred from incomplete setup. Record only observed attendance after the roster is configured.</p>
    {incomplete.map(program => {
      const configuration = program.configuration;
      if (configuration === "configured" || configuration === "not_onsite") return null;
      return <div key={program.id} className="mt-3">
        <p className="font-semibold">{program.name}</p>
        <p>{nextSteps[configuration]}{program.missingCalendarDates > 0 &&
          ` Missing calendar dates: ${program.missingCalendarDates}.`}</p>
        {canConfigure && (configuration === "no_active_enrollments"
          ? <Link to="/admissions/families" search={{ siteId: program.siteId, programId: program.id }}
              className="mt-2 inline-block font-semibold underline">Review enrollment readiness</Link>
          : configuration === "onsite_pattern_mismatch"
          ? <Link to="/operations/launch/$programId" params={{ programId: program.id }}
              className="mt-2 inline-block font-semibold underline">Review Program delivery setup</Link>
          : <Link to="/operations/school-years" search={{ siteId: program.siteId, programId: program.id }}
              className="mt-2 inline-block font-semibold underline">Configure school calendar and schedule</Link>)}
      </div>;
    })}
  </section>;
}
