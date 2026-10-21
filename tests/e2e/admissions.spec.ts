import { expect, test, type Browser, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { accessSessionCookie, type Sql } from "./fixture";
import { createAdmissionsFixture, retireAdmissionsFixture, type AdmissionsFixture } from "./admissions-fixture";
import { DATABASE_URL, baseURL } from "./env";

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

async function signedIn(browser: Browser, secret: string) {
  const context = await browser.newContext({ baseURL });
  await context.addCookies([{ name: accessSessionCookie, value: secret, domain: "localhost", path: "/",
    httpOnly: true, secure: true, sameSite: "Lax" }]);
  return { context, page: await context.newPage() };
}

async function signForm(page: Page, corrected = false) {
  await page.getByLabel("Family contact plan (required)").fill(corrected ? "Call after 4pm." : "Call in the morning.");
  await page.getByLabel("Typed full name (electronic signature)").fill("Synthetic Managing Guardian");
  await page.getByLabel("I agree to the school statement above", { exact: false }).check();
  await page.getByRole("button", { name: corrected ? "Sign and resubmit corrected form" : "Sign and submit enrollment form", exact: true }).click();
  await expect(page.getByText("Signed - awaiting registrar review.", { exact: true })).toBeVisible();
}

test("GF2: guardian correction and registrar review through accepted offer, active enrollment and class access", async ({ browser }) => {
  const guardian = await signedIn(browser, fixture.guardianSecret);
  const registrar = await signedIn(browser, fixture.teacherSecret);
  const student = await signedIn(browser, fixture.studentSecret);
  const selected = `siteId=${fixture.siteId}&programId=${fixture.programId}&application=${fixture.applicationId}`;
  try {
    await guardian.page.goto(`/guardian/admission-offers?application=${fixture.applicationId}`);
    await expect(guardian.page.getByText("School form version: synthetic-browser-v1")).toBeVisible();
    await signForm(guardian.page);

    await registrar.page.goto(`/admissions/families?${selected}`);
    await registrar.page.getByLabel("Form decision").selectOption("rejected");
    await registrar.page.getByLabel("Review reason (visible to the family)").fill("Please provide your afternoon contact plan.");
    await registrar.page.getByLabel("I confirm this decision for the displayed signed submission.").check();
    await registrar.page.getByRole("button", { name: "Record form review", exact: true }).click();
    await expect(registrar.page.getByText("Registrar decision: rejected", { exact: true })).toBeVisible();

    await guardian.page.reload();
    await expect(guardian.page.getByText("Registrar instructions: Please provide your afternoon contact plan.")).toBeVisible();
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
    await guardian.page.reload();
    await expect(guardian.page.getByText("Application waitlisted. Contact admissions about availability and next steps.")).toBeVisible();
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
    await registrar.page.getByRole("button", { name: "Registrar: Activate enrollment", exact: true }).click();
    await expect(registrar.page.getByText("Enrollment active", { exact: false })).toBeVisible();
    await guardian.page.reload();
    await expect(guardian.page.getByText("Enrollment is active. Admissions will arrange your classes next.")).toBeVisible();

    await registrar.page.getByRole("button", { name: "Choose courses", exact: true }).click();
    await registrar.page.getByLabel("Available section").selectOption(fixture.sectionId);
    await registrar.page.getByRole("button", { name: "Assign student", exact: true }).click();
    await expect(registrar.page.getByText("Assigned: E2E Logic II", { exact: true })).toBeVisible();
    await guardian.page.reload();
    await expect(guardian.page.getByText("Enrollment is active and classes are assigned.", { exact: true })).toBeVisible();
    await student.page.goto("/student/courses");
    await expect(student.page.getByText("E2E Logic II", { exact: true }).first()).toBeVisible();
    await student.page.goto(`/admissions?${selected}`);
    await expect(student.page.getByRole("alert")).toContainText("registrar");

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
    const enrollments = await sql.query("select kind from enrollments where student_profile_id = $1 and status = 'active' order by kind", [fixture.studentProfileId]);
    expect(enrollments).toEqual([{ kind: "program" }, { kind: "section" }]);
    const events = await sql.query("select event_type from domain_events where actor_person_id = any($1::uuid[])",
      [[fixture.guardianPersonId, fixture.teacherPersonId]]);
    for (const type of ["AdmissionOfferIssued", "AdmissionOfferAccepted", "EnrollmentActivated"])
      expect(events.filter(event => event.event_type === type)).toHaveLength(1);
  } finally {
    await Promise.all([guardian.context.close(), registrar.context.close(), student.context.close()]);
  }
});

test("GF22: family saves, reloads and submits the same application into registrar intake", async ({ browser }) => {
  const guardian = await signedIn(browser, fixture.guardianSecret);
  const registrar = await signedIn(browser, fixture.teacherSecret);
  guardian.page.setDefaultTimeout(20_000);
  registrar.page.setDefaultTimeout(20_000);
  try {
    await registrar.page.goto(`/admissions/intake?programId=${fixture.programId}`);
    const publication = registrar.page.locator("section").filter({
      has: registrar.page.getByRole("heading", { name: "Family online applications", exact: true }),
    }).locator("div").filter({ hasText: "E2E High School" });
    await publication.getByRole("button", { name: "Open applications", exact: true }).click();
    await expect(publication.getByRole("link", { name: "Family application link" }))
      .toHaveAttribute("href", `/apply?program=${fixture.programId}`);

    await guardian.page.goto(`/apply?program=${fixture.programId}`);
    await guardian.page.waitForLoadState("networkidle");
    await guardian.page.getByRole("button", { name: "Start an application", exact: true }).click();
    await expect(guardian.page.getByLabel("Date of birth", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await guardian.page.getByLabel("Student first name", { exact: true }).fill("Browser");
    await guardian.page.getByLabel("Student last name", { exact: true }).fill(`Applicant-${fixture.suffix}`);
    await guardian.page.getByRole("combobox", { name: "Entering grade", exact: true }).selectOption("9");
    await guardian.page.getByLabel("Date of birth", { exact: true }).fill("2011-04-12");
    await expect(guardian.page.getByLabel("Date of birth", { exact: true })).toHaveAttribute("aria-invalid", "false");
    await guardian.page.getByLabel("Primary language", { exact: true }).fill("English");
    await guardian.page.getByLabel("Requested school year", { exact: true }).fill("2026-2027");
    await guardian.page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(guardian.page.getByText("Draft saved. Review it and submit when ready.", { exact: true })).toBeVisible();
    await guardian.page.reload();
    await guardian.page.waitForLoadState("networkidle");
    await guardian.page.getByRole("button", { name: "Continue draft", exact: true }).click();
    const editor = guardian.page.getByRole("region", { name: "Application packet", exact: true });
    await expect(editor).toBeFocused();
    await expect(editor.getByRole("heading", { name: "Edit application draft", exact: true })).toBeInViewport({ ratio: 1 });
    // Reopening the already selected draft must also reveal its editor.
    await guardian.page.getByRole("button", { name: "Continue draft", exact: true }).click();
    await expect(editor).toBeFocused();
    await expect(editor.getByRole("heading", { name: "Edit application draft", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(guardian.page.getByLabel("Date of birth", { exact: true })).toHaveValue("2011-04-12");
    await guardian.page.getByRole("button", { name: "Review and submit", exact: true }).click();
    await expect(guardian.page.getByRole("button", { name: "Submit application", exact: true })).toBeDisabled();
    await expect(guardian.page.getByText("Before you can submit", { exact: true })).toBeVisible();
    await guardian.page.getByRole("button", { name: "Family and households", exact: false }).click();
    const household = guardian.page.getByRole("region", { name: "Household 1", exact: true });
    await household.getByLabel("Household name", { exact: true }).fill("Synthetic Browser Household");
    await household.getByLabel("Address line 1", { exact: true }).fill("123 Example Lane");
    await household.getByLabel("City", { exact: true }).fill("Example City");
    await household.getByLabel("State / province", { exact: true }).fill("CA");
    await household.getByLabel("Postal code", { exact: true }).fill("90000");
    await household.getByLabel("Country", { exact: true }).fill("US");
    await household.getByLabel("Contact first name", { exact: true }).fill("Morgan");
    await household.getByLabel("Contact last name", { exact: true }).fill("Example");
    await household.getByLabel("Relationship to student", { exact: true }).fill("Parent");
    await household.getByLabel("Contact email", { exact: true }).fill("dsdsfds");
    await household.getByLabel("Contact phone", { exact: true }).fill("202-555-0100");
    await expect(household.getByLabel("Contact email", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(household.getByLabel("Contact email", { exact: true })).toHaveClass(/border-red-600/);
    await guardian.page.getByRole("button", { name: "Add second household", exact: true }).click();
    await expect(guardian.page.getByRole("region", { name: "Household 2", exact: true })).toBeVisible();
    await guardian.page.getByRole("button", { name: "Remove household 2", exact: true }).click();
    await guardian.page.getByRole("button", { name: "Add sibling", exact: true }).click();
    await guardian.page.getByLabel("Sibling full name", { exact: true }).fill("Synthetic Sibling");
    await guardian.page.getByLabel("Sibling grade / age", { exact: true }).fill("6");
    await guardian.page.getByLabel("Sibling school or not attending", { exact: true }).fill("Example School");
    await guardian.page.getByRole("button", { name: "Previous schools and interests", exact: false }).click();
    await guardian.page.getByRole("button", { name: "Add previous school", exact: true }).click();
    await guardian.page.getByLabel("School name", { exact: true }).fill("Example Middle School");
    await guardian.page.getByLabel("School city / country", { exact: true }).fill("Example City, US");
    await guardian.page.getByLabel("Last grade attended", { exact: true }).fill("8");
    await guardian.page.getByLabel("Reason for leaving", { exact: true }).fill("Entering high school");
    await guardian.page.getByLabel("Student's learning interests", { exact: true }).fill("Science and music");
    await guardian.page.getByRole("textbox", { name: "Why are you interested in this program?", exact: true })
      .fill("Synthetic browser test: updated interest in project learning.");
    await guardian.page.getByRole("button", { name: "Review and submit", exact: true }).click();
    await expect(guardian.page.getByText("Example Middle School", { exact: true })).toBeVisible();
    await expect(guardian.page.getByText("123 Example Lane", { exact: false })).toBeVisible();
    await guardian.page.getByRole("button", { name: "Household 1: Enter a valid contact email", exact: true }).click();
    await expect(household.getByLabel("Contact email", { exact: true })).toBeFocused();
    await expect(household.getByLabel("Contact email", { exact: true })).toHaveAttribute("aria-describedby", /.+-error/);
    await guardian.page.getByRole("button", { name: "Review and submit", exact: true }).click();
    await expect(guardian.page.getByRole("button", { name: "Family and households", exact: false })).not.toContainText("Ready");
    await guardian.page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(guardian.page.getByRole("alert")).toContainText("Correct the highlighted invalid fields");
    await expect(household.getByLabel("Contact email", { exact: true })).toBeFocused();
    await household.getByLabel("Contact email", { exact: true }).fill("morgan@example.test");
    await expect(household.getByLabel("Contact email", { exact: true })).toHaveAttribute("aria-invalid", "false");
    await guardian.page.getByRole("button", { name: "Review and submit", exact: true }).click();
    await expect(guardian.page.getByText("Before you can submit", { exact: true })).toHaveCount(0);
    await expect(guardian.page.getByText("Your latest changes will be saved when you submit.", { exact: true })).toBeVisible();
    await expect(guardian.page.getByRole("button", { name: "Submit application", exact: true })).toBeDisabled();
    await guardian.page.getByRole("checkbox").check();
    await guardian.page.getByRole("button", { name: "Submit application", exact: true }).click();
    await expect(guardian.page.getByText("Application submitted. The school will review it; your student is not enrolled yet.", { exact: true })).toBeVisible();
    await guardian.page.reload();
    await expect(guardian.page.getByText("Status: application", { exact: true })).toBeVisible();
    await expect(guardian.page.getByText("Guardian relationship verification is pending.", { exact: false })).toBeVisible();
    await guardian.page.getByText("View submitted application packet", { exact: true }).click();
    await expect(guardian.page.getByText("Example Middle School", { exact: true })).toBeVisible();

    const rows = await sql.query(`select a.id, a.student_profile_id, a.stage, a.submitted_at,
      a.metadata->>'applicantVersion' as version, r.can_view_academics, r.can_manage_enrollment,
      r.can_submit_attendance_excuse
      from applications a join student_profiles sp on sp.id = a.student_profile_id
      join guardian_relationships r on r.student_person_id = sp.person_id and r.guardian_person_id = a.submitted_by_person_id
      where a.program_id = $1 and a.submitted_by_person_id = $2 and a.metadata->>'origin' = 'family_application'`,
    [fixture.programId, fixture.guardianPersonId]);
    expect(rows).toHaveLength(1);
    const application = rows[0];
    if (!application) throw new Error("Family application was not persisted.");
    expect(application).toMatchObject({ stage: "application", version: "2",
      can_view_academics: false, can_manage_enrollment: false, can_submit_attendance_excuse: false });
    expect(application.submitted_at).not.toBeNull();
    expect(await sql.query("select id from enrollments where student_profile_id = $1", [application.student_profile_id])).toEqual([]);
    expect(await sql.query("select id from domain_events where aggregate_id = $1 and event_type = 'ApplicationSubmitted'", [application.id])).toHaveLength(1);
    expect(await sql.query("select id from audit_events where resource_id = $1 and action = 'admissions.application.submitted'", [application.id])).toHaveLength(1);
    const packetJourneys = await sql.query("select id, status from journeys where participant_type = 'admissions_application' and participant_id = $1", [application.id]);
    expect(packetJourneys).toEqual([expect.objectContaining({ status: "ready" })]);
    await registrar.page.goto(`/admissions/intake?programId=${fixture.programId}&application=${application.id}`);
    await registrar.page.waitForLoadState("networkidle");
    const intake = registrar.page.locator("article").filter({ hasText: `Applicant-${fixture.suffix}` });
    await expect(intake).toContainText("Synthetic browser test: updated interest in project learning.");
    await expect(intake).toContainText("application");
    await intake.getByText("Review application packet", { exact: true }).click();
    await expect(intake).toContainText("Example Middle School");
    await expect(intake).toContainText("Synthetic Sibling");
    await registrar.page.goto(`/admissions?programId=${fixture.programId}`);
    await expect(registrar.page.getByRole("row").filter({ hasText: `Applicant-${fixture.suffix}` })).toContainText("application");
  } finally {
    await Promise.all([guardian.context.close(), registrar.context.close()]);
  }
});
