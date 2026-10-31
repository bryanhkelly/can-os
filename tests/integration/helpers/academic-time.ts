export async function createAcademicTimeFixture(input: {
  organizationId: string;
  programId: string;
  siteId: string;
  suffix: string;
  startsOn?: string;
  endsOn?: string;
  /** Term span; defaults to the fall window of the fixed 2027 fixture. */
  termStartsOn?: string;
  termEndsOn?: string;
  /**
   * Instructional calendar days. Defaults to the single fixed 2027-09-14 day.
   * Journey tests that exercise a real school-local "today" pass their own
   * computed dates.
   */
  calendarDays?: Array<{ date: string; type?: string; instructionalMinutes?: number }>;
  /** Weekdays (UTC 0–6) that get one instruction period; defaults to [2]. */
  scheduleDays?: number[];
}) {
  const [{ db }, schema] = await Promise.all([
    import("@/db/client"),
    import("@/db/schema"),
  ]);

  const startsOn = input.startsOn ?? "2027-08-16";
  const endsOn = input.endsOn ?? "2028-06-02";
  const schoolYearLabel = `${startsOn.slice(0, 4)}–${endsOn.slice(0, 4)}`;
  const schoolYearKey = `${startsOn.slice(0, 4)}-${endsOn.slice(0, 4)}`;

  const [gradeScale] = await db
    .insert(schema.gradeScales)
    .values({
      owningOrganizationId: input.organizationId,
      name: "Standard 4.0",
      version: 1,
      configuration: {
        entries: [
          { label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true },
          { label: "B", minPercent: 80, maxPercent: 89.99, gpaPoints: 3, passing: true },
          { label: "C", minPercent: 70, maxPercent: 79.99, gpaPoints: 2, passing: true },
          { label: "D", minPercent: 60, maxPercent: 69.99, gpaPoints: 1, passing: true },
          { label: "F", minPercent: 0, maxPercent: 59.99, gpaPoints: 0, passing: false },
        ],
      },
      effectiveFrom: startsOn,
    })
    .returning();

  const [schoolYear] = await db
    .insert(schema.schoolYears)
    .values({
      organizationId: input.organizationId,
      programId: input.programId,
      siteId: input.siteId,
      key: `${schoolYearKey}-${input.suffix}`,
      name: schoolYearLabel,
      status: "active",
      startsOn,
      endsOn,
      gradeScaleId: gradeScale.id,
      timezone: "America/Los_Angeles",
    })
    .returning();

  const [term] = await db
    .insert(schema.terms)
    .values({
      schoolYearId: schoolYear.id,
      key: `fall-${input.suffix}`,
      name: "Fall Semester",
      sequence: 1,
      startsOn: input.termStartsOn ?? startsOn,
      endsOn: input.termEndsOn ?? "2027-12-19",
    })
    .returning();

  const [gradingPeriod] = await db
    .insert(schema.gradingPeriods)
    .values({
      termId: term.id,
      key: `q1-${input.suffix}`,
      name: "Quarter 1",
      sequence: 1,
      startsOn,
      endsOn: input.termEndsOn ?? "2027-10-15",
    })
    .returning();

  const [calendar] = await db
    .insert(schema.academicCalendars)
    .values({
      schoolYearId: schoolYear.id,
      siteId: input.siteId,
      name: "Primary Academic Calendar",
      version: 1,
      active: true,
    })
    .returning();

  const calendarDayInputs = input.calendarDays ?? [
    { date: "2027-09-14", type: "instructional", instructionalMinutes: 360 },
  ];
  const calendarDays = await db.insert(schema.academicCalendarDays).values(
    calendarDayInputs.map(day => ({
      academicCalendarId: calendar.id,
      calendarDate: day.date,
      type: day.type ?? "instructional",
      instructionalMinutes: day.instructionalMinutes ?? 360,
    })),
  ).returning();

  const [scheduleTemplate] = await db
    .insert(schema.scheduleTemplates)
    .values({
      schoolYearId: schoolYear.id,
      programId: input.programId,
      siteId: input.siteId,
      name: "Standard Day",
      active: true,
      effectiveFrom: startsOn,
    })
    .returning();

  const schedulePeriods = await db.insert(schema.scheduleTemplatePeriods).values(
    (input.scheduleDays ?? [2]).map((dayOfWeek, index) => ({
      scheduleTemplateId: scheduleTemplate.id,
      dayOfWeek,
      sequence: index + 1,
      label: "Morning",
      startsAtLocal: "08:30:00",
      endsAtLocal: "09:30:00",
      type: "instruction",
    })),
  ).returning();

  return {
    gradeScale,
    schoolYear,
    term,
    gradingPeriod,
    calendar,
    calendarDays,
    scheduleTemplate,
    schedulePeriods,
  };
}
