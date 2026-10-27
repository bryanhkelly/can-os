import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { type Sql } from "./fixture";
import { createAdmissionsFixture, retireAdmissionsFixture, type AdmissionsFixture } from "./admissions-fixture";
import { withAuthenticatedPages } from "./helpers/authenticated-persona";
import {
  expectActiveEnrollmentKinds,
  expectDomainEventsOnceForActors,
} from "./helpers/evidence-assertions";
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

test("GF2: guardian correction and registrar review through accepted offer, active enrollment and class access", async ({ browser }) => {
  const selected = `siteId=${fixture.siteId}&programId=${fixture.programId}&application=${fixture.applicationId}`;
  await withAuthenticatedPages(browser, {
    guardian: fixture.guardianSecret,
    registrar: fixture.teacherSecret,
    student: fixture.studentSecret,
  }, async ({ guardian, registrar, student }) => {
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
    await student.page.goto("/student/courses");
    await expect(student.page.getByText("E2E Logic II", { exact: true }).first()).toBeVisible();
    await expectProtectedPageDenied(student.page, `/admissions?${selected}`, {
      denial: student.page.getByRole("alert"),
      message: "registrar",
      protectedContent: ["Registrar: Issue offer"],
    });

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
    await expectActiveEnrollmentKinds(sql, {
      studentProfileId: fixture.studentProfileId,
      kinds: ["program", "section"],
    });
    await expectDomainEventsOnceForActors(sql, {
      actorPersonIds: [fixture.guardianPersonId, fixture.teacherPersonId],
      eventTypes: ["AdmissionOfferIssued", "AdmissionOfferAccepted", "EnrollmentActivated"],
    });
  });
});
