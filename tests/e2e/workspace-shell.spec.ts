import { expect, test } from "@playwright/test";
import type {} from "@tanstack/react-router";

// These tests are read-only and deliberately use a signed-out browser.
test("workspace chrome is server-rendered and internal navigation preserves its DOM", async ({ page }) => {
  const response = await page.goto("/messages");
  expect(response).not.toBeNull();
  const html = await response!.text();
  expect(html).toContain("Sign in");
  expect(html).not.toContain("Loading account...");
  expect(response!.headers()["cache-control"]).toContain("no-store");
  await expect(page.getByRole("alert")).toContainText("Sign in to view messages.");
  const header = await page.getByRole("banner", { name: "Workspace top bar" }).elementHandle();
  expect(header).not.toBeNull();
  const documents: string[] = [];
  page.on("request", request => { if (request.isNavigationRequest()) documents.push(request.url()); });
  await page.getByRole("banner", { name: "Workspace top bar" }).getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/access\/?$/);
  await expect(page.getByRole("heading", { name: "Access CAN OS" })).toBeVisible();
  expect(await header!.evaluate(node => node === document.querySelector("header"))).toBe(true);
  expect(documents).toEqual([]);
});

test("slow route data leaves the existing chrome mounted and usable", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByRole("alert")).toContainText("Sign in to view messages.");
  const header = await page.getByRole("banner", { name: "Workspace top bar" }).elementHandle();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_serverFn/**", async route => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.evaluate(() => {
      if (!window.__TSR_ROUTER__) throw new Error("Router has not hydrated");
      void window.__TSR_ROUTER__.navigate({ to: "/student" });
    });
    await expect(page.getByRole("status", { name: "Loading page" })).toBeVisible();
    await expect(page.getByRole("banner", { name: "Workspace top bar" })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true })).toBeEnabled();
    expect(await header!.evaluate(node => node === document.querySelector("header"))).toBe(true);
    release();
    await expect(page.getByRole("heading", { name: "Your learning day" })).toBeVisible();
    expect(await header!.evaluate(node => node === document.querySelector("header"))).toBe(true);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("initial entry does not download unrelated route implementations", async ({ page }) => {
  const unrelated: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    if (url.searchParams.has("tsr-split") && /\/routes\/(teacher|staff|operations|guardian|admissions)/.test(url.pathname)) {
      unrelated.push(url.pathname + url.search);
    }
  });
  await page.goto("/messages");
  await expect(page.getByRole("alert")).toContainText("Sign in to view messages.");
  expect(unrelated).toEqual([]);
});

test("a changed session identity discards mounted state and query caches", async ({ page }) => {
  await page.goto("/messages");
  await expect(page.getByRole("alert")).toContainText("Sign in to view messages.");
  const reloaded = page.waitForEvent("domcontentloaded");
  await page.evaluate(() => {
    const client = window.__TSR_ROUTER__?.options.context?.queryClient;
    if (!client) throw new Error("Workspace query client has not hydrated");
    client.setQueryData(["shell-test-previous-identity"], "must not survive");
    // Simulate a refreshed display context, not a login or server permission.
    client.setQueryData(["workspace-session"], {
      session: {
        authenticated: true, activeGrantId: "test-grant", role: "student",
        grants: [{ id: "test-grant", role: "student", firstName: "Test", lastName: "Learner" }],
        sites: [], programs: [],
        activeContext: { organizationIds: [], siteIds: [], programIds: [] },
      },
      error: null,
    });
  });
  await reloaded;
  await expect(page.getByRole("alert")).toContainText("Sign in to view messages.");
  expect(await page.evaluate(() =>
    window.__TSR_ROUTER__?.options.context?.queryClient.getQueryData(["shell-test-previous-identity"]),
  )).toBeUndefined();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
});
