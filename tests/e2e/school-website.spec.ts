import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { expect, test } from "@playwright/test";
import { DATABASE_URL } from "./env";
import { createAccessSession, withAuthenticatedPage } from "./helpers/authenticated-persona";
import { createSyntheticPersonaGrant, createVerifiedAccessAccount, insertFixtureId } from "./helpers/canonical-fixture";

// playwright.config.ts attests the disposable database before this fixture runs.
test("school administrator reviews, publishes and renames a standalone school website", async ({ page, browser, request }) => {
  if (!DATABASE_URL) throw new Error("The guarded disposable database is required.");
  const sql = neon(DATABASE_URL);
  const [schema] = await sql`SELECT to_regclass('public.demo_school_tenants') IS NOT NULL AS ready`;
  if (!schema?.ready) throw new Error("The isolated browser-test branch needs the current migration chain, including demo_school_tenants. Do not run this fixture against Main.");
  const suffix = randomUUID().slice(0, 8);
  const domain = `website-${suffix}.demo`;
  const publicSlug = `school-${suffix}`;
  const renamedSlug = `renamed-${suffix}`;
  const name = `Website School ${suffix}`;
  const renamedName = `Renamed School ${suffix}`;

  await page.goto("/schools/new");
  await expect(page.getByRole("button", { name: "Create demo school" })).toBeEnabled();
  await page.getByLabel("School name", { exact: true }).fill(name);
  await page.getByLabel("School domain").fill(domain);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create demo school" }).click();
  await expect(page.getByRole("heading", { name: "Your demo school is ready" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in and continue setup" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`admin.demo@${domain}`);
  await page.getByLabel("Demo access code (000000)").fill("000000");
  const verificationRequest = page.waitForRequest(request =>
    request.method() === "POST" && new URL(request.url()).pathname === "/access/verify");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const credentials = new URLSearchParams((await verificationRequest).postData() ?? "");
  expect(credentials.get("email")).toBe(`admin.demo@${domain}`);
  expect(credentials.get("code")).toBe("000000");
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

  const [tenant] = await sql`SELECT organization_id, site_id FROM demo_school_tenants WHERE domain = ${domain}`;
  if (!tenant) throw new Error("The browser-created school was not persisted.");
  const orgId = String(tenant.organization_id);
  const siteId = String(tenant.site_id);
  const jurisdictionId = await insertFixtureId(sql,
    "INSERT INTO jurisdictions(code,name) VALUES($1,'Synthetic website testing') RETURNING id", [`website-${suffix}`]);
  const programName = `Reviewed Academic Program ${suffix}`;
  await sql.query(`INSERT INTO programs
    (organization_id,site_id,jurisdiction_id,type,status,name,slug,grade_range,delivery_model,
     academic_provider_organization_id,metadata)
    VALUES($1,$2,$3,'full_school','active',$4,$5,'{"min":"9","max":"12"}',
      '{"onsite":true}',$1,'{"synthetic":true}')`,
  [orgId, siteId, jurisdictionId, programName, publicSlug]);

  await page.goto(`/sites/${siteId}/publish`);
  await page.getByLabel("Public site subdomain").fill(publicSlug);
  await page.getByRole("button", { name: "Reserve address" }).click();
  await expect(page.getByRole("button", { name: "Save school name and address" })).toBeVisible();
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: programName, exact: true }) }).filter({
    has: page.getByRole("button", { name: "Approve academic listing" }),
  });
  await card.getByLabel("Public description", { exact: false }).fill("A reviewed synthetic academic program for browser acceptance testing.");
  await card.getByLabel("Decision reason", { exact: false }).fill("Reviewed the synthetic program details for public website acceptance.");
  await card.getByRole("checkbox").check();
  await card.getByRole("button", { name: "Approve academic listing" }).click();
  await expect(page.getByRole("button", { name: "Approve public catalog" })).toBeDisabled();
  await expect(page.getByText("Public marketing: published.", { exact: false })).toBeVisible();
  await page.getByLabel("Publication decision reason", { exact: true }).fill("Reviewed the school identity and separately approved academic listing.");
  await page.getByRole("checkbox", { name: "I reviewed this Site's identity", exact: false }).check();
  await page.getByRole("button", { name: "Approve public catalog" }).click();
  await page.getByRole("link", { name: "Open local public preview" }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: programName })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Local read-only preview");
  await expect(page.locator("form")).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Workspace sidebar" })).toHaveCount(0);

  await page.goto(`/sites/${siteId}/publish`);
  await page.getByLabel("School name", { exact: true }).fill(renamedName);
  await page.getByLabel("New public subdomain").fill(renamedSlug);
  await page.getByLabel("Name and address change reason").fill("Reviewed the new school name and public address for acceptance.");
  await page.getByRole("checkbox", { name: "I reviewed the school name", exact: false }).check();
  await page.getByRole("button", { name: "Save school name and address" }).click();
  await expect(page.getByRole("heading", { name: `${renamedName} · public site` })).toBeVisible();
  await page.getByRole("link", { name: "Open local public preview" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: renamedName, exact: true })).toBeVisible();
  expect((await request.get(`/published-site?site=${publicSlug}`)).status()).toBe(404);
  expect((await request.get(`/published-site?site=unknown-${suffix}`)).status()).toBe(404);
  const anonymous = await request.get(`/published-site?site=${renamedSlug}`);
  expect(anonymous.status()).toBe(200);
  expect(await anonymous.text()).toContain(renamedName);

  const personId = await insertFixtureId(sql,
    "INSERT INTO people(legal_first_name,legal_last_name,metadata) VALUES('Synthetic','Registrar','{\"synthetic\":true}') RETURNING id", []);
  const accountId = await createVerifiedAccessAccount(sql, `website-registrar-${suffix}@example.org`);
  const grantId = await createSyntheticPersonaGrant(sql, {
    accountId, personId, role: "registrar", organizationId: orgId, siteId,
  });
  await sql`INSERT INTO memberships(person_id,organization_id,metadata)
    VALUES(${personId},${orgId},'{"synthetic":true}')`;
  const secret = await createAccessSession(sql, {
    accountId, activeGrantId: grantId, expiresAt: new Date(Date.now() + 3_600_000),
  });
  await withAuthenticatedPage(browser, secret, async ({ page: registrar }) => {
    await registrar.goto(`/sites/${siteId}/publish`);
    await expect(registrar.getByRole("alert")).toContainText("You do not have permission");
    await expect(registrar.getByRole("button", { name: "Save school name and address" })).toHaveCount(0);
  });
  // Immutable audit evidence and its synthetic identities remain on the disposable branch.
});
