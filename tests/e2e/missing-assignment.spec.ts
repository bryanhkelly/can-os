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
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import {
  accessSessionCookie,
  createGf1Fixture,
  destroyGf1Fixture,
  type Gf1Fixture,
  type Sql,
} from "./fixture";
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

/** Signs in a browser context by injecting the app session cookie. */
async function signIn(context: BrowserContext, secret: string): Promise<void> {
  // __Host- cookie: must be Secure, Path=/, and set without a Domain attribute.
  // Chromium accepts Secure cookies on http://localhost (a trustworthy origin).
  await context.addCookies([
    {
      name: accessSessionCookie,
      value: secret,
      url: baseURL,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

async function newSignedInPage(
  browser: Browser,
  secret: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL });
  await signIn(context, secret);
  return { context, page: await context.newPage() };
}

/**
 * The teacher grading UI only exists embedded in the student demo page
 * (/student/assignments, "Preview as teacher"), whose loader hard-requires a
 * student session — there is no teacher-reachable grade form today. So the
 * grading step calls the same TanStack Start server function the UI calls
 * (gradeSyntheticAssignment) over HTTP with the teacher session cookie. This
 * still exercises the real authorization path: cookie -> getCommandContext ->
 * teacher role -> assignments:grade capability -> section-teacher relationship.
 *
 * TanStack Start generates opaque server-function ids at compile time, so the
 * id is discovered from the dev server's client transform of the module
 * (exports become `createServerFn(...).handler(createClientRpc("<id>"))`).
 */
async function resolveServerFnId(
  request: APIRequestContext,
  exportName: string,
): Promise<string> {
  const moduleUrl = `${baseURL}/src/modules/student-experience/assignments.functions.ts`;
  const response = await request.get(moduleUrl);
  if (!response.ok()) {
    throw new Error(
      `Unable to load ${moduleUrl} from the dev server (HTTP ${response.status()})`,
    );
  }
  const source = await response.text();
  const pattern = new RegExp(
    `${exportName}[\\s\\S]{0,800}?(?:createClientRpc|createSsrRpc)\\(\\s*["']([\\w-]+)["']\\)`,
  );
  const match = pattern.exec(source);
  if (!match?.[1]) {
    throw new Error(
      `Could not resolve the TanStack Start server-function id for ${exportName}; ` +
        `the dev-server module transform may have changed shape.`,
    );
  }
  return match[1];
}

async function callServerFn(
  request: APIRequestContext,
  fnId: string,
  secret: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await request.post(`${baseURL}/_serverFn/${fnId}`, {
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-tsr-serverFn": "true",
      cookie: `${accessSessionCookie}=${secret}`,
    },
    // Server functions expect the seroval-serialized payload { data: ... };
    // for plain JSON values seroval's JSON form is identical.
    data: { data },
  });
  if (!response.ok()) {
    throw new Error(
      `Server function ${fnId} failed (HTTP ${response.status()}): ${await response.text()}`,
    );
  }
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
    await expect
      .poll(
        async () => {
          const rows = (await sql.query(
            `select id from notifications
             where recipient_person_id = $1 and type = 'missing_assignment' and resource_id = $2`,
            [fixture.guardianPersonId, fixture.submissionId],
          )) as Array<{ id: string }>;
          return rows.length;
        },
        { timeout: 15_000 },
      )
      .toBeGreaterThanOrEqual(1);
  });

  const teacher = await newSignedInPage(browser, fixture.teacherSecret);
  try {
    await test.step("teacher sees the missing work in the queue", async () => {
      await teacher.page.goto("/teacher/missing-work");
      await expect(
        teacher.page.getByRole("heading", { name: "Missing work" }),
      ).toBeVisible();
      await expect(
        teacher.page.getByRole("heading", { name: fixture.assessmentTitle }),
      ).toBeVisible();
    });
  } finally {
    await teacher.context.close();
  }

  const student = await newSignedInPage(browser, fixture.studentSecret);
  try {
    await test.step("student submits the assignment late via the UI", async () => {
      await student.page.goto("/student/assignments");
      await expect(
        student.page.getByRole("heading", { name: "Your learning work." }),
      ).toBeVisible();

      await student.page
        .getByRole("button", { name: fixture.assessmentTitle })
        .click();
      await student.page
        .getByPlaceholder("Write your response…")
        .fill("Here is my late submission for the problem set.");
      await student.page.getByRole("button", { name: "Submit work" }).click();

      await expect(
        student.page.getByText("Your work has been submitted to Neon."),
      ).toBeVisible();
      await expect(
        student.page.getByText(
          "Submitted successfully. Your teacher can review your work.",
        ),
      ).toBeVisible();

      const after = await getSubmission();
      expect(after.status).toBe("submitted");
      expect(after.timeliness).toBe("late");
    });
  } finally {
    await student.context.close();
  }

  await test.step("teacher grades the late submission", async () => {
    // See the comment above resolveServerFnId: no teacher-reachable grade UI
    // exists yet, so this calls the same server function the UI button calls,
    // over HTTP with the teacher session cookie.
    const fnId = await resolveServerFnId(request, "gradeSyntheticAssignment");
    await callServerFn(request, fnId, fixture.teacherSecret, {
      submissionId: fixture.submissionId,
      score: 88, // percent of pointsPossible (100) -> stored score 88
      comment: "Good recovery - glad you got it in.",
    });

    await expect
      .poll(async () => (await getSubmission()).status, { timeout: 15_000 })
      .toBe("graded");
    const graded = await getSubmission();
    expect(graded.timeliness).toBe("late");
    expect(Number(graded.score)).toBe(88);
  });

  await test.step("submit and grade wrote immutable audit events", async () => {
    const rows = (await sql.query(
      `select action from audit_events
       where resource_type = 'submission' and resource_id = $1
         and action in ('assignment.submit', 'assignment.grade')`,
      [fixture.submissionId],
    )) as Array<{ action: string }>;
    const actions = new Set(rows.map((row) => row.action));
    expect(actions).toContain("assignment.submit");
    expect(actions).toContain("assignment.grade");
  });

  const studentAgain = await newSignedInPage(browser, fixture.studentSecret);
  try {
    await test.step("student sees the posted grade and feedback", async () => {
      await studentAgain.page.goto("/student/assignments");
      await studentAgain.page
        .getByRole("button", { name: fixture.assessmentTitle })
        .click();
      await expect(
        studentAgain.page.getByText(/Score:\s*88/),
      ).toBeVisible();
      await expect(
        studentAgain.page.getByText(/Good recovery/),
      ).toBeVisible();
    });
  } finally {
    await studentAgain.context.close();
  }
});
