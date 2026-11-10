import { expect, test, type Page } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import type { Sql } from "./fixture";
import { createAccessSession, openAuthenticatedPage, type AuthenticatedPage } from "./helpers/authenticated-persona";
import { waitForLocalAccessLink } from "./helpers/local-access-mail";
import { baseURL, DATABASE_URL } from "./env";

/**
 * Public Valor website -> verified family application -> enrollment activation.
 *
 * Valor is the canonical synthetic demo tenant. Its public verified-application
 * flow is suppressed outside the isolated synthetic sandbox (test runtime with
 * the local access-mail outbox); this suite runs only through
 * `node scripts/run-admissions-e2e.mjs` against an attested disposable branch.
 * Fixture rows mirror scripts/seeds/public-family-admissions-v1.sql and
 * scripts/seeds/valor-admissions-placement-v1.sql (same fixed UUIDs), so the
 * suite self-provisions idempotently when the seed chain has not been applied.
 */
const VALOR = {
  slug: "valorschool",
  organizationId: "f1000000-0000-4000-8000-000000000002",
  siteId: "f1000000-0000-4000-8000-000000000003",
  programId: "f1000000-0000-4000-8000-000000000004",
  schoolYearId: "f1000000-0000-4000-8000-000000000009",
  /** English Literature (ENG-S): published curriculum with a first lesson. */
  sectionId: "f1000000-0000-4000-8000-000000000040",
  sectionTitle: "English Literature",
  teacherPersonId: "f1000000-0000-4000-8000-000000000006",
  teacherAccountId: "fa000000-0000-4000-8000-000000000002",
  jurisdictionId: "f1000000-0000-4000-8000-000000000001",
  registrarAccountId: "f7000000-0000-4000-8000-000000000002",
  registrarGrantId: "f7000000-0000-4000-8000-000000000003",
} as const;

const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 2).toString(36)}`;
const guardianEmail = `valor-e2e-family-${suffix}@example.test`;
const studentLastName = `Applicant${suffix}`;

let sql: Sql;
let registrarSecret: string;
const run: { applicationId?: string; studentProfileId?: string; guardianAccountId?: string } = {};

async function ensureValorSandboxFixture(executor: Sql) {
  // Same fixed identifiers as the committed seed files; every statement is
  // idempotent so repeated runs and seed-chain pre-application both converge.
  await executor.transaction([
    executor.query(`insert into journey_definitions
      (id, key, version, owning_organization_id, audience, title, active, configuration)
      values ('fd100000-0000-4000-8000-000000000001','family-enrollment','1',$1,'family','Valor family enrollment', true, $2::jsonb)
      on conflict (key, version) do nothing`,
    [VALOR.organizationId, JSON.stringify({ requirements: [
      { key: "school-review", title: "School enrollment review", blocking: true, owner: "partner" },
      { key: "school-consent", title: "School enrollment form", blocking: true, owner: "family",
        enrollmentForm: {
          version: "valor-family-v1",
          instructions: "Synthetic Valor enrollment form. This is not a real school agreement.",
          consent: "I confirm this synthetic Valor enrollment agreement.",
          fields: [{ key: "contact_plan", label: "Family contact plan", type: "text", required: true }],
        } },
    ] })]),
    executor.query(`insert into role_assignments
      (id, person_id, organization_id, site_id, program_id, role_key, capabilities)
      values ('fd200000-0000-4000-8000-000000000001',$1,$2,$3,$4,'teacher','["academic_instruction","curriculum"]'::jsonb)
      on conflict (id) do nothing`,
    [VALOR.teacherPersonId, VALOR.organizationId, VALOR.siteId, VALOR.programId]),
    executor.query(`update access_accounts
      set email_verified_at = coalesce(email_verified_at, now()), updated_at = now()
      where id = $1 and disabled = false`, [VALOR.teacherAccountId]),
    executor.query(`insert into qualification_definitions (id, key, kind, title)
      values ('fd200000-0000-4000-8000-000000000002','valor-teaching-license','license','Valor Synthetic Teaching License')
      on conflict (id) do nothing`, []),
    executor.query(`insert into qualification_claims
      (id, person_id, definition_id, issuer_name, jurisdiction_id, issued_at, expires_at, details)
      values ('fd200000-0000-4000-8000-000000000003',$1,'fd200000-0000-4000-8000-000000000002','Valor Synthetic Issuer',$2,null,null,'{"synthetic":true}'::jsonb)
      on conflict (id) do nothing`, [VALOR.teacherPersonId, VALOR.jurisdictionId]),
    executor.query(`insert into qualification_verification_events
      (id, claim_id, sequence, decision, actor_person_id)
      values ('fd200000-0000-4000-8000-000000000004','fd200000-0000-4000-8000-000000000003',1,'approve',$1)
      on conflict (id) do nothing`, [VALOR.teacherPersonId]),
    executor.query(`insert into compliance_frameworks (id, key, name, authority)
      values ('fd200000-0000-4000-8000-000000000005','valor-staff-readiness','Valor Staff Readiness','CAN Synthetic Only')
      on conflict (id) do nothing`, []),
    executor.query(`insert into compliance_framework_versions (id, framework_id, version, status)
      values ('fd200000-0000-4000-8000-000000000006','fd200000-0000-4000-8000-000000000005','1','published')
      on conflict (id) do nothing`, []),
    executor.query(`insert into compliance_policy_rules
      (id, framework_version_id, code, description, expression, evidence_policy)
      values ('fd200000-0000-4000-8000-000000000007','fd200000-0000-4000-8000-000000000006','VALOR-LICENSE',
        'Valor synthetic teaching license for isolated acceptance runs',
        '{"op":"credential","type":"valor-teaching-license"}'::jsonb,'{}'::jsonb)
      on conflict (id) do nothing`, []),
    executor.query(`insert into compliance_policy_applicability
      (id, framework_version_id, organization_id, site_id, program_id, jurisdiction_id, role_key)
      values ('fd200000-0000-4000-8000-000000000008','fd200000-0000-4000-8000-000000000006',$1,$2,$3,$4,'teacher')
      on conflict (id) do nothing`,
    [VALOR.organizationId, VALOR.siteId, VALOR.programId, VALOR.jurisdictionId]),
    executor.query(`insert into delivery_arrangements
      (id, section_id, academic_provider_organization_id, instructor_person_id,
       modality, status, effective_from, effective_through, metadata)
      values ('fd200000-0000-4000-8000-000000000009',$1,$2,$3,'hybrid','active',
        '2026-08-01T00:00:00Z','2027-06-30T00:00:00Z','{"synthetic":true,"fixture":"valor-admissions-placement-v1"}'::jsonb)
      on conflict (id) do nothing`,
    [VALOR.sectionId, VALOR.organizationId, VALOR.teacherPersonId]),
    executor.query(`insert into section_registration_policies
      (section_id, enrollment_capacity, add_drop_ends_on, withdrawal_ends_on)
      values ($1, 25, '2027-06-30', '2027-06-30')
      on conflict (section_id) do nothing`, [VALOR.sectionId]),
  ]);
}

test.beforeAll(async () => {
  if (process.env.APP_ENV !== "test" || process.env.NODE_ENV !== "test" ||
      process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
      !process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)
    throw new Error("Valor public-enrollment browser acceptance requires the guarded disposable database runner.");
  if (!DATABASE_URL) throw new Error("Disposable database required.");
  sql = neon(DATABASE_URL);
  await ensureValorSandboxFixture(sql);
  registrarSecret = await createAccessSession(sql, {
    accountId: VALOR.registrarAccountId,
    activeGrantId: VALOR.registrarGrantId,
    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
  });
});

test.afterAll(async () => {
  if (!sql) return;
  // Free the consumed seat-pool and section seats, then retire every
  // family credential this run created; the shared registrar demo account
  // only loses the synthetic session issued above.
  if (run.studentProfileId) {
    await sql.query("delete from enrollments where student_profile_id = $1", [run.studentProfileId]);
  }
  if (run.applicationId) {
    await sql.query("delete from admission_offers where application_id = $1", [run.applicationId]);
    await sql.query("update applications set stage = 'withdrawn', updated_at = now() where id = $1", [run.applicationId]);
  }
  await sql.query("delete from public_family_start_requests where email_normalized = $1", [guardianEmail]);
  const accounts = (await sql.query(
    "select id from access_accounts where email_normalized = $1", [guardianEmail])) as Array<{ id: string }>;
  const accountIds = accounts.map(account => account.id);
  if (accountIds.length) {
    await sql.transaction([
      sql.query("update access_sessions set revoked_at = now() where account_id = any($1::uuid[]) and revoked_at is null", [accountIds]),
      sql.query("update account_person_grants set active = false where account_id = any($1::uuid[])", [accountIds]),
      sql.query("update access_accounts set disabled = true where id = any($1::uuid[])", [accountIds]),
    ]);
  }
  await sql.query("update access_sessions set revoked_at = now() where account_id = $1 and revoked_at is null", [VALOR.registrarAccountId]);
});

async function waitForAppHydration(page: Page) {
  await page.waitForFunction(() => {
    const runtime = window as unknown as { __TSS_START_OPTIONS__?: unknown; $_TSR?: { hydrated?: boolean } };
    return Boolean(runtime.__TSS_START_OPTIONS__) && (!runtime.$_TSR || runtime.$_TSR.hydrated === true);
  }, undefined, { timeout: 120_000 });
}

async function goto(page: Page, url: string) {
  await page.goto(url);
  await waitForAppHydration(page);
}

async function singleRow<T extends Record<string, unknown>>(query: string, params: unknown[]): Promise<T> {
  const rows = (await sql.query(query, params)) as T[];
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

test("Valor public website: verified family application through enrollment activation", async ({ browser }) => {
  test.setTimeout(420_000);
  const familyContext = await browser.newContext({ baseURL });
  const family = await familyContext.newPage();
  family.setDefaultTimeout(30_000);
  let registrar: AuthenticatedPage | undefined;
  try {
    // ------------------------------------------------------------------
    await test.step("anonymous family applies from the public Valor website", async () => {
      await family.goto(`/published-site/admissions?site=${VALOR.slug}`);
      await expect(family.getByRole("status")).toContainText("Local preview");
      const apply = family.locator('form[action^="/published-site/family-start"]');
      await expect(apply).toHaveCount(1);
      await apply.getByLabel("Parent or guardian first name").fill("Sandbox");
      await apply.getByLabel("Parent or guardian last name").fill(`Guardian ${suffix}`);
      await apply.getByLabel("Email", { exact: true }).fill(guardianEmail);
      await apply.getByLabel(/I agree to receive an email verification link/).check();
      const familyStartResponse = family.waitForResponse(response =>
        response.url().includes("/published-site/family-start"),
      );
      await apply.getByRole("button", { name: "Verify email to apply" }).click();
      const response = await familyStartResponse;
      const request = response.request();
      expect(response.status(), JSON.stringify({
        body: await response.text(),
        url: response.url(),
        host: await request.headerValue("host"),
        origin: await request.headerValue("origin"),
        referer: await request.headerValue("referer"),
      })).toBe(200);
      await expect(family.getByRole("heading", { name: "Check your email" })).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("family verifies email and submits the canonical application", async () => {
      const link = await waitForLocalAccessLink(guardianEmail);
      await family.goto(link);
      await family.getByRole("button", { name: "Verify email and continue" }).click();
      await family.waitForURL(/\/launch\/family\?/);
      await waitForAppHydration(family);
      await family.getByRole("button", { name: "Continue" }).click();

      await family.getByLabel("School or offering").selectOption(VALOR.programId);
      await family.getByLabel("School year").selectOption(VALOR.schoolYearId);
      await family.getByLabel("Student legal first name").fill("Sandbox");
      await family.getByLabel("Student legal last name").fill(studentLastName);
      await family.getByLabel("Entering grade level").fill("9");
      await family.getByRole("button", { name: "Submit application" }).click();
      await expect(family.getByText("Guardian verification is pending", { exact: false })).toBeVisible();

      const application = await singleRow<{ id: string; student_profile_id: string }>(
        `select a.id, a.student_profile_id from applications a
         join student_profiles sp on sp.id = a.student_profile_id
         join people p on p.id = sp.person_id
         where a.program_id = $1 and p.legal_last_name = $2`,
        [VALOR.programId, studentLastName],
      );
      run.applicationId = application.id;
      run.studentProfileId = application.student_profile_id;
    });

    // ------------------------------------------------------------------
    registrar = await openAuthenticatedPage(browser, registrarSecret);
    registrar.page.setDefaultTimeout(30_000);
    const selected = `siteId=${VALOR.siteId}&programId=${VALOR.programId}&application=${run.applicationId}`;

    await test.step("registrar begins eligibility review and verifies the guardian", async () => {
      const page = registrar!.page;
      await goto(page, `/admissions/intake?${selected}`);
      await page.getByRole("button", { name: "Begin eligibility review" }).click();
      await expect(page.getByRole("button", { name: "Approve for offer" })).toBeVisible();

      await page.getByRole("button", { name: "Verify guardian relationship" }).click();
      await page.getByLabel("Verification evidence")
        .fill(`Synthetic school record check for browser acceptance ${suffix}.`);
      await page.getByRole("button", { name: "Record guardian verification" }).click();
      await expect(page.getByRole("button", { name: "Relationship verified" })).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("registrar completes the school review requirement", async () => {
      const page = registrar!.page;
      await goto(page, `/admissions/families?${selected}`);
      const review = page.getByRole("checkbox", { name: /School enrollment review/ });
      await expect(review).not.toBeChecked();
      await review.click();
      await expect.poll(async () => {
        const rows = await sql.query(
          `select jr.status from journey_requirements jr
           join journeys j on j.id = jr.journey_id
           where j.participant_type = 'application' and j.participant_id = $1
             and jr.title = 'School enrollment review'`,
          [run.applicationId!],
        ) as { status: string }[];
        return rows[0]?.status;
      }).toBe("complete");
      await expect(review).toBeChecked();
    });

    // ------------------------------------------------------------------
    await test.step("guardian signs the school enrollment form", async () => {
      await goto(family, `/guardian/admission-offers?application=${run.applicationId}`);
      await expect(family.getByText("School form version: valor-family-v1")).toBeVisible();
      await family.getByLabel(/Family contact plan/).fill("Email first; call after 4pm.");
      await family.getByLabel("Typed full name (electronic signature)").fill(`Sandbox Guardian ${suffix}`);
      await family.getByLabel("I agree to the school statement above", { exact: false }).check();
      await family.getByRole("button", { name: "Sign and submit enrollment form", exact: true }).click();
      await expect(family.getByText("Signed - awaiting registrar review.", { exact: true })).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("registrar completes school review and accepts the signed form", async () => {
      const page = registrar!.page;
      await goto(page, `/admissions/families?${selected}`);
      await page.getByLabel("Form decision").selectOption("accepted");
      await page.getByLabel("Review reason (visible to the family)").fill("Synthetic Valor enrollment form reviewed.");
      await page.getByLabel("I confirm this decision for the displayed signed submission.").check();
      await page.getByRole("button", { name: "Record form review", exact: true }).click();
      await expect(page.getByText("Registrar decision: accepted", { exact: true })).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("registrar approves, issues the offer; guardian accepts", async () => {
      const page = registrar!.page;
      await goto(page, `/admissions/intake?${selected}`);
      await expect.poll(async () => {
        await page.reload();
        await waitForAppHydration(page);
        return page.getByRole("button", { name: "Approve for offer" }).isEnabled();
      }, { timeout: 30_000 }).toBe(true);
      await page.getByRole("button", { name: "Approve for offer" }).click();
      await expect.poll(async () =>
        (await singleRow<{ stage: string }>("select stage from applications where id = $1", [run.applicationId!])).stage,
      ).toBe("accepted");

      await goto(page, `/admissions?${selected}`);
      await page.getByRole("button", { name: /Registrar: Issue offer/ }).click();
      await expect.poll(async () => (await sql.query(
        "select id from admission_offers where application_id = $1", [run.applicationId!],
      ) as unknown[]).length).toBe(1);

      await goto(family, `/guardian/admission-offers?application=${run.applicationId}`);
      await family.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(family.getByText(/acceptance is recorded/i)).toBeVisible();
    });

    // ------------------------------------------------------------------
    await test.step("registrar activates enrollment with class placement", async () => {
      const page = registrar!.page;
      await goto(page, `/admissions?${selected}`);
      await page.getByLabel("Available section").selectOption(VALOR.sectionId);
      await page.getByRole("button", { name: "Activate enrollment and assign class", exact: true }).click();
      await expect(page.getByText(`Assigned: ${VALOR.sectionTitle}`, { exact: true })).toBeVisible();

      const placement = await singleRow<{ section_id: string; status: string }>(
        `select section_id, status from enrollments
         where student_profile_id = $1 and kind = 'section'`,
        [run.studentProfileId!],
      );
      expect(placement).toEqual({ section_id: VALOR.sectionId, status: "active" });
      const program = await singleRow<{ status: string }>(
        `select status from enrollments
         where student_profile_id = $1 and program_id = $2 and kind = 'program'`,
        [run.studentProfileId!, VALOR.programId],
      );
      expect(program.status).toBe("active");
      await goto(family, `/guardian/admission-offers?application=${run.applicationId}`);
      await expect(family.getByText(/Enrollment is active and classes are assigned/)).toBeVisible();
    });
  } finally {
    await registrar?.context.close();
    await familyContext.close();
  }
});
