import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { type Sql } from "./fixture";
import { createAdmissionsFixture, retireAdmissionsFixture, type AdmissionsFixture } from "./admissions-fixture";
import { createAccessSession, openAuthenticatedPage, withAuthenticatedPages } from "./helpers/authenticated-persona";
import { waitForLocalAccessLink } from "./helpers/local-access-mail";
import { expectDomainEventsOnceForActors } from "./helpers/evidence-assertions";
import {
  expectProtectedPageDenied,
  expectVisibleAfterReload,
} from "./helpers/golden-flow-assertions";
import { DATABASE_URL } from "./env";

let sql: Sql;
let fixture: AdmissionsFixture;

test.beforeAll(async () => {
  if (!DATABASE_URL) throw new Error("Disposable database required.");
  sql = neon(DATABASE_URL);
  fixture = await createAdmissionsFixture(sql);
});
test.afterAll(async () => {
  if (fixture) await retireAdmissionsFixture(sql, fixture);
});

async function signForm(page: Page, corrected = false) {
  await page.getByLabel("Family contact plan (required)").fill(corrected ? "Call after 4pm." : "Call in the morning.");
  await page.getByLabel("Typed full name (electronic signature)").fill("Synthetic Managing Guardian");
  await page.getByLabel("I agree to the school statement above", { exact: false }).check();
  await page.getByRole("button", { name: corrected ? "Sign and resubmit corrected form" : "Sign and submit enrollment form", exact: true }).click();
  await expect(page.getByText("Signed - awaiting registrar review.", { exact: true })).toBeVisible();
}

test("GF2: verified family handoff through separate student learning, feedback and withdrawal", async ({ browser }) => {
  const selected = `siteId=${fixture.siteId}&programId=${fixture.programId}&application=${fixture.applicationId}`;
  const studentEmail = `e2e-student-${fixture.suffix}@example.test`;
  const assignmentTitle = `E2E First Lesson Response ${fixture.suffix}`;
  const firstFeedback = "Clear first response. Add a specific comparison in your revision.";
  const revisedFeedback = "Excellent revision. The comparison is now explicit and complete.";
  await withAuthenticatedPages(browser, {
    guardian: fixture.guardianSecret,
    registrar: fixture.teacherSecret,
  }, async ({ guardian, registrar }) => {
    await guardian.page.goto(`/guardian/admission-offers?application=${fixture.applicationId}`);
    await expect(guardian.page.getByText("School form version: synthetic-browser-v1")).toBeVisible();
    await signForm(guardian.page);

    await registrar.page.goto(`/admissions/families?${selected}`);
    await registrar.page.getByLabel("Form decision").selectOption("rejected");
    await registrar.page.getByLabel("Review reason (visible to the family)").fill("Please provide your afternoon contact plan.");
    await registrar.page.getByLabel("I confirm this decision for the displayed signed submission.").check();
    await registrar.page.getByRole("button", { name: "Record form review", exact: true }).click();
    await expect(registrar.page.getByText("Registrar decision: rejected", { exact: true })).toBeVisible();

    await expectVisibleAfterReload(
      guardian.page,
      guardian.page.getByText("Registrar instructions: Please provide your afternoon contact plan."),
    );
    await signForm(guardian.page, true);
    await registrar.page.reload();
    await registrar.page.getByLabel("Form decision").selectOption("accepted");
    await registrar.page.getByLabel("Review reason (visible to the family)").fill("Corrected synthetic form reviewed.");
    await registrar.page.getByLabel("I confirm this decision for the displayed signed submission.").check();
    await registrar.page.getByRole("button", { name: "Record form review", exact: true }).click();
    await expect(registrar.page.getByText("Registrar decision: accepted", { exact: true })).toBeVisible();

    await registrar.page.goto(`/admissions/intake?${selected}`);
    await registrar.page.getByRole("button", { name: "Waitlist", exact: true }).click();
    await expect(registrar.page.getByRole("button", { name: "Restore to review", exact: true })).toBeVisible();
    await expectVisibleAfterReload(
      guardian.page,
      guardian.page.getByText("Application waitlisted. Contact admissions about availability and next steps."),
    );
    await registrar.page.getByRole("link", { name: "Review this application's offers and enrollment", exact: false }).click();
    await expect(registrar.page.getByRole("button", { name: /Registrar: Issue offer/ })).toHaveCount(0);
    await registrar.page.getByRole("link", { name: "Manage admissions decisions and waitlist", exact: false }).click();
    await registrar.page.getByRole("button", { name: "Restore to review", exact: true }).click();
    await expect(registrar.page.getByRole("button", { name: "Approve for offer", exact: true })).toBeVisible();
    await registrar.page.getByRole("link", { name: "Review this application's offers and enrollment", exact: false }).click();
    await registrar.page.getByRole("button", { name: /Registrar: Issue offer/ }).click();
    await expect(registrar.page.getByText("Waiting for guardian response in the guardian enrollment-offers workspace.")).toBeVisible();

    await guardian.page.reload();
    await guardian.page.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(guardian.page.getByText("Your acceptance is recorded. Admissions must activate enrollment before classes become available.")).toBeVisible();
    await registrar.page.reload();
    // Activation and placement are one canonical action on the accepted offer.
    await registrar.page.getByLabel("Available section").selectOption(fixture.sectionId);
    await registrar.page.getByRole("button", { name: "Activate enrollment and assign class", exact: true }).click();
    await expect(registrar.page.getByText("Assigned: E2E Logic II", { exact: true })).toBeVisible();
    await expectVisibleAfterReload(
      guardian.page,
      guardian.page.getByText("Enrollment is active and classes are assigned.", { exact: true }),
    );

    // No student grant or session exists yet. The verified guardian requests a
    // dedicated learning login; the registrar independently approves that exact
    // application and delivers the real passwordless link to a local outbox.
    await guardian.page.getByLabel("Student's own email address").fill(studentEmail);
    await guardian.page.getByLabel("I am the verified parent or legal guardian", { exact: false }).check();
    await guardian.page.getByRole("button", { name: "Authorize student sign-in request", exact: true }).click();
    await expectVisibleAfterReload(
      guardian.page,
      guardian.page.getByText("Guardian authorization received.", { exact: false }),
    );
    await registrar.page.reload();
    await registrar.page.getByLabel("Independent student identity check").selectOption("institutional_school_record");
    await registrar.page.getByLabel("I independently checked the student's identity", { exact: false }).check();
    await registrar.page.getByRole("button", { name: "Approve verified student account and send sign-in link", exact: true }).click();
    await expect(registrar.page.getByText("Student access approved.", { exact: false })).toBeVisible();

    const studentGrants = await sql.query(
      `select id, person_id, role, active, is_synthetic from account_person_grants
       where account_id = $1`, [fixture.studentAccountId]);
    expect(studentGrants).toEqual([{
      id: expect.any(String), person_id: fixture.studentPersonId, role: "student",
      active: true, is_synthetic: false,
    }]);
    fixture.studentGrantId = studentGrants[0]!.id as string;
    const consents = await sql.query(
      `select student_profile_id, guardian_person_id, status, reviewed_by_person_id
       from student_access_consents where application_id = $1`, [fixture.applicationId]);
    expect(consents).toEqual([{
      student_profile_id: fixture.studentProfileId, guardian_person_id: fixture.guardianPersonId,
      status: "approved", reviewed_by_person_id: fixture.teacherPersonId,
    }]);

    const studentLink = await waitForLocalAccessLink(studentEmail);
    const studentContext = await browser.newContext({ baseURL: new URL(studentLink).origin });
    const studentPage = await studentContext.newPage();
    const teacherSecret = await createAccessSession(sql, {
      accountId: fixture.teacherAccountId,
      activeGrantId: fixture.teacherProviderGrantId,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
    });
    const teacher = await openAuthenticatedPage(browser, teacherSecret);
    try {
      await studentPage.goto(studentLink);
      await studentPage.getByRole("button", { name: "Sign in securely", exact: true }).click();
      await studentPage.waitForURL(/\/student$/);
      await studentPage.goto("/student/courses");
      await expect(studentPage.getByText("E2E Logic II", { exact: true }).first()).toBeVisible();
      await expectProtectedPageDenied(studentPage, `/admissions?${selected}`, {
        denial: studentPage.getByRole("alert"),
        message: "registrar",
        protectedContent: ["Registrar: Issue offer"],
      });

      // The separately authenticated, authorized teacher authors the first real
      // assignment from the published lesson; no submission is seeded.
      await teacher.page.goto(`/teacher/gradebook?section=${fixture.sectionId}&lesson=e2e-lesson-1`);
      await teacher.page.getByLabel("Title", { exact: true }).fill(assignmentTitle);
      await teacher.page.getByLabel("Points possible", { exact: true }).fill("10");
      await teacher.page.getByLabel("Student assignment instructions").fill("Compare the two expressions from the first lesson and explain your reasoning.");
      await teacher.page.getByLabel("Due date", { exact: true }).fill(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
      await teacher.page.getByLabel("I reviewed this assignment", { exact: false }).check();
      await teacher.page.getByRole("button", { name: "Publish & assign", exact: true }).click();
      await expect(teacher.page.getByText("Assessment published and assigned to enrolled students.")).toBeVisible();
      const assessments = await sql.query("select id from assessments where section_id = $1 and title = $2", [fixture.sectionId, assignmentTitle]);
      expect(assessments).toHaveLength(1);
      const assessmentId = assessments[0]!.id as string;
      const studentAssessment = `/student/assignments?section=${fixture.sectionId}&assessment=${assessmentId}`;
      const teacherAssessment = `/teacher/gradebook?section=${fixture.sectionId}&assessment=${assessmentId}&student=${fixture.studentProfileId}`;

      await studentPage.goto(studentAssessment);
      await studentPage.getByLabel("Your response").fill("The expressions are equivalent because both simplify to the same value.");
      await studentPage.getByRole("button", { name: "Submit assignment", exact: true }).click();
      await expect(studentPage.getByText("Your assignment has been submitted.")).toBeVisible();
      await expectVisibleAfterReload(
        studentPage,
        studentPage.getByText("Your submission is not currently editable. Review its status and feedback above."),
      );
      const submissions = await sql.query(
        "select id, status, attempt_number from submissions where assessment_id = $1 and student_profile_id = $2",
        [assessmentId, fixture.studentProfileId]);
      expect(submissions).toEqual([{ id: expect.any(String), status: "submitted", attempt_number: 1 }]);

      await teacher.page.goto(teacherAssessment);
      await teacher.page.getByLabel(/^Score \(0/).fill("9");
      await teacher.page.getByLabel("Feedback comment").fill(firstFeedback);
      await teacher.page.getByRole("button", { name: "Post grade", exact: true }).click();
      await expect(teacher.page.getByText("Grade posted.", { exact: true })).toBeVisible();
      await expectVisibleAfterReload(studentPage, studentPage.getByText(firstFeedback, { exact: true }));

      const guardianAcademics = `/guardian/academics?student=${fixture.studentPersonId}&section=${fixture.sectionId}&assessment=${assessmentId}`;
      await guardian.page.goto(guardianAcademics);
      await expect(guardian.page.getByText("Grade: 9 / 10", { exact: true })).toBeVisible();
      await expectVisibleAfterReload(guardian.page, guardian.page.getByText(`Teacher feedback: ${firstFeedback}`, { exact: true }));

      await teacher.page.goto(teacherAssessment);
      await teacher.page.getByRole("button", { name: "Return for revision", exact: true }).click();
      await expect(teacher.page.getByText("Assignment returned to student for revision.")).toBeVisible();
      await studentPage.reload();
      await studentPage.getByLabel("Your response").fill("After simplifying both sides, the expressions have identical coefficients and constants.");
      await studentPage.getByRole("button", { name: "Submit assignment", exact: true }).click();
      await expect(studentPage.getByText("Your assignment has been submitted.")).toBeVisible();
      await teacher.page.goto(teacherAssessment);
      await teacher.page.getByLabel(/^Score \(0/).fill("10");
      await teacher.page.getByLabel("Feedback comment").fill(revisedFeedback);
      await teacher.page.getByRole("button", { name: "Post grade", exact: true }).click();
      await expect(teacher.page.getByText("Grade posted.", { exact: true })).toBeVisible();
      await expectVisibleAfterReload(studentPage, studentPage.getByText(revisedFeedback, { exact: true }));
      await guardian.page.reload();
      await expect(guardian.page.getByText("Grade: 10 / 10", { exact: true })).toBeVisible();
      await expect(guardian.page.getByText(`Teacher feedback: ${revisedFeedback}`, { exact: true })).toBeVisible();

      // Withdrawal is a student request plus registrar decision through the
      // existing course-registration commands. Historical graded attempts stay
      // persisted, but current student and guardian learning views close.
      await studentPage.goto(`/student/courses?view=catalog&section=${fixture.sectionId}`);
      await studentPage.getByRole("button", { name: "Request withdrawal", exact: true }).click();
      await expect(studentPage.getByText("Withdrawal request sent for review.")).toBeVisible();
      await registrar.page.goto(`/student/courses?view=catalog&section=${fixture.sectionId}`);
      await registrar.page.getByRole("button", { name: "Approve", exact: true }).click();
      await expect(registrar.page.getByText("Enrollment decision recorded.")).toBeVisible();
      await studentPage.goto(studentAssessment);
      await expect(studentPage.getByText("No assignments in this view.")).toBeVisible();
      await guardian.page.reload();
      await expect(guardian.page.getByText("No published assignments found.")).toBeVisible();
      const withdrawn = await sql.query(
        `select status, metadata from enrollments
         where student_profile_id = $1 and section_id = $2 and kind = 'section'`,
        [fixture.studentProfileId, fixture.sectionId]);
      expect(withdrawn).toHaveLength(1);
      expect(withdrawn[0]).toMatchObject({ status: "withdrawn", metadata: { withdrawalNotation: "W" } });
      const retainedAttempts = await sql.query(
        "select status, attempt_number from submissions where assessment_id = $1 and student_profile_id = $2 order by attempt_number",
        [assessmentId, fixture.studentProfileId]);
      expect(retainedAttempts).toEqual([
        { status: "returned", attempt_number: 1 },
        { status: "graded", attempt_number: 2 },
      ]);
    } finally {
      await Promise.all([studentContext.close(), teacher.context.close()]);
    }

    const applications = await sql.query("select household_id, student_profile_id, stage from applications where id = $1", [fixture.applicationId]);
    expect(applications).toEqual([{ household_id: fixture.householdId, student_profile_id: fixture.studentProfileId, stage: "accepted" }]);
    const requirements = await sql.query("select status, evidence from journey_requirements where id = $1", [fixture.requirementId]);
    expect(requirements).toHaveLength(1);
    const requirement = requirements[0];
    if (!requirement) throw new Error("Browser enrollment form evidence is missing.");
    expect(requirement.status).toBe("complete");
    const evidence = requirement.evidence as Array<{ kind: string }>;
    expect(evidence.filter(entry => entry.kind === "enrollment_form_submission")).toHaveLength(2);
    expect(evidence.filter(entry => entry.kind === "enrollment_form_review")).toHaveLength(2);
    const enrollmentKinds = await sql.query(
      "select kind, status from enrollments where student_profile_id = $1", [fixture.studentProfileId]);
    expect(enrollmentKinds).toEqual(expect.arrayContaining([
      { kind: "program", status: "active" }, { kind: "section", status: "withdrawn" },
    ]));
    await expectDomainEventsOnceForActors(sql, {
      actorPersonIds: [fixture.guardianPersonId, fixture.teacherPersonId],
      eventTypes: ["AdmissionOfferIssued", "AdmissionOfferAccepted", "EnrollmentActivated"],
    });
  });
});
