import { test, expect } from "@playwright/test";

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
