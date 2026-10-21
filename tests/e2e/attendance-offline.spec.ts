import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { accessSessionCookie, type Sql } from "./fixture";
import { createAttendanceFixture, retireAttendanceFixture, type AttendanceFixture } from "./attendance-fixture";
import { DATABASE_URL, baseURL } from "./env";

let sql: Sql;
let fixture: AttendanceFixture;

test.beforeAll(async () => {
  if (!DATABASE_URL) throw new Error("Disposable database required.");
  sql = neon(DATABASE_URL);
  fixture = await createAttendanceFixture(sql);
});

test.afterAll(async () => {
  if (fixture) await retireAttendanceFixture(sql, fixture);
});

test("staff attendance stores an offline mark and synchronizes it when connectivity returns", async ({ browser }) => {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([{
    name: accessSessionCookie, value: fixture.teacherSecret, domain: "localhost", path: "/",
    httpOnly: true, secure: true, sameSite: "Lax",
  }]);
  const page = await context.newPage();
  try {
    await page.goto("/staff/attendance");
    await page.getByLabel("Attendance date").fill(fixture.attendanceDate);
    await expect(page.getByRole("heading", { name: "Jordan", exact: true })).toBeVisible();

    await context.setOffline(true);
    await page.getByRole("button", { name: "absent", exact: true }).click();
    await expect(page.getByText("1 attendance entry stored on this device pending synchronization.")).toBeVisible();
    const queued = await page.evaluate(() => JSON.parse(
      localStorage.getItem("can-os:attendance:pending:v2") ?? "[]",
    ) as Array<{ mutationId: string; status: string }>);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ status: "absent" });

    await context.setOffline(false);
    await expect(page.getByRole("status").filter({ hasText: "All offline attendance entries synchronized." }))
      .toBeVisible();
    await expect(page.getByText("1 attendance entry stored on this device pending synchronization."))
      .toHaveCount(0);

    const stored = await sql.query(
      "select status from attendance_events where source_key = $1",
      [`manual-revision:${queued[0]!.mutationId}`],
    ) as Array<{ status: string }>;
    expect(stored).toEqual([{ status: "absent" }]);
  } finally {
    await context.close();
  }
});

test("staff attendance reports local storage failure without claiming the mark was saved", async ({ browser }) => {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([{
    name: accessSessionCookie, value: fixture.teacherSecret, domain: "localhost", path: "/",
    httpOnly: true, secure: true, sameSite: "Lax",
  }]);
  const page = await context.newPage();
  try {
    await page.goto("/staff/attendance");
    await page.getByLabel("Attendance date").fill(fixture.attendanceDate);
    await expect(page.getByRole("heading", { name: "Jordan", exact: true })).toBeVisible();
    const before = await sql.query(
      `select status from attendance_events where student_profile_id = $1
        and program_id = $2 and occurrence_key = $3 order by recorded_at, id`,
      [fixture.studentProfileId, fixture.programId, `${fixture.attendanceDate}:site-day`],
    );
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === "can-os:attendance:pending:v2") throw new DOMException("quota exceeded", "QuotaExceededError");
        original.call(this, key, value);
      };
    });

    await context.setOffline(true);
    await page.getByRole("button", { name: "present", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Offline attendance storage is unavailable. The entry was not saved.");
    await expect(page.getByRole("status").filter({ hasText: "Offline: attendance entry saved" })).toHaveCount(0);
    await expect(page.getByText(/attendance entry stored on this device pending synchronization/)).toHaveCount(0);

    const stored = await sql.query(
      `select status from attendance_events where student_profile_id = $1
        and program_id = $2 and occurrence_key = $3 order by recorded_at, id`,
      [fixture.studentProfileId, fixture.programId, `${fixture.attendanceDate}:site-day`],
    );
    expect(stored).toEqual(before);
  } finally {
    await context.close();
  }
});
