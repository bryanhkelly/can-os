import { test, expect } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { createGf1Fixture, destroyGf1Fixture, type Gf1Fixture, type Sql } from "./fixture";
import { DATABASE_URL } from "./env";
import { withAuthenticatedPage } from "./helpers/authenticated-persona";

/** Browser smoke only. Full two-Site signed-in end-to-end acceptance needs
 * synthetic native QA principals and an explicitly disposable test01 database.
 * Never treat these anonymous checks as enabled-feature acceptance.
 */
test("Classroom Connect QR fragment is scrubbed and cannot grant enrollment", async ({ page }) => {
  await page.goto("/join#pair=ABCDEFGHJK");
  await expect(page.getByRole("heading", {
    name: "Join a facilitator-led classroom",
  })).toBeVisible();
  await expect(page).toHaveURL(/\/join\/?$/);
  await expect(page.getByRole("button", { name: "Pair my device" })).toHaveCount(0);
});

test("anonymous projector displays no learner records or playback controls", async ({ page }) => {
  await page.goto("/classroom/11111111-1111-4111-8111-111111111111/presentation");
  await expect(page.getByRole("heading", {
    name: "Facilitated classroom",
  })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(page.getByText("Registered learners with paired devices")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);
});

/** Independent, signed-in privacy smoke using disposable synthetic identities.
 * This is NOT a positive room lifecycle acceptance run: that needs distinct
 * current Class/Course attempts and a real facilitated room fixture. */
test.describe("Classroom Connect signed-in access boundaries", () => {
  const sql: Sql | null = DATABASE_URL ? neon(DATABASE_URL) : null;
  let fixture: Gf1Fixture | undefined;

  test.beforeAll(async () => {
    if (!sql) throw new Error("An isolated TEST_DATABASE_URL is required.");
    fixture = await createGf1Fixture(sql);
  });
  test.afterAll(async () => {
    if (sql && fixture) await destroyGf1Fixture(sql, fixture);
  });

  test("guardian cannot use a classroom pairing code as enrollment or facilitator authority", async ({ browser }) => {
    if (!fixture) throw new Error("Synthetic identity fixture unavailable");
    await withAuthenticatedPage(browser, fixture.guardianSecret, async ({ page }) => {
      await page.goto("/join#pair=ABCDEFGHJK");
      await expect(page).toHaveURL(/\\/join\\/?$/);
      await expect(page.getByRole("button", { name: "Pair my device" })).toHaveCount(0);
      await page.goto("/classroom/11111111-1111-4111-8111-111111111111/presentation");
      await expect(page.getByRole("alert")).toContainText("unavailable");
    });
  });

  test("signed-in learner cannot control or inspect another classroom projector", async ({ browser }) => {
    if (!fixture) throw new Error("Synthetic identity fixture unavailable");
    await withAuthenticatedPage(browser, fixture.studentSecret, async ({ page }) => {
      await page.goto("/classroom/11111111-1111-4111-8111-111111111111/presentation");
      await expect(page.getByRole("alert")).toContainText("unavailable");
      await expect(page.getByText("Registered learners with paired devices")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(0);
    });
  });
});
