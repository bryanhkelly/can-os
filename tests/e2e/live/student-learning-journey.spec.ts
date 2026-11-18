import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Use only a provisioned synthetic learner. Never put a session, email or OTP in source.
const baseUrl = process.env.CAN_LIVE_BASE_URL ?? "https://can-os.bryanhkelly.workers.dev";
const cookie = process.env.CAN_STUDENT_QA_CAN_SESSION ?? "";
const assessmentId = process.env.CAN_STUDENT_QA_ASSESSMENT_ID ?? "";
const groupId = process.env.CAN_STUDENT_QA_APPROVED_GROUP_ID ?? "";
const sessionId = process.env.CAN_STUDENT_QA_GROUP_SESSION_ID ?? "";
const permitWrite = process.env.CAN_STUDENT_QA_WRITES === "1"
  && process.env.CAN_STUDENT_QA_SYNTHETIC_ATTESTATION === "synthetic-fixture";

async function studentSession(context: BrowserContext) {
  if (!cookie) throw new Error("Requires an existing approved synthetic student session");
  await context.addCookies([{
    name: "__Host-can_os_session", value: cookie,
    url: baseUrl, secure: true, httpOnly: true, sameSite: "Lax",
  }]);
}

async function open(page: Page, path: string) {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
  await expect(page.getByRole("main")).toBeVisible();
  expect(errors).toEqual([]);
}

test("signed-out visitors cannot read a student's homework or group discussions", async ({ page }) => {
  await open(page, "/student/assignments");
  await expect(page.getByRole("main")).toContainText(/sign in|authorized student/i);
  await open(page, "/groups");
  await expect(page.getByRole("main")).toContainText(/sign in|student or teacher/i);
});

test("synthetic student can navigate school classes, homework, and study groups", async ({ page, context }) => {
  test.skip(!cookie, "Requires a provisioned synthetic student session");
  await studentSession(context);
  await open(page, "/student/courses?view=catalog");
  await expect(page.getByRole("main")).toContainText(/course|class/i);
  await open(page, "/student/assignments");
  await expect(page.getByRole("heading", { name: "Your assignments" })).toBeVisible();
  await open(page, "/groups");
  await expect(page.getByRole("heading", { name: "Study groups" })).toBeVisible();
});

test("student group session deep links reveal the selected session tab", async ({ page, context }) => {
  test.skip(!cookie || !groupId || !sessionId,
    "Requires a synthetic approved group membership and existing session");
  await studentSession(context);
  await open(page, `/groups/${encodeURIComponent(groupId)}?session=${encodeURIComponent(sessionId)}`);
  await expect(page.getByRole("tab", { name: /Sessions/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#group-panel-sessions")).toBeVisible();
});

test("synthetic learner saves a draft and submits through the existing assignment service", async ({ page, context }, info) => {
  test.skip(info.project.name !== "desktop-chromium", "Mutating fixture runs only once");
  test.skip(!permitWrite || !cookie || !assessmentId,
    "Requires explicit write approval and an unused, editable synthetic assignment");
  await studentSession(context);
  await open(page, `/student/assignments/${encodeURIComponent(assessmentId)}`);
  const response = page.getByRole("textbox", { name: /Your response/ });
  await expect(response).toBeEditable();
  const syntheticText = `Synthetic QA answer ${assessmentId}`;
  await response.fill(syntheticText);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByRole("main")).toContainText(/draft.*saved|files saved|saved/i);
  await expect(response).toHaveValue(syntheticText);
  await page.getByRole("button", { name: "Submit assignment" }).click();
  await expect(page.getByRole("main")).toContainText(/submitted|receipt/i);
  await expect(page.getByRole("button", { name: "Submit assignment" })).toHaveCount(0);
});
