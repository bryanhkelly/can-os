import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { DATABASE_URL, TEST_JOB_SECRET, baseURL } from "./env";
import {
  createAccessSession,
  openAuthenticatedPage,
  withAuthenticatedPages,
} from "./helpers/authenticated-persona";
import { waitForLocalAccessLink } from "./helpers/local-access-mail";
import {
  createAdmissionSeatPool,
  createFullFlowFixture,
  grantSiteScopedOperatorRole,
  pointProgramAtEnrollmentJourney,
  retireFullFlowFixture,
  type FullFlowFixture,
} from "./full-flow-fixture";
import type { Sql } from "./fixture";

/**
 * Persistent multi-role FullFlow browser acceptance
 * (docs/full-flow-acceptance-contract.md). Six stages, distinct authenticated
 * sessions per role, reload persistence, outbox processing, negative
 * cross-tenant checks and session revocation. Identities, safe catalogs and
 * prerequisites come from full-flow-fixture.ts; the tested Program, adopted
 * course, section, application, enrollment, submission and grade are all
 * produced through the product UI by this journey.
 */

let sql: Sql;
let fixture: FullFlowFixture;

test.beforeAll(async () => {
  if (
    !DATABASE_URL ||
    DATABASE_URL !== process.env.TEST_DATABASE_URL ||
    process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
    process.env.APP_ENV !== "test" ||
    process.env.NODE_ENV !== "test" ||
    baseURL !== "http://localhost:3189"
  ) {
    throw new Error(
      "FullFlow browser acceptance requires the pinned isolated FullFlow Neon branch and the dedicated app port. Use node scripts/run-fullflow-e2e.mjs.",
    );
  }
  sql = neon(DATABASE_URL) as Sql;
  fixture = await createFullFlowFixture(sql);
});

test.afterAll(async () => {
  if (sql && fixture) {
    await retireFullFlowFixture(sql, fixture);
  }
});

async function singleRow(sqlClient: Sql, query: string, params: unknown[]): Promise<Record<string, any>> {
  const rows = (await sqlClient.query(query, params)) as Array<Record<string, any>>;
  expect(rows.length).toBe(1);
  return rows[0]!;
}

async function rowCount(sqlClient: Sql, query: string, params: unknown[]): Promise<number> {
  const rows = (await sqlClient.query(query, params)) as Array<Record<string, any>>;
  return rows.length;
}

async function waitForAppHydration(page: Page) {
  await page.waitForFunction(() => {
    const runtime = window as any;
    return Boolean(runtime.__TSS_START_OPTIONS__)
      && (!runtime.$_TSR || runtime.$_TSR.hydrated === true);
  }, undefined, { timeout: 120_000 });
}

async function goto(page: Page, url: string) {
  await page.goto(url);
  await waitForAppHydration(page);
}

test("persistent multi-role FullFlow journey", async ({ browser }) => {
  test.setTimeout(600_000);
  let studentPage: Page | undefined;

  await withAuthenticatedPages(browser, {
    operator: fixture.operator.secret,
    publisher: fixture.publisher.secret,
    teacher: fixture.teacher.secret,
    guardian: fixture.guardian.secret,
    unrelatedGuardian: fixture.unrelatedGuardian.secret,
    otherOperator: fixture.otherOperator.secret,
  }, async ({ operator, publisher, teacher, guardian, unrelatedGuardian, otherOperator }) => {
    // ------------------------------------------------------------------
    await test.step("stage 1: operator creates site + high-school extension via launch UI", async () => {
      const page = operator.page;
      page.on("pageerror", error => console.error("[FullFlow page error]", error.message));
      page.on("console", message => {
        if (message.type() === "error") console.error("[FullFlow browser console]", message.text());
      });
      await goto(page, "/operations/launch");
      await page.getByLabel("Host organization").selectOption(fixture.schoolOrgId);
      await expect(page.getByLabel("Site", { exact: true })).toBeEnabled();
      await page.getByLabel("New site name").fill(fixture.siteName);
      await page.getByLabel("New site slug").fill(fixture.siteSlug);
      await page.getByLabel("New site timezone").fill("America/Chicago");
      const createSiteButton = page.getByRole("button", { name: "Create site" });
      await expect(createSiteButton).toBeEnabled({ timeout: 5_000 });
      await createSiteButton.click();
      await expect
        .poll(() => rowCount(sql, "select id from sites where slug = $1", [fixture.siteSlug]))
        .toBe(1);
      const createdSite = await singleRow(
        sql,
        "select id from sites where slug = $1",
        [fixture.siteSlug],
      );
      // Organization-wide scope now includes the new Site and the workspace
      // may reload on that change. Explicitly settle on a fresh, fully
      // hydrated workspace instead of racing that conditional reload.
      await page.reload();
      await waitForAppHydration(page);

      await page.getByLabel("Program type").selectOption("high_school_extension");
      await page.getByLabel("Program name").fill(fixture.programName);
      await page.getByLabel("Program slug").fill(fixture.programSlug);
      await page.getByLabel("Minimum grade").selectOption("9");
      await page.getByLabel("Maximum grade").selectOption("12");
      await page.getByLabel("Asynchronous").check();
      await page.getByLabel("Onsite days per week").fill("2");
      await page.getByLabel("Host organization").selectOption(fixture.schoolOrgId);
      await page.getByLabel("Site", { exact: true }).selectOption(createdSite.id);
      await page.getByLabel("Jurisdiction").selectOption(fixture.jurisdictionId);
      await page.getByLabel("Academic provider organization").selectOption(fixture.schoolOrgId);
      await page.getByLabel("Credit issuing organization").selectOption(fixture.schoolOrgId);
      await page.getByRole("button", { name: "Start launch" }).click();
      await expect(page.getByText(/Launch started\./)).toBeVisible();

      const program = await singleRow(
        sql,
        `select id, site_id, status, type as program_type, jurisdiction_id,
                grade_range->>'min' as grade_min, grade_range->>'max' as grade_max
         from programs where slug = $1`,
        [fixture.programSlug],
      );
      expect(program.status).toBe("launching");
      expect(program.program_type).toBe("high_school_extension");
      expect(program.grade_min).toBe("9");
      expect(program.grade_max).toBe("12");
      expect(program.jurisdiction_id).toBe(fixture.jurisdictionId);
      fixture.programId = program.id;
      fixture.siteId = program.site_id;
      await expect
        .poll(() => rowCount(sql, "select id from journeys where program_id = $1", [fixture.programId!]))
        .toBe(1);

      await pointProgramAtEnrollmentJourney(sql, fixture.programId!, fixture.enrollmentJourneyDefinitionKey);
      await grantSiteScopedOperatorRole(sql, fixture, fixture.siteId!);

      await page.reload();
      await waitForAppHydration(page);
      await expect(page.getByText(fixture.programName).first()).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("stage 1b: school year, term, grading period and calendar via School-year Studio", async () => {
      const page = operator.page;
      await goto(page, `/operations/school-years?siteId=${fixture.siteId}&programId=${fixture.programId}`);
      await page.getByRole("button", { name: /standard A.F scale/i }).click();
      await expect
        .poll(() => rowCount(sql, "select id from grade_scales where owning_organization_id = $1", [fixture.schoolOrgId]))
        .toBe(1);
      const scale = await singleRow(
        sql,
        "select id from grade_scales where owning_organization_id = $1",
        [fixture.schoolOrgId],
      );
      await page.getByLabel("Year name").fill(fixture.schoolYearName);
      await page.getByLabel("Year key").fill(`ff-2026-27-${fixture.suffix}`);
      await page.getByLabel("Starts").fill("2026-08-16");
      await page.getByLabel("Ends").fill("2027-06-04");
      await page.getByLabel(/^Grading scale/).selectOption(scale.id);
      await page.getByRole("button", { name: "Create school year" }).click();
      await expect
        .poll(() => rowCount(sql, "select id from school_years where organization_id = $1", [fixture.schoolOrgId]))
        .toBe(1);
      const year = await singleRow(
        sql,
        "select id from school_years where organization_id = $1",
        [fixture.schoolOrgId],
      );
      fixture.schoolYearId = year.id;
      await page.getByLabel("Term name").fill(`FullFlow Year ${fixture.suffix}`);
      await page.getByLabel("Term key").fill(`ff-term-${fixture.suffix}`);
      await page.getByLabel("Term start").fill("2026-08-16");
      await page.getByLabel("Term end").fill("2027-06-04");
      await page.getByRole("button", { name: "Add term" }).click();
      await expect
        .poll(() => rowCount(sql, "select id from terms where school_year_id = $1", [fixture.schoolYearId!]))
        .toBe(1);
      const term = await singleRow(
        sql,
        "select id from terms where school_year_id = $1",
        [fixture.schoolYearId!],
      );
      fixture.termId = term.id;
      await page.getByRole("button", { name: "Add grading period" }).click();
      await page.getByRole("button", { name: "Create calendar" }).click();
      await page.getByRole("button", { name: "Activate year" }).click();
      await expect
        .poll(async () =>
          (await singleRow(sql, "select status from school_years where id = $1", [fixture.schoolYearId!])).status,
        )
        .toBe("active");
      await createAdmissionSeatPool(sql, {
        programId: fixture.programId!,
        schoolYearId: fixture.schoolYearId!,
        capacity: 24,
      });
    });

    // ------------------------------------------------------------------
    await test.step("stage 2: publisher authors, reviews and releases course + pack via studio UI", async () => {
      const page = publisher.page;
      await goto(page, `/operations/curriculum?programId=${fixture.publisherProgramId}`);
      await page.getByLabel("Course code").fill(fixture.courseCode);
      await page.getByLabel("Course title").fill(fixture.courseTitle);
      await page.getByLabel("Subject").fill("Mathematics");
      await page.getByRole("button", { name: "Create course" }).click();
      await page.getByRole("button", { name: "Create next draft" }).click();
      await page.getByLabel("Syllabus").fill(`FullFlow Algebra I syllabus ${fixture.suffix}`);
      await page.getByRole("button", { name: "Add module" }).click();
      await page.getByLabel("Module title").fill("Expressions and equations");
      await page.getByRole("button", { name: "Add lesson" }).click();
      await page.getByLabel("Lesson title").fill("Solving for x");
      await page
        .getByLabel("Lesson reading")
        .fill("Students isolate the variable by applying inverse operations.");
      await page.getByRole("button", { name: "Save draft" }).click();
      await expect(page.getByText(/saved as draft/i)).toBeVisible();
      await page.getByLabel("Release reason").fill("Initial FullFlow publisher release.");
      await page.getByRole("checkbox", { name: /reviewed this release/i }).check();
      await page.getByRole("button", { name: "Publish curriculum release" }).click();
      await expect
        .poll(async () =>
          rowCount(
            sql,
            `select v.id from course_template_versions v
             join course_templates t on t.id = v.course_template_id
             where t.code = $1 and v.status = 'published'`,
            [fixture.courseCode],
          ),
        )
        .toBe(1);
      const version = await singleRow(
        sql,
        `select v.id, v.curriculum->'modules'->0->'lessons'->0->>'id' as lesson_id
         from course_template_versions v
         join course_templates t on t.id = v.course_template_id
         where t.code = $1 and v.status = 'published'`,
        [fixture.courseCode],
      );
      fixture.courseVersionId = version.id;
      fixture.lessonId = version.lesson_id;
      expect(fixture.lessonId).toBeTruthy();

      await page.getByLabel("Pack name").fill(fixture.packName);
      await page.getByLabel("URL slug").fill(fixture.packSlug);
      await page
        .getByLabel("Publisher description")
        .fill("FullFlow synthetic publisher pack for browser acceptance.");
      await page.getByLabel("Visibility").selectOption("public");
      await page.getByRole("button", { name: "Create pack" }).click();
      await page.getByRole("button", { name: "Create next pack draft" }).click();
      await page.getByRole("checkbox", { name: new RegExp(fixture.courseCode) }).check();
      await page.getByRole("button", { name: "Save course selection" }).click();
      await page.getByLabel("Publication reason").fill("Initial FullFlow pack release.");
      await page
        .getByRole("checkbox", { name: /verified every included publisher course release/i })
        .check();
      await page.getByRole("button", { name: "Publish pack release" }).click();
      await expect(page.getByText(/Pack release published/i)).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("stage 2: school installs and adopts the publisher release", async () => {
      const page = operator.page;
      await goto(page, `/operations/curriculum-marketplace?programId=${fixture.programId}`);
      const card = page
        .locator("article")
        .filter({ has: page.getByRole("heading", { name: fixture.packName }) });
      await card.getByRole("checkbox").first().check();
      await card.getByRole("button", { name: "Add to library" }).click();
      await card.getByRole("button", { name: "Review adoption" }).click();
      await expect(card.getByRole("button", { name: "Confirm curriculum adoption" })).toBeVisible();
      await card.getByRole("checkbox", { name: /I reviewed the publisher/ }).check();
      await card.getByRole("button", { name: "Adopt for this program" }).click();
      await expect(card.getByText(/Release v1 adopted/)).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("stage 2: staffing policy, class provisioning, registration policy, instructor", async () => {
      const page = operator.page;
      await goto(page, `/operations/launch/${fixture.programId}`);
      await page.getByRole("checkbox", { name: new RegExp(fixture.qualificationKey) }).check();
      await page
        .getByRole("checkbox", { name: /I confirm these requirements are reviewed/ })
        .check();
      await page.getByRole("button", { name: "Publish reviewed requirements" }).click();
      await expect(page.getByText(/Teacher qualification policy published/i)).toBeVisible();

      await page.getByLabel("Academic term").selectOption(fixture.termId!);
      await page.getByLabel("Published curriculum").selectOption(fixture.courseVersionId!);
      await page.getByLabel("Class code").fill(`FF-ALG-${fixture.suffix.toUpperCase()}`);
      await page.getByLabel("Class title").fill(fixture.courseTitle);
      await page.getByRole("button", { name: "Create section" }).click();
      await expect
        .poll(() =>
          rowCount(sql, "select id from sections where program_id = $1", [fixture.programId!]),
        )
        .toBe(1);
      const section = await singleRow(
        sql,
        "select id from sections where program_id = $1",
        [fixture.programId!],
      );
      fixture.sectionId = section.id;

      await goto(page, `/operations/course-policies?siteId=${fixture.siteId}&programId=${fixture.programId}`);
      await page.getByLabel("Maximum seats").fill("24");
      await page.getByLabel("Add/drop deadline").fill("2027-10-01");
      await page.getByLabel("Withdrawal deadline").fill("2027-12-01");
      await page.getByRole("button", { name: "Save policy" }).click();
      await expect
        .poll(async () =>
          rowCount(
            sql,
            "select id from section_registration_policies where section_id = $1",
            [fixture.sectionId!],
          ),
        )
        .toBe(1);

      await goto(page, `/operations/launch/${fixture.programId}`);
      await page.getByLabel("Assign instructor").selectOption(fixture.teacher.personId);
      await page.getByRole("button", { name: "Add instructor" }).click();
      await expect
        .poll(async () =>
          rowCount(
            sql,
            `select id from section_teachers
             where section_id = $1 and person_id = $2`,
            [fixture.sectionId!, fixture.teacher.personId],
          ),
        )
        .toBe(1);
      await expect
        .poll(async () =>
          rowCount(
            sql,
            `select id from delivery_arrangements
             where section_id = $1 and instructor_person_id = $2 and status = 'active'`,
            [fixture.sectionId!, fixture.teacher.personId],
          ),
        )
        .toBeGreaterThanOrEqual(1);
    });

    // ------------------------------------------------------------------
    await test.step("stage 3: school-owned launch requirements, activation, opening handoff", async () => {
      const page = operator.page;
      await goto(page, `/operations/launch?siteId=${fixture.siteId}&programId=${fixture.programId}`);
      for (let completed = 1; completed <= 2; completed += 1) {
        await page.getByText("Record this school-owned requirement").first().click();
        const details = page
          .locator("details", { has: page.getByRole("button", { name: "Save school completion" }) })
          .first();
        await details.getByRole("checkbox").check();
        await details.getByRole("button", { name: "Save school completion" }).click();
        await expect
          .poll(async () =>
            rowCount(
              sql,
              `select r.id from journey_requirements r
               join journeys j on j.id = r.journey_id
               where j.program_id = $1 and r.status = 'complete'`,
              [fixture.programId!],
            ),
          )
          .toBeGreaterThanOrEqual(completed);
      }
      await page
        .getByLabel(/Receiving site operator for/)
        .selectOption(fixture.operator.personId);
      await page.getByRole("button", { name: "Activate" }).click();
      await expect
        .poll(async () =>
          (await singleRow(sql, "select status from programs where id = $1", [fixture.programId!])).status,
        )
        .toBe("active");
    });

    // ------------------------------------------------------------------
    await test.step("stage 3: guardian applies through the guardian UI", async () => {
      const page = guardian.page;
      await goto(page, `/guardian/apply?programId=${fixture.programId}`);
      await page.getByLabel("School and program").selectOption(fixture.programId!);
      await page.getByLabel("Application academic year").selectOption(fixture.schoolYearId!);
      await page.getByLabel("Student legal first name").fill(fixture.studentFirstName);
      await page.getByLabel("Student legal last name").fill(fixture.studentLastName);
      await page.getByLabel("Entering grade level").selectOption("9");
      await page.getByRole("button", { name: "Submit application" }).click();
      await expect(page.getByText(/Application received/i)).toBeVisible();
      const application = await singleRow(
        sql,
        "select id, student_profile_id, stage from applications where program_id = $1",
        [fixture.programId!],
      );
      fixture.applicationId = application.id;
      fixture.studentProfileId = application.student_profile_id;
      const profile = await singleRow(
        sql,
        "select person_id from student_profiles where id = $1",
        [fixture.studentProfileId!],
      );
      fixture.studentPersonId = profile.person_id;
    });

    // ------------------------------------------------------------------
    await test.step("stage 3: registrar verification, consent form, offer, acceptance, placement", async () => {
      const page = operator.page;
      const offersUrl = `/guardian/admission-offers?application=${fixture.applicationId}`;

      await goto(page, `/admissions/intake?siteId=${fixture.siteId}&programId=${fixture.programId}`);
      await page.getByRole("button", { name: "Begin eligibility review" }).click();
      const prompts = [
        `Verified against school enrollment record ${fixture.suffix}`,
        "verified_school_record",
      ];
      let promptIndex = 0;
      page.on("dialog", dialog => {
        void dialog.accept(prompts[Math.min(promptIndex++, prompts.length - 1)]!);
      });
      await page.getByRole("button", { name: "Verify guardian relationship" }).click();
      await expect
        .poll(async () => {
          const rows = (await sql.query(
            `select gr.metadata->>'verifiedAt' as verified_at
             from guardian_relationships gr
             join student_profiles sp on sp.person_id = gr.student_person_id
             where sp.id = $1`,
            [fixture.studentProfileId!],
          )) as Array<{ verified_at: string | null }>;
          return rows[0]?.verified_at ?? null;
        })
        .not.toBeNull();

      await goto(guardian.page, offersUrl);
      await guardian.page
        .getByLabel("Contact plan (required)")
        .fill("Email updates and a weekly call.");
      await guardian.page
        .getByLabel("Typed full name (electronic signature)")
        .fill("FullFlow Family Guardian");
      await guardian.page
        .getByRole("checkbox", { name: /I agree to the school statement above/ })
        .check();
      await guardian.page.getByRole("button", { name: "Sign and submit enrollment form" }).click();
      await expect(guardian.page.getByText(/Signed - awaiting registrar review/)).toBeVisible();

      await goto(page, 
        `/admissions/families?siteId=${fixture.siteId}&programId=${fixture.programId}&application=${fixture.applicationId}`,
      );
      await page.getByRole("checkbox", { name: /School enrollment review/ }).check();
      await expect
        .poll(async () =>
          (await singleRow(
            sql,
            `select r.status from journey_requirements r
             join journeys j on j.id = r.journey_id
             where j.participant_type = 'application' and j.participant_id = $1
               and r.key = 'school-review'`,
            [fixture.applicationId!],
          )).status,
        )
        .toBe("complete");
      await page.getByLabel("Form decision").selectOption("accepted");
      await page
        .getByLabel(/Review reason/)
        .fill("Verified FullFlow synthetic enrollment form.");
      await page.getByRole("checkbox", { name: /I confirm this decision/ }).check();
      await page.getByRole("button", { name: "Record form review" }).click();
      await expect(page.getByText(/Registrar decision: accepted/)).toBeVisible();

      await goto(page, `/admissions/intake?siteId=${fixture.siteId}&programId=${fixture.programId}`);
      await expect
        .poll(async () => {
          await page.reload();
      await waitForAppHydration(page);
          return page.getByRole("button", { name: "Approve for offer" }).isEnabled();
        }, { timeout: 30_000 })
        .toBe(true);
      await page.getByRole("button", { name: "Approve for offer" }).click();
      await expect
        .poll(async () =>
          (await singleRow(sql, "select stage from applications where id = $1", [fixture.applicationId!])).stage,
        )
        .toBe("accepted");

      await goto(page, 
        `/admissions?siteId=${fixture.siteId}&programId=${fixture.programId}&application=${fixture.applicationId}`,
      );
      await page.getByRole("button", { name: /Registrar: Issue offer/ }).click();
      await expect
        .poll(() =>
          rowCount(sql, "select id from admission_offers where application_id = $1", [fixture.applicationId!]),
        )
        .toBe(1);
      await goto(guardian.page, offersUrl);
      await guardian.page.getByRole("button", { name: "Accept" }).click();
      await expect(guardian.page.getByText(/acceptance is recorded/i)).toBeVisible();

      await page.reload();
      await waitForAppHydration(page);
      await page.getByLabel("Available section").selectOption(fixture.sectionId!);
      await page.getByRole("button", { name: "Activate enrollment and assign class" }).click();
      await expect(page.getByText(/Assigned: /)).toBeVisible();
      await expect
        .poll(async () =>
          rowCount(
            sql,
            "select id from enrollments where student_profile_id = $1 and status = 'active'",
            [fixture.studentProfileId!],
          ),
        )
        .toBe(2);
      await guardian.page.reload();
      await waitForAppHydration(guardian.page);
      await expect(guardian.page.getByText(/Enrollment is active and classes are assigned/)).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("stage 3/4: student access handoff through the local outbox", async () => {
      const page = operator.page;
      const offersUrl = `/guardian/admission-offers?application=${fixture.applicationId}`;
      await goto(guardian.page, offersUrl);
      await guardian.page.getByLabel("Student's own email address").fill(fixture.studentEmail);
      await guardian.page
        .getByRole("checkbox", { name: /I am the verified parent or legal guardian/ })
        .check();
      await guardian.page.getByRole("button", { name: "Authorize student sign-in request" }).click();
      await expect(guardian.page.getByText(/Guardian authorization received/)).toBeVisible();

      await goto(page, 
        `/admissions?siteId=${fixture.siteId}&programId=${fixture.programId}&application=${fixture.applicationId}`,
      );
      await page.getByLabel("Independent student identity check").selectOption("institutional_school_record");
      await page
        .getByRole("checkbox", { name: /I independently checked the student's identity/ })
        .check();
      await page
        .getByRole("button", { name: "Approve verified student account and send sign-in link" })
        .click();
      await expect(page.getByText(/Student access approved/)).toBeVisible();

      const studentLink = await waitForLocalAccessLink(fixture.studentEmail);
      const studentContext = await browser.newContext({ baseURL });
      studentPage = await studentContext.newPage();
      await goto(studentPage, studentLink);
      await studentPage.getByRole("button", { name: "Sign in securely" }).click();
      await studentPage.waitForURL(/\/student$/);
      const account = await singleRow(
        sql,
        `select a.id from access_accounts a
         join account_person_grants g on g.account_id = a.id
         where g.person_id = $1`,
        [fixture.studentPersonId!],
      );
      fixture.studentAccountId = account.id;
    });

    // ------------------------------------------------------------------
    await test.step("stage 4: teacher authors and assigns; student submits work", async () => {
      const tp = teacher.page;
      await goto(tp, `/teacher/gradebook?section=${fixture.sectionId}&lesson=${fixture.lessonId}`);
      await tp.getByLabel("Title", { exact: true }).fill(`FullFlow Checkpoint ${fixture.suffix}`);
      await tp.getByLabel("Points possible", { exact: true }).fill("10");
      await tp
        .getByLabel("Student assignment instructions")
        .fill("Show your work for solving the equation.");
      await tp.getByLabel("Due date").fill("2026-11-06");
      await tp.getByRole("checkbox", { name: /I reviewed this assignment/ }).check();
      await tp.getByRole("button", { name: "Publish & assign" }).click();
      await expect(tp.getByText(/Assessment published and assigned/)).toBeVisible();
      const assessment = await singleRow(
        sql,
        "select id from assessments where section_id = $1 order by created_at desc limit 1",
        [fixture.sectionId!],
      );
      fixture.assessmentId = assessment.id;

      const sp = studentPage!;
      await goto(sp, `/student/assignments?section=${fixture.sectionId}&assessment=${fixture.assessmentId}`);
      const response = sp
        .getByLabel("Your response")
        .or(sp.getByPlaceholder(/Write your response/));
      await response.fill("x = 7. I subtracted 3 from both sides and divided by 2.");
      await sp.getByRole("button", { name: "Submit assignment" }).click();
      await expect(sp.getByText(/has been submitted/)).toBeVisible();
      await expect
        .poll(async () =>
          rowCount(
            sql,
            "select id from submissions where assessment_id = $1 and student_profile_id = $2",
            [fixture.assessmentId!, fixture.studentProfileId!],
          ),
        )
        .toBe(1);
    });

    // ------------------------------------------------------------------
    await test.step("stage 5: teacher grades, outbox processes, guardian follow-up, operations resolution", async () => {
      const tp = teacher.page;
      await goto(tp, 
        `/teacher/gradebook?section=${fixture.sectionId}&assessment=${fixture.assessmentId}&student=${fixture.studentProfileId}`,
      );
      await tp.getByLabel(/^Score \(0/).fill("9");
      await tp.getByLabel("Feedback comment").fill("Strong work; check the sign on the final step.");
      await tp.getByRole("button", { name: "Post grade" }).click();
      await expect(tp.getByText(/Grade posted/)).toBeVisible();
      await expect
        .poll(async () =>
          rowCount(
            sql,
            `select id from submissions
             where assessment_id = $1 and student_profile_id = $2
               and score is not null and graded_at is not null`,
            [fixture.assessmentId!, fixture.studentProfileId!],
          ),
        )
        .toBe(1);

      const jobsResponse = await operator.context.request.post(`${baseURL}/api/jobs`, {
        headers: { authorization: `Bearer ${TEST_JOB_SECRET}` },
      });
      expect(jobsResponse.ok()).toBe(true);
      await expect
        .poll(async () =>
          rowCount(
            sql,
            "select id from notifications where recipient_person_id = $1 and type ilike '%grade%'",
            [fixture.guardian.personId],
          ),
        )
        .toBeGreaterThanOrEqual(1);

      await goto(guardian.page, 
        `/guardian/academics?student=${fixture.studentPersonId}&section=${fixture.sectionId}&assessment=${fixture.assessmentId}`,
      );
      await expect(guardian.page.getByText("Grade: 9 / 10")).toBeVisible();
      await guardian.page
        .getByLabel("Your question")
        .fill("What should our student review before the next checkpoint?");
      await guardian.page.getByRole("button", { name: "Request school follow-up" }).click();
      // Follow-up notifications refer to their Action, not the assessment.
      const submission = await singleRow(sql,
        "select id from submissions where assessment_id = $1 and student_profile_id = $2",
        [fixture.assessmentId!, fixture.studentProfileId!],
      );
      const followUp = await singleRow(sql,
        `select id from actions
         where type = 'guardian_grade_follow_up' and subject_type = 'student_profile'
           and subject_id = $1 and section_id = $2
           and metadata->>'requestedByGuardianPersonId' = $3
           and metadata->>'submissionId' = $4`,
        [fixture.studentProfileId!, fixture.sectionId!, fixture.guardian.personId, submission.id],
      );
      await expect.poll(() => rowCount(sql,
        `select id from notifications where type = 'guardian_grade_follow_up_requested'
           and resource_type = 'action' and resource_id = $1`,
        [followUp.id],
      )).toBeGreaterThanOrEqual(1);

      await goto(operator.page,
        `/operations?siteId=${fixture.siteId}&programId=${fixture.programId}&action=${followUp.id}`,
      );
      await expect(operator.page.getByText(/Guardian requests grade follow-up/)).toBeVisible();
      operator.page.once("dialog", dialog => {
        void dialog.accept("Followed up with the family and shared review guidance.");
      });
      await operator.page.getByRole("button", { name: "Resolve" }).click();
      await expect.poll(async () =>
        (await singleRow(sql, "select status from actions where id = $1", [followUp.id])).status,
      ).toBe("resolved");
      await expect.poll(() => rowCount(sql,
        `select id from notifications
         where recipient_person_id = $1 and type = 'guardian_grade_follow_up_resolved'
           and resource_type = 'action' and resource_id = $2`,
        [fixture.guardian.personId, followUp.id],
      )).toBeGreaterThanOrEqual(1);
      await guardian.page.reload();
      await waitForAppHydration(guardian.page);
      await expect(guardian.page.getByText(/Followed up with the family/)).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("stage 5b: finalize grade, guardian/student report cards, and issue official transcript", async () => {
      const tp = teacher.page;
      await goto(tp, `/teacher/gradebook?section=${fixture.sectionId}`);
      await expect(tp.getByRole("button", { name: "Finalize grades" })).toBeEnabled();
      await tp.getByRole("button", { name: "Finalize grades" }).click();
      await expect(tp.getByText(/Finalized 1 grade/)).toBeVisible();
      const finalGrade = await singleRow(sql,
        `select id, letter_grade, percentage from section_grades
         where section_id = $1 and student_profile_id = $2 and status = 'finalized'`,
        [fixture.sectionId!, fixture.studentProfileId!],
      );
      expect(Number(finalGrade.percentage)).toBe(90);

      await goto(guardian.page, `/guardian/report-cards?student=${fixture.studentPersonId}`);
      await expect(guardian.page.getByText(fixture.courseTitle).first()).toBeVisible();
      await goto(studentPage!, "/student/report-card");
      await expect(studentPage!.getByText(fixture.courseTitle).first()).toBeVisible();

      await goto(operator.page,
        `/admissions/transcripts?query=${encodeURIComponent(fixture.studentLastName)}`,
      );
      await expect(operator.page.getByText(
        `${fixture.studentFirstName} ${fixture.studentLastName}`,
      )).toBeVisible();
      await operator.page.getByRole("button", { name: "Issue official transcript" }).click();
      await expect(operator.page.getByText(/Official transcript issued for/)).toBeVisible();
      await expect.poll(() => rowCount(sql,
        "select id from transcript_issuances where student_profile_id = $1",
        [fixture.studentProfileId!],
      )).toBe(1);
      await guardian.page.reload();
      await waitForAppHydration(guardian.page);
      await expect(guardian.page.getByText(fixture.courseTitle).first()).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("stage 6: operations record, reload, fresh session, negative checks, revocation", async () => {
      const page = operator.page;
      await goto(page, `/operations?siteId=${fixture.siteId}&programId=${fixture.programId}`);
      await expect(page.getByText(fixture.programName).first()).toBeVisible();
      await expect(page.getByText("Active students")).toBeVisible();
      await expect(page.getByText("Class placements")).toBeVisible();
      await expect(page.getByText("Graded submissions")).toBeVisible();
      await expect(page.getByText("Guardian questions open")).toBeVisible();
      await page.reload();
      await waitForAppHydration(page);
      await expect(page.getByText("Active students")).toBeVisible();
      await expect(page.getByText(fixture.programName).first()).toBeVisible();

      const freshSecret = await createAccessSession(sql, {
        accountId: fixture.operator.accountId,
        activeGrantId: fixture.operator.sessionGrantId,
        expiresAt: new Date(Date.now() + 60 * 60_000),
      });
      const fresh = await openAuthenticatedPage(browser, freshSecret);
      try {
        await goto(fresh.page, `/operations?siteId=${fixture.siteId}&programId=${fixture.programId}`);
        await expect(fresh.page.getByText("Active students")).toBeVisible();
      } finally {
        await fresh.context.close();
      }

      // A separate, authenticated guardian must not access another family's
      // graded work even when supplied the precise student/Section/assessment IDs.
      await goto(
        unrelatedGuardian.page,
        `/guardian/academics?student=${fixture.studentPersonId}&section=${fixture.sectionId}&assessment=${fixture.assessmentId}`,
      );
      await expect(unrelatedGuardian.page.getByText("Grade: 9 / 10")).toHaveCount(0);
      await expect(
        unrelatedGuardian.page.getByRole("button", { name: "Request school follow-up" }),
      ).toHaveCount(0);

      await goto(unrelatedGuardian.page, `/guardian/admission-offers?application=${fixture.applicationId}`);
      await expect(unrelatedGuardian.page.getByRole("alert")).toBeVisible();
      await expect(unrelatedGuardian.page.getByRole("button", { name: "Accept" })).toHaveCount(0);

      for (const denied of [publisher.page, otherOperator.page]) {
        await goto(denied, `/operations?siteId=${fixture.siteId}&programId=${fixture.programId}`);
        await expect(denied.getByText(/authorized staff account|could not be loaded/i)).toBeVisible();
        await expect(denied.getByText(fixture.programName)).toHaveCount(0);
      }

      await sql.query(
        "update access_sessions set revoked_at = now() where account_id = $1",
        [fixture.studentAccountId!],
      );
      await goto(studentPage!, 
        `/student/assignments?section=${fixture.sectionId}&assessment=${fixture.assessmentId}`,
      );
      await expect(studentPage!.getByText(/sign in/i).first()).toBeVisible();
      await expect(studentPage!.getByLabel("Your response")).toHaveCount(0);
    });
  });
});
