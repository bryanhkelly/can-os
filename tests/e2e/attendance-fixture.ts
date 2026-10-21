import { createGf1Fixture, destroyGf1Fixture, type Gf1Fixture, type Sql } from "./fixture";
import { siteDate } from "../../src/domain/expected-attendance";

export type AttendanceFixture = Gf1Fixture & { attendanceDate: string };

export async function createAttendanceFixture(sql: Sql): Promise<AttendanceFixture> {
  if (process.env.APP_ENV !== "test" || process.env.NODE_ENV !== "test" ||
      process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
      !process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
    throw new Error("Attendance browser fixtures require the guarded disposable database runner.");
  const base = await createGf1Fixture(sql);
  const attendanceDate = siteDate(new Date(), "America/Los_Angeles");
  const weekday = new Date(`${attendanceDate}T12:00:00.000Z`).getUTCDay();
  const fixture: AttendanceFixture = { ...base, attendanceDate };
  try {
    await sql.transaction([
      sql.query(`insert into enrollments (
        student_profile_id, kind, status, organization_id, program_id, school_year_id, metadata
      ) values ($1, 'program', 'active', $2, $3, $4, '{}'::jsonb)`,
      [fixture.studentProfileId, fixture.hostOrgId, fixture.programId, fixture.schoolYearId]),
      sql.query(`insert into academic_calendars (school_year_id, site_id, name, version, active)
        values ($1, $2, 'Attendance browser calendar', 1, true) returning id`,
      [fixture.schoolYearId, fixture.siteId]),
    ]);
    const calendars = await sql.query(
      "select id from academic_calendars where school_year_id = $1 and name = 'Attendance browser calendar'",
      [fixture.schoolYearId],
    ) as Array<{ id: string }>;
    const calendar = calendars[0];
    if (!calendar) throw new Error("Attendance browser calendar was not created.");
    await sql.transaction([
      sql.query(`insert into academic_calendar_days (
        academic_calendar_id, calendar_date, type, instructional_minutes
      ) values ($1, $2, 'instructional', 360)`, [calendar.id, attendanceDate]),
      sql.query(`insert into schedule_templates (
        school_year_id, program_id, site_id, name, active, effective_from
      ) values ($1, $2, $3, 'Attendance browser schedule', true, '2026-08-16') returning id`,
      [fixture.schoolYearId, fixture.programId, fixture.siteId]),
    ]);
    const schedules = await sql.query(
      "select id from schedule_templates where school_year_id = $1 and name = 'Attendance browser schedule'",
      [fixture.schoolYearId],
    ) as Array<{ id: string }>;
    const schedule = schedules[0];
    if (!schedule) throw new Error("Attendance browser schedule was not created.");
    await sql.query(`insert into schedule_template_periods (
      schedule_template_id, day_of_week, sequence, label, starts_at_local, ends_at_local, type
    ) values ($1, $2, 1, 'Instruction', '08:30', '15:00', 'instruction')`,
    [schedule.id, weekday]);
    return fixture;
  } catch (error) {
    await retireAttendanceFixture(sql, fixture).catch(() => undefined);
    throw error;
  }
}

export async function retireAttendanceFixture(sql: Sql, fixture: AttendanceFixture): Promise<void> {
  const attendanceEvents = `(select id from attendance_events where student_profile_id = $1
    and program_id = $2 and occurrence_key = $3)`;
  const attendanceScope = [fixture.studentProfileId, fixture.programId, `${fixture.attendanceDate}:site-day`];
  await sql.transaction([
    sql.query(`delete from notifications where resource_type = 'attendance_event'
      and resource_id in ${attendanceEvents}`, attendanceScope),
    sql.query(`delete from attendance_excuses where attendance_event_id in ${attendanceEvents}`, attendanceScope),
    sql.query(`delete from attendance_events where id in ${attendanceEvents}`, attendanceScope),
    sql.query(`delete from enrollments where student_profile_id = $1 and program_id = $2 and kind = 'program'`,
      [fixture.studentProfileId, fixture.programId]),
    sql.query(`delete from schedule_template_periods where schedule_template_id in (
      select id from schedule_templates where school_year_id = $1 and name = 'Attendance browser schedule'
    )`, [fixture.schoolYearId]),
    sql.query(`delete from schedule_templates where school_year_id = $1 and name = 'Attendance browser schedule'`,
      [fixture.schoolYearId]),
    sql.query(`delete from academic_calendar_days where academic_calendar_id in (
      select id from academic_calendars where school_year_id = $1 and name = 'Attendance browser calendar'
    )`, [fixture.schoolYearId]),
    sql.query(`delete from academic_calendars where school_year_id = $1 and name = 'Attendance browser calendar'`,
      [fixture.schoolYearId]),
  ]);
  await destroyGf1Fixture(sql, fixture);
}
