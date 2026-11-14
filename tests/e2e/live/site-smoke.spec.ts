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

for (const path of ["/guardian/students", "/student/courses", "/calendar"]) {
  test(`@signed-out ${path} does not expose an authenticated workspace`, async ({ page }) => {
    await expectHealthyPage(page, path);
    const main = page.getByRole("main");
    await expect(main).toContainText(
      /sign in|request access|authorized account|access CAN OS|authentication required/i,
    );
  });
}
