import { useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { schoolYearStructure } from "@/domain/school-year-structure";
import {
  activateStudioYear, addStudioCalendar, addStudioCalendarDay, addStudioGradingPeriod, addStudioTerm,
  populateStudioInstructionalDays, prepareStudioYear, removeStudioCalendarDay, type getSchoolYearStudio,
} from "@/modules/academic-time/school-year-studio.functions";
import { SchoolYearScheduleEditor } from "@/components/operations/SchoolYearScheduleEditor";
import { SchoolYearScheduleSetup } from "@/components/operations/SchoolYearScheduleSetup";
import { useSchoolYearCommands, type SchoolYearRun } from "@/components/operations/school-year-commands";
import { DetailNavigation, EmptyState, FormSection, SectionTab, StatusBadge, WorkspaceShell, type StatusTone } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { plural } from "@/lib/format";
import { Select } from "@/components/ui/select";

type Snapshot = Awaited<ReturnType<typeof getSchoolYearStudio>>;
export type SchoolYear = Snapshot["years"][number];
type Calendar = SchoolYear["calendars"][number];
type CalendarDay = Calendar["days"][number];

export const schoolYearTabs = [
  { value: "overview", label: "Overview" },
  { value: "terms", label: "Terms" },
  { value: "calendar", label: "Calendar" },
  { value: "schedule", label: "Schedule" },
] as const;
export type SchoolYearTab = (typeof schoolYearTabs)[number]["value"];
type Scope = { siteId?: string; programId?: string };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_TYPES = ["instructional", "holiday", "closure", "special", "makeup"] as const;

export function schoolYearStatus(status: string): { label: string; tone: StatusTone } {
  if (status === "active") return { label: "Active", tone: "success" };
  if (status === "draft") return { label: "Draft", tone: "attention" };
  return { label: status.charAt(0).toUpperCase() + status.slice(1), tone: "neutral" };
}

export function schoolYearCounts(year: SchoolYear) {
  const days = year.calendars.flatMap(calendar => calendar.days);
  return {
    terms: year.terms.length,
    gradingPeriods: year.terms.reduce((total, term) => total + term.periods.length, 0),
    instructionalDays: days.filter(day => day.type === "instructional").length,
    exceptionDays: days.filter(day => day.type !== "instructional").length,
    schedules: year.schedules.length,
  };
}


function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

export function SchoolYearRecord({ year, siteName, tab, scope }: { year: SchoolYear; siteName?: string; tab: SchoolYearTab; scope: Scope }) {
  const { busy, run, feedback } = useSchoolYearCommands();
  const status = schoolYearStatus(year.status);
  const tabLink = (value: SchoolYearTab, children: ReactNode, className?: string) =>
    <Link to="/operations/school-years/$yearId" params={{ yearId: year.id }}
      search={{ ...scope, tab: value === "overview" ? undefined : value }} className={className}>{children}</Link>;

  return <WorkspaceShell eyebrow="School year" title={year.name}
    subtitle={`${siteName ? `${siteName} · ` : ""}${year.startsOn} to ${year.endsOn} · ${year.timezone}`}
    breadcrumbs={<Link to="/operations/school-years" search={scope} className="underline">School years</Link>}
    actions={<div className="flex flex-wrap items-center gap-3">
      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      {year.status !== "active" && <Button variant="outline" disabled={busy} onClick={() => run(() => activateStudioYear({ data: { schoolYearId: year.id } }))}>Activate year</Button>}
    </div>}>
    {feedback}
    <DetailNavigation label="School year sections">{schoolYearTabs.map(item => <SectionTab key={item.value} current={tab === item.value}
      link={{ to: "/operations/school-years/$yearId", params: { yearId: year.id }, search: { ...scope, tab: item.value === "overview" ? undefined : item.value } }}>
      {item.label}</SectionTab>)}</DetailNavigation>
    {tab === "overview" && <OverviewSection year={year} busy={busy} run={run} tabLink={tabLink} />}
    {tab === "terms" && <TermsSection year={year} busy={busy} run={run} />}
    {tab === "calendar" && <CalendarSection year={year} busy={busy} run={run} />}
    {tab === "schedule" && <ScheduleSection year={year} busy={busy} run={run} />}
  </WorkspaceShell>;
}

type SectionProps = { year: SchoolYear; busy: boolean; run: SchoolYearRun };

function OverviewSection({ year, busy, run, tabLink }: SectionProps & { tabLink: (value: SchoolYearTab, children: ReactNode, className?: string) => ReactNode }) {
  const counts = schoolYearCounts(year);
  const facts: [string, string, SchoolYearTab][] = [
    ["Terms", plural(counts.terms, "term"), "terms"],
    ["Grading periods", plural(counts.gradingPeriods, "grading period"), "terms"],
    ["Instructional days", plural(counts.instructionalDays, "day"), "calendar"],
    ["Holidays and closures", plural(counts.exceptionDays, "day"), "calendar"],
    ["Instructional schedules", plural(counts.schedules, "schedule"), "schedule"],
  ];
  const missing = [
    !counts.terms && ["Add terms and grading periods", "terms"],
    !year.calendars.length && ["Create the academic calendar", "calendar"],
    !counts.schedules && ["Review the instructional schedule", "schedule"],
  ].filter((item): item is [string, SchoolYearTab] => Boolean(item));
  return <div className="space-y-8">
    <section aria-labelledby="school-year-summary">
      <h2 id="school-year-summary" className="text-lg font-semibold">Summary</h2>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{facts.map(([label, value, target]) =>
        <div key={label} className="rounded-lg border bg-card p-4">
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-lg font-semibold">{tabLink(target, value, "hover:underline")}</dd>
        </div>)}</dl>
    </section>
    {year.status === "draft" && <PrepareYear year={year} busy={busy} run={run} />}
    {year.status !== "active" && missing.length > 0 && <section aria-labelledby="school-year-next">
      <h2 id="school-year-next" className="text-lg font-semibold">Before activation</h2>
      <ul className="mt-3 space-y-2 text-sm">{missing.map(([label, target]) => <li key={label}>{tabLink(target, label, "font-semibold underline")}</li>)}</ul>
      <p className="mt-3 text-sm text-muted-foreground">Activation still runs the server readiness checks; this list is guidance only.</p>
    </section>}
  </div>;
}

function WeekdayPicker({ weekdays, onChange, legend }: { weekdays: number[]; onChange: (weekdays: number[]) => void; legend: string }) {
  return <fieldset className="sm:col-span-2"><legend className="text-sm font-semibold">{legend}</legend>
    <div className="mt-2 flex flex-wrap gap-3">{WEEKDAYS.map((day, index) => <Label key={day} className="flex items-center gap-2 text-sm">
      <Checkbox checked={weekdays.includes(index)} onChange={e => onChange(e.target.checked ? [...weekdays, index] : weekdays.filter(value => value !== index))} />{day}
    </Label>)}</div>
  </fieldset>;
}

const validMinutes = (minutes: number) => Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440;

function PrepareYear({ year, busy, run }: SectionProps) {
  const [structure, setStructure] = useState<"full_year" | "semesters">("full_year");
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [dailyMinutes, setDailyMinutes] = useState(390);
  const proposedTerms = schoolYearStructure(year.startsOn, year.endsOn, structure);
  return <FormSection title="Prepare your academic year"
    description="Create missing terms, grading periods and an instructional calendar with ordinary instructional days. Existing records, holidays and closures stay unchanged. Review local holidays and any onsite schedule before activation.">
    {year.terms.length
      ? <p className="text-sm sm:col-span-2">Existing terms and grading periods are kept.</p>
      : <Field label="Term structure">
        <Select value={structure} onChange={e => setStructure(e.target.value as typeof structure)}>
          <option value="full_year">One full-year term</option>
          <option value="semesters" disabled={year.startsOn === year.endsOn}>Two semesters</option>
        </Select>
      </Field>}
    {!year.terms.length && <p className="self-end text-sm text-muted-foreground">{proposedTerms.map(term => `${term.name}: ${term.startsOn}–${term.endsOn}`).join(" · ")}</p>}
    <WeekdayPicker legend="Recommended instructional weekdays" weekdays={weekdays} onChange={setWeekdays} />
    <Field label="Instructional minutes per day">
      <Input type="number" min={1} max={1440} value={dailyMinutes} onChange={e => setDailyMinutes(Number(e.target.value))} />
    </Field>
    <div className="sm:col-span-2">
      <Button type="button" disabled={busy || !weekdays.length || !validMinutes(dailyMinutes)}
        onClick={() => run(() => prepareStudioYear({ data: { schoolYearId: year.id, structure, instructionalDays: { weekdays, instructionalMinutes: dailyMinutes } } }))}>
        Prepare academic year and instructional days</Button>
    </div>
  </FormSection>;
}

function TermsSection({ year, busy, run }: SectionProps) {
  const [termName, setTermName] = useState("Fall semester"), [termKey, setTermKey] = useState("fall");
  const [termStart, setTermStart] = useState(year.startsOn), [termEnd, setTermEnd] = useState(year.endsOn);
  return <div className="space-y-8">
    <section aria-labelledby="school-year-terms">
      <h2 id="school-year-terms" className="text-lg font-semibold">Terms and grading periods <span className="font-normal text-muted-foreground">({year.terms.length})</span></h2>
      {year.terms.length
        ? <ul className="mt-4 divide-y rounded-lg border bg-card">{year.terms.map(term => <li key={term.id} className="flex flex-wrap items-start justify-between gap-3 p-4 text-sm">
          <div>
            <p className="font-semibold">{term.name}</p>
            <p className="text-muted-foreground">{term.startsOn} to {term.endsOn}</p>
            <p className="mt-1">{term.periods.length ? term.periods.map(period => period.name).join(" · ") : "No grading periods yet"}</p>
          </div>
          <Button size="sm" variant="outline" disabled={busy}
            onClick={() => run(() => addStudioGradingPeriod({ data: { termId: term.id, key: "grading-" + (term.periods.length + 1), name: "Grading period " + (term.periods.length + 1), sequence: term.periods.length + 1, startsOn: term.startsOn, endsOn: term.endsOn } }))}>
            Add grading period</Button>
        </li>)}</ul>
        : <EmptyState title="No terms yet" description="Add a term below, or prepare the academic year from Overview." />}
    </section>
    <form onSubmit={event => { event.preventDefault(); void run(() => addStudioTerm({ data: { schoolYearId: year.id, key: termKey, name: termName, sequence: year.terms.length + 1, startsOn: termStart, endsOn: termEnd } })); }}>
      <FormSection title="Add a term">
        <Field label="Term name" required><Input value={termName} onChange={e => setTermName(e.target.value)} /></Field>
        <Field label="Term key" required><Input value={termKey} onChange={e => setTermKey(e.target.value)} /></Field>
        <Field label="Term start" required><Input type="date" value={termStart} onChange={e => setTermStart(e.target.value)} /></Field>
        <Field label="Term end" required><Input type="date" value={termEnd} onChange={e => setTermEnd(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Add term</Button></div>
      </FormSection>
    </form>
  </div>;
}

function CalendarSection({ year, busy, run }: SectionProps) {
  if (!year.calendars.length) return <section aria-labelledby="school-year-calendar">
    <h2 id="school-year-calendar" className="text-lg font-semibold">Academic calendar</h2>
    <EmptyState title="No academic calendar yet" description="Create the calendar, then generate instructional days and record holidays and closures." />
    <Button className="mt-4" disabled={busy} onClick={() => run(() => addStudioCalendar({ data: { schoolYearId: year.id } }))}>Create calendar</Button>
  </section>;
  return <div className="space-y-10">{year.calendars.map(calendar => <CalendarRecord key={calendar.id} year={year} calendar={calendar} busy={busy} run={run} />)}</div>;
}

function DayRow({ day, busy, run }: { day: CalendarDay; busy: boolean; run: SchoolYearRun }) {
  return <li className="flex items-center justify-between gap-2 py-2 text-sm">
    <span>{day.calendarDate} · {day.type}{day.title ? ` · ${day.title}` : ""}</span>
    <Button type="button" variant="ghost" size="sm" disabled={busy} aria-label={`Remove ${day.calendarDate}`}
      onClick={() => run(() => removeStudioCalendarDay({ data: { dayId: day.id } }))}>Remove</Button>
  </li>;
}

function CalendarRecord({ year, calendar, busy, run }: SectionProps & { calendar: Calendar }) {
  const [weekdays, setWeekdays] = useState([1, 2, 3, 4, 5]);
  const [dailyMinutes, setDailyMinutes] = useState(390);
  const [day, setDay] = useState(year.startsOn);
  const [dayType, setDayType] = useState<(typeof DAY_TYPES)[number]>("holiday");
  const [title, setTitle] = useState("");
  const exceptions = calendar.days.filter(entry => entry.type !== "instructional");
  const months = new Map<string, CalendarDay[]>();
  for (const entry of calendar.days) if (entry.type === "instructional") {
    const month = entry.calendarDate.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), entry]);
  }
  const instructional = calendar.days.length - exceptions.length;
  return <section aria-labelledby={`calendar-${calendar.id}`} className="space-y-8">
    <div>
      <h2 id={`calendar-${calendar.id}`} className="text-lg font-semibold">{calendar.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{plural(instructional, "instructional day")} · {plural(exceptions.length, "holiday, closure or special day", "holidays, closures or special days")}</p>
    </div>
    <section aria-labelledby={`exceptions-${calendar.id}`}>
      <h3 id={`exceptions-${calendar.id}`} className="font-semibold">Holidays, closures and special days</h3>
      {exceptions.length
        ? <ul className="mt-2 divide-y rounded-lg border bg-card px-4">{exceptions.map(entry => <DayRow key={entry.id} day={entry} busy={busy} run={run} />)}</ul>
        : <p className="mt-2 text-sm text-muted-foreground">{year.status === "active" ? "None recorded." : "None recorded yet. Add local holidays before activation."}</p>}
    </section>
    <section aria-labelledby={`months-${calendar.id}`}>
      <h3 id={`months-${calendar.id}`} className="font-semibold">Instructional days by month</h3>
      {months.size
        ? <ul className="mt-2 divide-y rounded-lg border bg-card">{[...months].map(([month, days]) => <li key={month}>
          <details className="group px-4 py-2">
            <summary className="flex cursor-pointer items-center justify-between gap-3 py-1 text-sm">
              <span className="font-medium">{monthLabel(month)}</span><span className="text-muted-foreground">{plural(days.length, "day")}</span>
            </summary>
            <ul className="mt-1 divide-y border-t">{days.map(entry => <DayRow key={entry.id} day={entry} busy={busy} run={run} />)}</ul>
          </details>
        </li>)}</ul>
        : <p className="mt-2 text-sm text-muted-foreground">No instructional days yet. Generate them below.</p>}
    </section>
    <form onSubmit={event => { event.preventDefault(); void run(() => addStudioCalendarDay({ data: { academicCalendarId: calendar.id, calendarDate: day, type: dayType, ...(title ? { title } : {}) } })); }}>
      <FormSection title="Add or change a day">
        <Field label="Calendar date" required><Input type="date" value={day} onChange={e => setDay(e.target.value)} /></Field>
        <Field label="Day type" required><Select value={dayType} onChange={e => setDayType(e.target.value as typeof dayType)}>{DAY_TYPES.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>
        <Field label="Day title (optional)" className="sm:col-span-2"><Input placeholder="Optional description" value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save calendar day</Button></div>
      </FormSection>
    </form>
    <FormSection title="Generate instructional days" description="Existing holidays, closures and special days are not overwritten.">
      <WeekdayPicker legend="Instructional weekdays" weekdays={weekdays} onChange={setWeekdays} />
      <Field label="Instructional minutes per day">
        <Input type="number" min={1} max={1440} value={dailyMinutes} onChange={e => setDailyMinutes(Number(e.target.value))} />
      </Field>
      <div className="sm:col-span-2">
        <Button type="button" variant="outline" disabled={busy || !weekdays.length || !validMinutes(dailyMinutes)}
          onClick={() => run(() => populateStudioInstructionalDays({ data: { academicCalendarId: calendar.id, weekdays, instructionalMinutes: dailyMinutes } }))}>
          Populate school year</Button>
      </div>
    </FormSection>
  </section>;
}

function ScheduleSection({ year, busy, run }: SectionProps) {
  const router = useRouter();
  const setup = <SchoolYearScheduleSetup schoolYearId={year.id} programId={year.programId ?? undefined} startsOn={year.startsOn} endsOn={year.endsOn} timezone={year.timezone} disabled={busy} changed={() => router.invalidate()} />;
  return <section aria-labelledby="school-year-schedule">
    <h2 id="school-year-schedule" className="text-lg font-semibold">Instructional schedules <span className="font-normal text-muted-foreground">({year.schedules.length})</span></h2>
    {year.schedules.map(schedule => <SchoolYearScheduleEditor key={schedule.id} schedule={schedule} run={run} busy={busy} />)}
    {year.schedules.length
      ? <details key={year.schedules.length} className="mt-6"><summary className="cursor-pointer text-sm font-semibold">Add another instructional schedule</summary>{setup}</details>
      : setup}
  </section>;
}
