import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const hostCookie = process.env.CAN_RELEASE_HOST_COOKIE ?? "";
const foreignHostCookie = process.env.CAN_RELEASE_FOREIGN_HOST_COOKIE ?? "";
const learnerCookie = process.env.CAN_RELEASE_LEARNER_COOKIE ?? "";
const expiredHostCookie = process.env.CAN_RELEASE_EXPIRED_HOST_COOKIE ?? "";
const hostedCourse = process.env.CAN_RELEASE_HOST_ONLY_COURSE_TITLE ?? "";
const learnerCoursePath = process.env.CAN_RELEASE_LEARNER_COURSE_PATH ?? "";
const baseUrl = process.env.CAN_RELEASE_E2E_URL ?? "";
const canWrite = process.env.CAN_RELEASE_E2E_WRITES === "1";

/** Test-only native session secrets are never printed or written to artifacts. */
async function login(context: BrowserContext, rawCookie: string) {
  if (!rawCookie || !baseUrl) throw new Error("Missing provisioned QA native session");
  await context.addCookies([{
    name: "__Host-can_os_v3_session", value: rawCookie,
    url: baseUrl, secure: true, httpOnly: true, sameSite: "Lax",
  }]);
}
async function openRoomPage(page: Page) {
  const response = await page.goto("/canonical/lab/facilitated", {
    waitUntil: "domcontentloaded",
  });
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(500);
}
const startPanel = (page: Page) =>
  page.locator('section[aria-label="Start a shared-screen learning room"]');

test("unsigned-in client cannot manage facilitated rooms", async ({ page }) => {
  await openRoomPage(page);
  await expect(startPanel(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start facilitator room" })).toHaveCount(0);
});

test("authorized current Site facilitator sees only their room workspace", async ({
  page, context,
}) => {
  test.skip(!hostCookie, "Needs a fresh QA room_facilitator cookie for this exact deployment");
  await login(context, hostCookie);
  await openRoomPage(page);
  await expect(startPanel(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Start facilitator room" })).toBeVisible();
});

test("foreign-Site facilitator cannot view a named host-only course", async ({
  page, context,
}) => {
  test.skip(!foreignHostCookie || !hostedCourse,
    "Needs a foreign Site cookie and a host-only course fixture");
  await login(context, foreignHostCookie);
  await openRoomPage(page);
  await expect(page.getByRole("main")).not.toContainText(hostedCourse);
});

test("learner role cannot access facilitator commands", async ({ page, context }) => {
  test.skip(!learnerCookie, "Needs a native QA learner session");
  await login(context, learnerCookie);
  await openRoomPage(page);
  await expect(startPanel(page)).toHaveCount(0);
});

test("expired canonical session cannot access facilitator controls", async ({
  page, context,
}) => {
  test.skip(!expiredHostCookie, "Needs an expired QA room-facilitator session");
  await login(context, expiredHostCookie);
  await openRoomPage(page);
  await expect(startPanel(page)).toHaveCount(0);
});

test("preview-only learner pairing from a valid Site room", async ({ page, context, browser }) => {
  test.skip(!canWrite || !hostCookie || !learnerCookie || !learnerCoursePath,
    "Requires opt-in, isolated QA course and paired native facilitator/learner accounts");
  await login(context, hostCookie);
  await openRoomPage(page);
  const options = page.locator('section[aria-label="Start a shared-screen learning room"] select');
  await expect(options).toBeVisible();
  const values = await options.locator("option").evaluateAll(elements =>
    elements.map(node => (node as HTMLOptionElement).value).filter(Boolean));
  expect(values.length, "A current published QA deployment/course must be seeded").toBeGreaterThan(0);
  await options.selectOption(values[0]!);
  await page.getByRole("button", { name: "Start facilitator room" }).click();
  const code = (await page.locator('section[aria-label="Current device pairing code"] p.font-mono').innerText()).trim();
  expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  const learner = await browser.newContext();
  try {
    await login(learner, learnerCookie);
    const learnerPage = await learner.newPage();
    await learnerPage.goto(learnerCoursePath, { waitUntil: "domcontentloaded" });
    const pairing = learnerPage.getByRole("region", { name: "Facilitator room pairing" });
    await expect(pairing).toBeVisible();
    await pairing.getByRole("textbox", { name: "Facilitator pairing code" }).fill(code);
    await pairing.getByRole("button", { name: "Pair device" }).click();
    await expect(pairing.getByText("Your device is paired with the facilitator's room.")).toBeVisible();
  } finally {
    await learner.close();
    page.once("dialog", dialog => void dialog.accept());
    await page.getByRole("button", { name: "End room" }).first().click();
  }
});
