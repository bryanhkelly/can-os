import {neon} from "@neondatabase/serverless";
import {expect, test} from "@playwright/test";
import {createGf1Fixture, destroyGf1Fixture, type Gf1Fixture, type Sql} from "./fixture";
import {withAuthenticatedPage} from "./helpers/authenticated-persona";
import {DATABASE_URL} from "./env";

/**
 * Authenticated route contract. Must run against an isolated, disposable
 * TEST_DATABASE_URL with the app pointing to the same database.
 * This file does not bypass grants or seed production data.
 */
const sql: Sql | null = DATABASE_URL ? neon(DATABASE_URL) : null;
let fixture: Gf1Fixture | undefined;

test.describe("WS1 My Activity authenticated acceptance", () => {
  test.skip(!sql, "An isolated TEST_DATABASE_URL is required for authenticated acceptance.");

  test.beforeAll(async () => {
    if (!sql) throw new Error("TEST_DATABASE_URL required");
    fixture = await createGf1Fixture(sql);
  });
  test.afterAll(async () => {
    if (sql && fixture) await destroyGf1Fixture(sql, fixture);
  });

  test("student sees only their verified enrolled school Section", async ({browser}) => {
    if (!fixture) throw new Error("fixture unavailable");
    await withAuthenticatedPage(browser, fixture.studentSecret, async ({page}) => {
      const response = await page.goto("/learn/my-activity");
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", {name: "My Activity"})).toBeVisible();
      await expect(page.getByRole("heading", {name: "E2E Logic II"})).toBeVisible();
      await expect(page.getByRole("link", {name: "Open school class"})).toHaveAttribute(
        "href", new RegExp("section=" + fixture!.sectionId),
      );
      await expect(page.locator('[data-participation-key^="school_section:"]')).toHaveCount(1);
      await page.getByRole("button", {name: /History/}).click();
      await expect(page.getByRole("heading", {name: "E2E Logic II"})).toHaveCount(0);
      await page.getByRole("button", {name: /Current/}).click();
      await page.getByRole("button", {name: "Programs", exact: true}).click();
      await expect(page.getByRole("heading", {name: "E2E Logic II"})).toHaveCount(0);
      await page.getByRole("button", {name: "All", exact: true}).click();
      await expect(page.getByRole("heading", {name: "E2E Logic II"})).toBeVisible();
    });
  });

  test("guardian is not silently granted a student's private course participation", async ({browser}) => {
    if (!fixture) throw new Error("fixture unavailable");
    await withAuthenticatedPage(browser, fixture.guardianSecret, async ({page}) => {
      await page.goto("/learn/my-activity");
      await expect(page.getByRole("heading", {name: "My Activity"})).toBeVisible();
      await expect(page.getByRole("heading", {name: "E2E Logic II"})).toHaveCount(0);
      await expect(page.getByRole("link", {name: "Manage authorized workspaces"})).toBeVisible();
    });
  });

  test("legacy My Programs redirects to the verified dashboard", async ({browser}) => {
    if (!fixture) throw new Error("fixture unavailable");
    await withAuthenticatedPage(browser, fixture.studentSecret, async ({page}) => {
      await page.goto("/learn/my-programs");
      await expect(page).toHaveURL(/\/learn\/my-activity(?:\?|$)/);
      await expect(page.getByRole("heading", {name: "My Activity"})).toBeVisible();
    });
  });
});
