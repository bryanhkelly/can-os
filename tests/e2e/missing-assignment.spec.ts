/**
 * GF1 golden-flow e2e: assignment becomes missing -> guardian notified ->
 * student submits late -> teacher grades -> grade visible (repo rule 16).
 *
 * The test is self-contained: beforeAll builds its own synthetic fixture graph
 * in Neon (see fixture.ts) and afterAll deletes it, so it can run repeatedly
 * against a disposable Neon branch. Auth uses real passwordless session rows
 * (secret hashed with CAN_ACCESS_TOKEN_PEPPER) injected as the session cookie —
 * there is no app backdoor.
 */
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import {
  createGf1Fixture,
  destroyGf1Fixture,
  type Gf1Fixture,
  type Sql,
} from "./fixture";
import { withAuthenticatedPage } from "./helpers/authenticated-persona";
import {
  expectAuditActionGroups,
  expectNotification,
} from "./helpers/evidence-assertions";
import { DATABASE_URL, TEST_JOB_SECRET, baseURL } from "./env";

let sql: Sql;
let fixture: Gf1Fixture;

interface SubmissionRow {
  status: string;
  timeliness: string;
  score: string | null;
}

async function getSubmission(): Promise<SubmissionRow> {
  const rows = (await sql.query(
    `select status, timeliness, score::text as score from submissions where id = $1`,
    [fixture.submissionId],
  )) as SubmissionRow[];
  const row = rows[0];
  if (!row) throw new Error("Fixture submission row is missing");
  return row;
}

test.beforeAll(async () => {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for the GF1 e2e test. Point it at a disposable Neon branch — never production.",
    );
  }
  sql = neon(DATABASE_URL);
  fixture = await createGf1Fixture(sql);
});

test.afterAll(async () => {
  if (fixture) await destroyGf1Fixture(sql, fixture);
});

test("GF1: missing assignment -> guardian notified -> late submit -> graded -> visible", async ({
  browser,
  request,
}) => {
  await test.step("maintenance job marks the overdue submission missing", async () => {
    // Sanity check on the fixture: assigned and on time before the job runs.
    const before = await getSubmission();
    expect(before.status).toBe("assigned");
    expect(before.timeliness).toBe("on_time");

    // POST /api/jobs runs markOverdueSubmissionsMissing() and then
    // processPendingDomainEvents() (the domain-event worker).
    const response = await request.post(`${baseURL}/api/jobs`, {
      headers: { "x-can-job-secret": TEST_JOB_SECRET },
    });
    expect(
      response.ok(),
      `POST /api/jobs failed: HTTP ${response.status()} ${await response.text()}`,
    ).toBe(true);

    await expect
      .poll(async () => (await getSubmission()).timeliness, { timeout: 15_000 })
      .toBe("missing");
  });

  await test.step("guardian is notified about the missing assignment", async () => {
    // The AssignmentBecameMissing domain-event handler notifies the student,
    // guardians with canViewAcademics, and section teachers.
    await expectNotification(sql, {
      recipientPersonId: fixture.guardianPersonId,
      type: "missing_assignment",
      resourceId: fixture.submissionId,
    });
  });

  await withAuthenticatedPage(browser, fixture.guardianSecret, async guardian => {
    await test.step("guardian sees the same missing assignment in academic progress", async () => {
      await guardian.page.goto("/guardian/academics");
      await expect(
        guardian.page.getByRole("heading", { name: "Academic progress" }),
      ).toBeVisible();
      await expect(guardian.page.getByText(fixture.assessmentTitle)).toBeVisible();
      await expect(guardian.page.getByText(/missing/i)).toBeVisible();
    });
  });

  await withAuthenticatedPage(browser, fixture.specialistSecret, async specialist => {
    await test.step("specialist caseload receives the intervention insight", async () => {
      await specialist.page.goto("/coach");
      await expect(
        specialist.page.getByRole("heading", { name: "Caseload" }),
      ).toBeVisible();
      await expect(
        specialist.page.getByText(new RegExp(`Jordan Student-${fixture.suffix}`)),
      ).toBeVisible();
      await expect(specialist.page.getByText(/1 insight/)).toBeVisible();
    });
  });

  await withAuthenticatedPage(browser, fixture.teacherSecret, async teacher => {
    await test.step("teacher sees the missing work in the queue", async () => {
      await teacher.page.goto("/teacher/missing-work");
      await expect(
        teacher.page.getByRole("heading", { name: "Missing work" }),
      ).toBeVisible();
      await expect(
        teacher.page.getByRole("heading", { name: fixture.assessmentTitle }),
      ).toBeVisible();
    });
  });

  await withAuthenticatedPage(browser, fixture.studentSecret, async student => {
    await test.step("student submits the assignment late via the UI", async () => {
      await student.page.goto("/student/assignments");
      await expect(
        student.page.getByRole("heading", { name: "Your assignments" }),
      ).toBeVisible();

      await student.page
        .getByRole("link", { name: fixture.assessmentTitle })
        .click();
      await student.page
        .getByPlaceholder("Write your response…")
        .fill("Here is my late submission for the problem set.");
      await student.page.getByRole("button", { name: "Submit assignment" }).click();

      await expect(
        student.page.getByText("Your assignment has been submitted."),
      ).toBeVisible();

      const after = await getSubmission();
      expect(after.status).toBe("submitted");
      expect(after.timeliness).toBe("late");
    });
  });

  await test.step("teacher grades the late submission in the real gradebook UI", async () => {
    await withAuthenticatedPage(browser, fixture.teacherSecret, async teacherGradebook => {
      // Deep-link straight into the grading panel for this student and
      // assessment, the same pattern the Algebra I classroom flow uses.
      await teacherGradebook.page.goto(
        `/teacher/gradebook?section=${fixture.sectionId}&assessment=${fixture.assessmentId}&student=${fixture.studentProfileId}`,
      );
      await expect(
        teacherGradebook.page.getByRole("heading", { name: new RegExp(fixture.assessmentTitle) }),
      ).toBeVisible();
      await teacherGradebook.page.getByLabel(/Score/).fill("88");
      await teacherGradebook.page
        .getByLabel("Feedback comment")
        .fill("Good recovery - glad you got it in.");
      await teacherGradebook.page.getByRole("button", { name: "Post grade" }).click();

      await expect
        .poll(async () => (await getSubmission()).status, { timeout: 15_000 })
        .toBe("graded");
      const graded = await getSubmission();
      expect(graded.timeliness).toBe("late");
      expect(Number(graded.score)).toBe(88);
    });
  });

  await test.step("grade event is processed into a guardian notification", async () => {
    const response = await request.post(`${baseURL}/api/jobs`, {
      headers: { "x-can-job-secret": TEST_JOB_SECRET },
    });
    expect(response.ok()).toBe(true);

    await expectNotification(sql, {
      recipientPersonId: fixture.guardianPersonId,
      type: "grade_posted",
      resourceId: fixture.submissionId,
    });
  });

  await test.step("submit and grade wrote immutable audit events", async () => {
    await expectAuditActionGroups(sql, {
      resourceType: "submission",
      resourceIds: [fixture.submissionId],
      groups: [
        ["assignment.submit", "submission.submit"],
        ["assignment.grade", "submission.grade"],
      ],
    });
  });

  await withAuthenticatedPage(browser, fixture.guardianSecret, async guardianAgain => {
    await test.step("guardian sees the posted grade and feedback from canonical data", async () => {
      await guardianAgain.page.goto("/guardian/academics");
      const card = guardianAgain.page.getByRole("heading", { name: fixture.assessmentTitle }).locator("..").locator("..");
      await expect(card.getByText(/Grade:\s*88\s*\/\s*100/)).toBeVisible();
      await expect(card.getByText(/Good recovery/)).toBeVisible();
    });
  });

  await withAuthenticatedPage(browser, fixture.studentSecret, async studentAgain => {
    await test.step("student sees the posted grade and feedback", async () => {
      await studentAgain.page.goto("/student/assignments");
      await studentAgain.page
        .getByRole("link", { name: fixture.assessmentTitle })
        .click();
      await expect(
        studentAgain.page.getByText(/Score:\s*88/),
      ).toBeVisible();
      await expect(
        studentAgain.page.getByText(/Good recovery/),
      ).toBeVisible();
    });
  });
});
