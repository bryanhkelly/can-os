import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const smokeManifest = JSON.parse(readFileSync(new URL("../route-smoke-manifest.json", import.meta.url), "utf8")) as {
  publicRoutes: readonly (readonly [string, string])[];
  signedOutRoutes: readonly string[];
};
const publicRoutes = smokeManifest.publicRoutes;
const protectedRoutes = smokeManifest.signedOutRoutes;

test.beforeEach(async ({ page }) => {
  // These checks neither authenticate nor submit business commands.
  await page.route("**/access/request", route => route.fulfill({ status: 403, body: "Read-only browser check" }));
  await page.route("**/access/verify", route => route.fulfill({ status: 403, body: "Read-only browser check" }));
});

test("home redirect settles and subsequent navigation remains interactive", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page).toHaveURL(/\/access\?returnTo=%2F$/);
  await expect(page.getByRole("heading", { name: "Access CAN OS", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email" })).toBeEnabled();
  const documents: string[] = [];
  page.on("request", request => {
    if (request.isNavigationRequest()) documents.push(request.url());
  });
  await page.getByRole("link", { name: "Create a new .demo school", exact: true }).click();
  await expect(page).toHaveURL(/\/schools\/new$/);
  await expect(page.getByRole("heading", { name: "Create a school", exact: true })).toBeVisible();
  await page.getByRole("banner").getByRole("link", { name: "CAN OS", exact: true }).click();
  await expect(page).toHaveURL(/\/access\?returnTo=%2F$/);
  await expect(page.getByRole("textbox", { name: "Email" })).toBeEnabled();
  expect(documents).toEqual([]);
  expect(errors).toEqual([]);
});

for (const [path, heading] of publicRoutes) {
  test(`public route ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error") errors.push(message.text());
    });
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.getByRole("banner", { name: "Workspace top bar" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const path of protectedRoutes) {
  test(`signed-out route ${path} resolves without a blank page`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => {
      if (message.type() === "error" &&
          !(path === "/account/sessions" && message.text().includes("server responded with a status of 401"))) {
        errors.push(message.text());
      }
    });
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(main).toContainText(/sign in|request access|authorized account|access CAN OS/i);
    if (path === "/account/sessions") await expect(page).toHaveURL(/\/access$/);
    await expect(page.getByRole("banner", { name: "Workspace top bar" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("authentication redirect settles and preserves query and fragment", async ({ page }) => {
  const destination = "/home?from=route-check#today";
  const errors: string[] = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto(destination);
  await expect(page).toHaveURL(new RegExp(`/access\\?returnTo=${encodeURIComponent(destination)}$`));
  await expect(page.getByRole("heading", { name: "Access CAN OS" })).toBeVisible();
  const signIn = page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toHaveAttribute("href", `/access?returnTo=${encodeURIComponent(destination)}`);
  await signIn.click();
  await expect(page).toHaveURL(new RegExp(`/access\\?returnTo=${encodeURIComponent(destination)}$`));
  expect(errors).toEqual([]);
});

test("sign-in uses shared accessible controls and native validation", async ({ page }) => {
  await page.goto("/access");
  const email = page.getByRole("textbox", { name: "Email" });
  await expect(email).toBeVisible();
  await expect(email).toBeEnabled();
  await email.focus();
  await expect(email).toBeFocused();
  expect(await email.evaluate(element => getComputedStyle(element).borderRadius)).toBe("0px");
  expect(await email.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
  const submit = page.getByRole("button", { name: "Email me an access link" });
  expect(await submit.evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(23, 105, 239)");
  await submit.click();
  expect(await email.evaluate(element => (element as HTMLInputElement).validity.valueMissing)).toBe(true);
  await expect(email).toBeFocused();
  await expect(page).toHaveURL(/\/access$/);
});

for (const path of ["", "/about", "/academics", "/school-day", "/student-life", "/admissions", "/contact"]) {
  test(`Valor local public website ${path || "/"}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(`/published-site${path}?site=valorschool`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("Local preview");
    const inquiryForms = page.locator('form[action^="/published-site/inquiry"]');
    if (["", "/academics", "/admissions", "/contact"].includes(path)) {
      await expect(inquiryForms).toHaveCount(1);
    } else {
      await expect(inquiryForms).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("unknown public school does not fall back to another tenant", async ({ page }) => {
  const response = await page.goto("/published-site?site=route-check-unknown");
  expect(response?.status()).toBe(404);
  expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  await expect(page.locator("body")).toHaveText("Not found");
});

test("failed access request keeps the draft and exposes retryable feedback", async ({ page }) => {
  await page.route("**/access/request", route => route.fulfill({ status: 503 }));
  await page.goto("/access");
  const email = page.getByRole("textbox", { name: "Email" });
  await email.fill("route-check@example.test");
  await page.getByRole("button", { name: "Email me an access link" }).click();
  await expect(page.getByRole("status")).toContainText("Sign-in is temporarily unavailable.");
  await expect(email).toHaveValue("route-check@example.test");
  await expect(email).toBeEnabled();
  await expect(page.getByRole("button", { name: "Email me an access link" })).toBeEnabled();
});

test("pending sign-in disables controls until the request completes", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/access/request", async route => {
    await gate;
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  try {
    await page.goto("/access");
    const email = page.getByRole("textbox", { name: "Email" });
    await email.fill("route-check@example.test");
    await page.getByRole("button", { name: "Email me an access link" }).click();
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
    await expect(email).toBeDisabled();
    await expect(page.getByRole("button", { name: "Sending access link…" })).toBeDisabled();
    release();
    await expect(page.getByRole("status")).toContainText("a one-time access link has been sent");
    await expect(page.locator("form")).toHaveAttribute("aria-busy", "false");
    await expect(email).toBeEnabled();
  } finally {
    release();
  }
});

test("demo access keeps native credential redemption without authenticating", async ({ page }) => {
  await page.goto("/access?returnTo=%2Fstudent");
  await page.getByRole("textbox", { name: "Email" }).fill("jordan.student@valorschool.demo");
  const code = page.getByLabel("Demo access code (000000)");
  await expect(code).toHaveAttribute("type", "password");
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(page.locator("form")).toHaveAttribute("method", "post");
  await expect(page.locator("form")).toHaveAttribute("action", "/access/verify?returnTo=%2Fstudent");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await code.fill("000000");
  await page.getByRole("textbox", { name: "Email" }).fill("route-check@example.test");
  await expect(code).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Email me an access link" })).toBeEnabled();
});
