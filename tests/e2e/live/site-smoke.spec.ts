import { expect, test, type Page } from "@playwright/test";

/**
 * On-demand verification against a LIVE deployment, not a local dev server.
 * Only unsigned-in GET navigation is permitted. Never submit a form,
 * redeem demo credentials, create an account, or mutate data here.
 * Destructive and authenticated E2E coverage belongs to isolated Neon suites.
 */
async function expectHealthyPage(page: Page, path: string) {
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response, `No document response for ${path}`).not.toBeNull();
  expect(response!.status(), `HTTP status for ${path}`).toBeLessThan(500);
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("main")).toContainText(/\S/);
  await expect.poll(
    () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    { message: `No horizontal overflow for ${path}` },
  ).toBe(true);
  expect(pageErrors, `Unhandled page errors at ${path}`).toEqual([]);
}

test("@public deployed root resolves to a usable page", async ({ page }) => {
  await expectHealthyPage(page, "/");
});

test("@public sign-in shows an accessible email input", async ({ page }) => {
  await expectHealthyPage(page, "/access");
  await expect(page.getByRole("textbox", { name: "Email" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Email me an access link/i })).toBeVisible();
});

test("@public create-school entry point renders without sending data", async ({ page }) => {
  await expectHealthyPage(page, "/schools/new");
  await expect(page.getByRole("heading", { name: /Create a school/i })).toBeVisible();
});

for (const path of ["/guardian/students", "/student/courses", "/calendar",
  "/canonical/lab/facilitated", "/canonical/lab/impact"]) {
  test(`@signed-out ${path} does not expose an authenticated workspace`, async ({ page }) => {
    await expectHealthyPage(page, path);
    const main = page.getByRole("main");
    await expect(main).toContainText(
      /sign in|request access|authorized account|access CAN OS|authentication required/i,
    );
  });
}

test("@public sign-in entry links preserve the requested return destination", async ({ page }) => {
  await expectHealthyPage(page, "/access?returnTo=%2Flearn%2Fenroll");
  await page.getByRole("link", { name: "Create a personal CAN account" }).click();
  await expect(page.getByRole("heading", { name: "Create your CAN account" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/learn/enroll");
  await page.getByRole("link", { name: "Sign in", exact: true }).last().click();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/learn/enroll");
});

test("@public navigation from access to discovery to adult training is usable", async ({ page }) => {
  await expectHealthyPage(page, "/access?returnTo=%2F");
  await page.getByRole("link", { name: "Explore programs and locations" }).click();
  await expect(page.getByRole("heading", { name: "Explore programs and places" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Program or location" })).toBeVisible();
  await page.getByRole("link", { name: /Register for independent and facilitator-led adult training/ }).click();
  await expect(page.getByRole("heading", { name: "Register for learning" })).toBeVisible();
});

test("@public create-school navigation remains read-only until explicit submission", async ({ page }) => {
  await expectHealthyPage(page, "/access");
  await page.getByRole("link", { name: "Create a school" }).click();
  await expect(page.getByRole("heading", { name: "Create a school" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "School name" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Real school" })).toBeChecked();
});

test("@public release fingerprint identifies the deployed artifact without account data", async ({ request }) => {
  const response = await request.get("/release-fingerprint");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toEqual({
    application: "can-os",
    sourceRevision: expect.any(String),
  });
  expect(body.sourceRevision.length).toBeGreaterThan(0);
});
