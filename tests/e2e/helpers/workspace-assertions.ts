import { expect, type Page } from "@playwright/test";

export async function expectWorkspaceShell(page: Page) {
  const topBar = page.getByRole("banner", { name: "Workspace top bar" });
  await expect(topBar).toBeVisible();
  await expect(topBar.getByRole("button", { name: /^Switch workspace:/ })).toBeVisible();
  await expect(topBar.getByRole("button", { name: "Search workspace" })).toBeVisible();
  await expect(topBar.getByRole("button", { name: "Ask CAN" })).toBeVisible();
  await expect(topBar.getByRole("button", { name: "Account menu" })).toBeVisible();
}

export async function expectWorkspaceRoute(page: Page, path: string, heading: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("main").getByRole("heading", { name: heading, exact: true })).toBeVisible();
  await expectWorkspaceShell(page);
}

export async function expectMutationFeedback(
  page: Page,
  outcome: "success" | "error",
  message: string | RegExp,
) {
  const feedback = page.getByRole(outcome === "success" ? "status" : "alert").filter({ hasText: message }).first();
  await expect(feedback).toBeVisible();
  return feedback;
}