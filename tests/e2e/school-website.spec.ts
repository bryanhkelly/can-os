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
  // Browser acceptance of exact-Site Launch Hub and Website Studio navigation.
  const navigationErrors: string[] = [];
  page.on("pageerror", error => navigationErrors.push(error.message));
  await page.goto(`/launch/hub/school?siteId=${siteId}`);
  await expect(page.getByRole("heading", { name: "Build your school." })).toBeVisible();
  await page.getByRole("link", { name: "Open Website Studio" }).click();
  await expect(page).toHaveURL(/\/launch\/website\?/);
  await expect(page.getByRole("heading", { name: "Prepare your private website address." })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Launch steps" }).getByRole("button")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Prepare your private website address." })).toBeVisible();
  await page.getByRole("link", { name: "Back to Launch Hub" }).click();
  await expect(page.getByRole("heading", { name: "Build your school." })).toBeVisible();
  await page.getByRole("link", { name: "Open Website Studio" }).click();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Build your school." })).toBeVisible();
  await page.goto(`/launch/hub/school/website?siteId=${siteId}`);
  await expect(page).toHaveURL(/\/launch\/website\?/);
  await page.goto(`/launch/hub/school?siteId=${randomUUID()}`);
  await expect(page.getByRole("heading", { name: "Choose your school" })).toBeVisible();
  await page.goto(`/settings?siteId=${siteId}`);
  await page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Website", exact: true }) })
    .getByRole("link", { name: "Open Website Studio" }).click();
  await expect(page).toHaveURL(/returnToSettings=true/);
  await page.getByRole("link", { name: "Back to Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  expect(navigationErrors).toEqual([]);
  page.removeAllListeners("pageerror");
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
  // Site-first Launch Studio must display its actual authenticated preview,
  // not an empty/blocked frame. This catches endpoint errors in browser QA;
  // the Cloudflare Worker CSP source is separately verified in unit tests.
  await page.goto(`/launch/site?siteId=${siteId}&step=preview`);
  await expect(page.getByRole("heading", { name: "Your Site is taking shape." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open full-page preview" })).toHaveAttribute(
    "href", `/launch/site-preview?siteId=${siteId}`,
  );
  const siteFrame = page.frameLocator('iframe[title^="Private rendered website preview for"]');
  await expect(siteFrame.getByText("Private Site website preview")).toBeVisible();
  await expect(siteFrame.locator("body")).toContainText(name);
  const embeddedResponse = await page.request.get(`/launch/site-preview?siteId=${siteId}`);
  expect(embeddedResponse.status()).toBe(200);
  expect(embeddedResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  expect(embeddedResponse.headers()["content-security-policy"]).toContain("frame-ancestors 'self'");
  await page.goto(`/sites/${siteId}/publish`);
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
  await expect(page.getByRole("status")).toContainText("Local preview");
  const inquiryForm = page.locator('form[action^="/published-site/inquiry"]');
  await expect(inquiryForm).toHaveCount(1);
  const parentEmail = `parent-${suffix}@example.test`;
  await inquiryForm.getByLabel("First name").fill("Synthetic");
  await inquiryForm.getByLabel("Last name").fill("Parent");
  await inquiryForm.getByLabel("Email", { exact: true }).fill(parentEmail);
  await inquiryForm.getByRole("checkbox").check();
  // Embedded/headless Chromium can emit Origin: null for form navigations;
  // send the actual same-origin value so the endpoint's CSRF guard stays active.
  await page.setExtraHTTPHeaders({ origin: new URL(page.url()).origin });
  await inquiryForm.getByRole("button", { name: "Request information" }).click();
  await expect(page.getByRole("heading", { name: "Thank you for your interest." })).toBeVisible();
  await page.setExtraHTTPHeaders({});
  const [interest] = await sql`
    SELECT source, status FROM public_admissions_interests
    WHERE contact_email = ${parentEmail} LIMIT 1
  `;
  expect(interest).toMatchObject({ source: "published_site", status: "new" });
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
  // Website Studio is an operational editor, not a placeholder: choose a
  // template, edit Site-owned copy, save an immutable draft, preview and publish.
  await page.goto(`/launch/website?siteId=${siteId}&returnToHub=true`);
  await expect(page.getByRole("heading", { name: "Find the right first impression." })).toBeVisible();
  await expect(page.getByRole("group", { name: "School website templates" })).toBeVisible();
  await page.getByRole("navigation", { name: "Launch steps" })
    .getByRole("button", { name: /School content/ }).click();
  const localHeadline = `A warm place to learn and belong ${suffix}`;
  await page.getByLabel("Homepage headline", { exact: false }).fill(localHeadline);
  await page.getByRole("button", { name: "Save private draft" }).click();
  await expect(page.getByText("Private website draft saved.", { exact: false })).toBeVisible();
  await page.getByRole("navigation", { name: "Launch steps" })
    .getByRole("button", { name: /Preview & review/ }).click();
  await page.getByRole("button", { name: "Preview current changes" }).click();
  await expect(page.getByRole("heading", { name: "Your unsaved design preview" })).toBeVisible();
  await expect(page.getByTitle(`${renamedName} / read-only website preview`)).toBeVisible();
  await page.getByRole("button", { name: "Publish church-owned content" }).click();
  await expect(page.getByText("Church content published.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "See what families will see." })).toBeVisible();
  await page.getByRole("link", { name: "Back to Launch Hub" }).click();
  await expect(page.getByRole("heading", { name: "Build your school." })).toBeVisible();
  await page.goto(`/published-site?site=${renamedSlug}`);
  await expect(page.getByRole("heading", { name: renamedName, exact: true })).toBeVisible();
  await expect(page.locator("body")).toContainText(localHeadline);
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

test("a new Site Administrator prepares a school website directly in Website Studio", async ({ page }) => {
  if (!DATABASE_URL) throw new Error("The guarded disposable database is required.");
  const sql = neon(DATABASE_URL);
  const [schema] = await sql`SELECT to_regclass('public.demo_school_tenants') IS NOT NULL AS ready`;
  if (!schema?.ready) throw new Error("The isolated browser-test branch needs the current migration chain.");
  const suffix = randomUUID().slice(0, 8);
  const domain = `studio-${suffix}.demo`;

  await page.goto("/schools/new");
  await page.getByLabel("School name", { exact: true }).fill(`Studio School ${suffix}`);
  await page.getByLabel("School domain").fill(domain);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create demo school" }).click();
  await page.getByRole("link", { name: "Sign in and continue setup" }).click();
  await page.getByLabel("Email", { exact: true }).fill(`admin.demo@${domain}`);
  await page.getByLabel("Demo access code (000000)").fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

  const [tenant] = await sql`SELECT site_id FROM demo_school_tenants WHERE domain = ${domain}`;
  if (!tenant) throw new Error("The synthetic Site must be persisted before editing.");
  const siteId = String(tenant.site_id);

  await page.goto(`/launch/hub/school?siteId=${siteId}`);
  await page.getByRole("link", { name: "Open Website Studio" }).click();
  await expect(page.getByRole("heading", { name: "Prepare your private website address." })).toBeVisible();
  await page.getByRole("button", { name: "Prepare school website" }).click();
  await expect(page.getByRole("heading", { name: "Find the right first impression." })).toBeVisible();
  await expect(page.getByRole("group", { name: "School website templates" })).toBeVisible();

  const [publication] = await sql`SELECT status FROM site_publications WHERE site_id = ${siteId}`;
  expect(publication?.status).toBe("draft");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Find the right first impression." })).toBeVisible();
});
