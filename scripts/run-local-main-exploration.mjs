import { chromium, expect } from "@playwright/test";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const options = Object.fromEntries(process.argv.slice(2).map(argument => {
  const separator = argument.indexOf("=");
  return [argument.slice(2, separator), argument.slice(separator + 1)];
}));
const origin = options.origin ?? "http://127.0.0.1:5174";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
  throw new Error("Exploration requires an explicit localhost origin.");
}
if (options.authorized !== "valor-main") {
  throw new Error("Explicit --authorized=valor-main acknowledgement is required.");
}
const accounts = {
  student: "jordan.student@valorschool.demo",
  parent: "morgan.guardian@valorschool.demo",
  teacher: "riley.teacher@valorschool.demo",
  room_admin: "sally.facilitator@valorschool.demo",
  site_admin: "admin.demo@valorschool.demo",
};
const routes = {
  student: ["/student/courses", "/student/assignments", "/student/discussions", "/student/study-groups", "/student/study-groups/new", "/student/my-school", "/student/support", "/calendar", "/messages"],
  parent: ["/guardian/academics", "/guardian/attendance", "/guardian/admission-offers", "/guardian/study-group-consent", "/guardian/field-trips", "/messages"],
  teacher: ["/classes", "/teacher/gradebook", "/teacher/discussions", "/teacher/study-groups", "/teacher/missing-work", "/calendar", "/messages"],
  room_admin: ["/staff/attendance", "/safeguarding", "/admin", "/messages"],
  site_admin: ["/launch/school?siteId=f1000000-0000-4000-8000-000000000003", "/admissions", "/admissions/intake", "/staff/students", "/operations/field-trips", "/sites/f1000000-0000-4000-8000-000000000003/publish", "/site-website", "/safeguarding"],
};
const directory = resolve(options.output ?? "test-results/local-main-exploration");
mkdirSync(directory, { recursive: true });
const journal = resolve(directory, "events.jsonl");
const log = entry => {
  const event = { timestamp: new Date().toISOString(), ...entry };
  appendFileSync(journal, `${JSON.stringify(event)}\n`);
  console.log(JSON.stringify(event));
};
const browser = await chromium.launch({ headless: true });
let failures = 0;
const marker = options.marker ?? "SIMULATED QA 20261104";
async function scenario(page, role, name, run) {
  try {
    const detail = await run();
    await page.reload({ waitUntil: "networkidle" });
    const body = await page.locator("body").innerText();
    const stem = `${role}-${name}-${Date.now()}`;
    writeFileSync(resolve(directory, `${stem}.txt`), body);
    await page.screenshot({ path: resolve(directory, `${stem}.png`), fullPage: true });
    log({ role, scenario: name, outcome: detail?.blocked ? "blocked" : "completed-ui-check", url: page.url(), detail, text: body.slice(-4500), snapshot: `${stem}.txt`, screenshot: `${stem}.png` });
  } catch (error) {
    failures += 1;
    log({ role, scenario: name, outcome: "failed", error: error.message, url: page.url(), text: (await page.locator("body").innerText()).slice(-4500) });
  }
}
async function mutations(page, role) {
  const selected = name => !options.scenarios || options.scenarios.split(",").includes(name);
  if (role === "student" && selected("group-participation")) {
    await scenario(page, role, "group-participation", async () => {
      const events = readFileSync(journal, "utf8").trim().split("\n").map(JSON.parse);
      const created = events.find(event => event.scenario === "create-study-group" && event.detail?.groupUrl);
      if (!created) throw new Error("No recorded newly created group is available.");
      const groupId = new URL(created.detail.groupUrl).searchParams.get("group");
      await page.goto(`/student/study-groups?group=${groupId}`, { waitUntil: "networkidle" });
      await page.getByText("Membership: approved", { exact: true }).first().waitFor();
      await page.getByRole("button", { name: "RSVP maybe", exact: true }).click();
      await page.getByRole("button", { name: "RSVP going", exact: true }).click();
      const message = `${marker}: I will join the algebra practice session. I think subtracting 3 first is clearest, but I want to compare your method respectfully. Synthetic study-group post; no authentic student data.`;
      if (!await page.getByText(message, { exact: true }).count()) {
        await page.getByLabel("Study group message", { exact: true }).fill(message);
        await page.getByRole("button", { name: "Post message", exact: true }).click();
        await page.getByText(message, { exact: true }).waitFor({ timeout: 20000 });
      }
      return { groupId, membership: "Approved", rsvp: "Maybe then going", message: "Original synthetic post", attendance: "Not recorded" };
    });
  }
  if (role === "student" && selected("create-study-group")) {
    await scenario(page, role, "create-study-group", async () => {
      await page.goto("/student/study-groups/new", { waitUntil: "networkidle" });
      await page.getByLabel("Group name", { exact: false }).fill(`${marker} Algebra collaboration`);
      await page.getByLabel("What will you study together?", { exact: false }).fill(`${marker}: synthetic classmates will compare algebra solutions respectfully. No authentic student information.`);
      await page.getByRole("button", { name: "Create study group", exact: true }).click();
      await page.getByRole("alert").filter({ hasText: "Choose at least one classmate" }).waitFor();
      const invite = page.getByRole("checkbox", { name: /Synthetic/ }).first();
      if (!await invite.count()) throw new Error("No explicitly synthetic classmate is available; no invitation sent.");
      await invite.check();
      await page.getByRole("button", { name: "Create study group", exact: true }).click();
      await page.waitForURL(url => url.pathname === "/student/study-groups", { timeout: 20000 });
      await page.getByText(`${marker} Algebra collaboration`, { exact: true }).first().waitFor();
      return { validation: "Missing invitee rejected", groupUrl: page.url(), membership: "Guardian and facilitator approvals remain required" };
    });
  }
  if (role === "student" && selected("submit-assignment")) {
    await scenario(page, role, "submit-assignment", async () => {
      await page.goto("/student/assignments", { waitUntil: "networkidle" });
      const response = page.getByLabel("Your response", { exact: false });
      await response.fill(`${marker}: In this synthetic response, I explain that evidence supports an interpretation when observations and reasoning agree. I would compare an alternative explanation before reaching a conclusion.`);
      await page.getByRole("button", { name: "Save draft", exact: true }).click();
      await page.getByRole("button", { name: "Save draft", exact: true }).isEnabled();
      await page.getByRole("button", { name: "Submit assignment", exact: true }).click({ timeout: 20000 });
      await page.getByText(/submitted successfully|assignment submitted|submission received|submitted for review|work submitted/i).first().waitFor({ timeout: 20000 });
      return { submission: "Text response submitted through normal UI" };
    });
  }
  if (role === "student" && selected("request-conflict-support")) {
    await scenario(page, role, "request-conflict-support", async () => {
      await page.goto("/student/support", { waitUntil: "networkidle" });
      await page.getByLabel("What do you need help with?").fill(`${marker}: Fictional classroom disagreement about whose solution to use. Everyone is safe; no physical contact or threats. Please help us listen, take turns, and resolve the disagreement. This is a synthetic test, not a real incident.`);
      await page.getByRole("button", { name: "Send request", exact: true }).click();
      await page.getByText("Your support request has been recorded.", { exact: true }).waitFor({ timeout: 20000 });
      return { kind: "Synthetic nonviolent conflict-support request" };
    });
  }
  if (role === "student" && selected("verify-submission-support")) {
    await scenario(page, role, "verify-submission-support", async () => {
      await page.goto("/student/assignments", { waitUntil: "networkidle" });
      const body = await page.locator("main").innerText();
      if (!/Submitted Nov 4, 2026.*Receipt: 5cd6441a-679d-475d-a7ba-a45310e92975/.test(body)) throw new Error("The saved submission receipt was not visible.");
      await page.goto("/student/support", { waitUntil: "networkidle" });
      await page.getByText(`${marker}: Fictional classroom disagreement`, { exact: false }).waitFor();
      return { assignment: "Submission receipt persisted on reload; response hidden in read-only submitted view", receipt: "5cd6441a-679d-475d-a7ba-a45310e92975", support: "Synthetic support action persisted; no repeat mutation" };
    });
  }
  if (role === "student" && selected("respond-discussion")) {
    await scenario(page, role, "respond-discussion", async () => {
      await page.goto("/student/discussions", { waitUntil: "networkidle" });
      const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: `${marker} Respectful algebra debate`, exact: true }) }).last();
      await panel.getByLabel("New post").fill(`${marker}: I subtract 3 from both sides and divide by 2, so x = 4. I disagree respectfully with adding 3 first. Could you explain your first step? This is a fictional classroom discussion.`);
      await panel.getByRole("button", { name: "Post response", exact: true }).click();
      await page.getByText(`${marker}: I subtract 3`, { exact: false }).waitFor({ timeout: 20000 });
      return { response: "Student reasoning and respectful disagreement posted" };
    });
  }
  if (role === "teacher" && selected("assign-discussion")) {
    await scenario(page, role, "assign-discussion", async () => {
      await page.goto("/teacher/discussions", { waitUntil: "networkidle" });
      await page.getByText("Start a class discussion", { exact: true }).click();
      await page.getByLabel("Class", { exact: false }).selectOption("7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0");
      await page.getByLabel("Title", { exact: false }).fill(`${marker} Respectful algebra debate`);
      await page.getByLabel("Prompt", { exact: false }).fill(`${marker}: Compare two ways to solve 2x + 3 = 11. Explain your reasoning, respond respectfully to a different method, and ask one clarifying question. Synthetic classroom test.`);
      await page.getByRole("button", { name: "Post discussion", exact: true }).click();
      await page.getByText("Class discussion updated.", { exact: true }).waitFor({ timeout: 20000 });
      await page.getByText(`${marker} Respectful algebra debate`, { exact: true }).waitFor();
      return { title: `${marker} Respectful algebra debate`, section: "Algebra I" };
    });
  }
  if (role === "teacher" && selected("moderate-discussion")) {
    await scenario(page, role, "moderate-discussion", async () => {
      await page.goto("/teacher/discussions", { waitUntil: "networkidle" });
      const panel = page.locator("section").filter({ has: page.getByRole("heading", { name: `${marker} Respectful algebra debate`, exact: true }) }).last();
      const post = panel.getByRole("article").filter({ hasText: `${marker}: I subtract 3` });
      if (await post.count()) await post.getByRole("button", { name: "Hide post", exact: true }).click();
      await panel.getByRole("button", { name: "Restore post", exact: true }).waitFor();
      await panel.getByRole("button", { name: "Restore post", exact: true }).click();
      await panel.getByText(`${marker}: I subtract 3`, { exact: false }).waitFor();
      await panel.getByRole("button", { name: "Lock discussion", exact: true }).click();
      await panel.getByRole("button", { name: "Unlock discussion", exact: true }).waitFor();
      await panel.getByRole("button", { name: "Unlock discussion", exact: true }).click();
      await panel.getByLabel("Teacher response", { exact: false }).fill(`${marker}: Thanks for explaining your reasoning. Please address the method, not the person, and check x = 4 by substitution.`);
      await panel.getByRole("button", { name: "Post response", exact: true }).click();
      await page.getByText(`${marker}: Thanks for explaining`, { exact: false }).waitFor();
      return { checks: ["Hide own test post", "Restore test post", "Lock", "Unlock", "Teacher response"] };
    });
  }
  if (role === "parent" && selected("group-permission")) {
    await scenario(page, role, "group-permission", async () => {
      await page.goto("/guardian/group-permissions", { waitUntil: "networkidle" });
      const card = page.getByRole("article").filter({ hasText: `${marker} Algebra collaboration` });
      if (await card.getByRole("button", { name: "Allow participation", exact: true }).isEnabled()) throw new Error("Consent is enabled without acknowledgment.");
      await card.getByRole("checkbox").check();
      if (!await card.getByRole("button", { name: "Allow participation", exact: true }).isEnabled()) {
        await card.getByRole("checkbox").uncheck();
        await card.getByRole("checkbox").check();
      }
      await expect(card.getByRole("button", { name: "Allow participation", exact: true })).toBeEnabled({ timeout: 5000 });
      await card.getByRole("button", { name: "Allow participation", exact: true }).click();
      await page.getByText("Permission granted; facilitator review still applies.", { exact: true }).waitFor();
      return { guardian: "Permission recorded", facilitator: "Independent approval still required" };
    });
  }
  if (role === "site_admin" && selected("field-trip")) {
    await scenario(page, role, "field-trip", async () => {
      await page.goto("/operations/field-trips", { waitUntil: "networkidle" });
      await page.getByLabel("Program", { exact: true }).selectOption("f1000000-0000-4000-8000-000000000004");
      await page.getByLabel("Trip title", { exact: true }).fill(`${marker} Science museum planning`);
      await page.getByLabel("Destination", { exact: true }).fill("Synthetic Science Museum - fictional venue");
      await page.getByLabel("Departure", { exact: false }).fill("2026-11-20T09:00");
      await page.getByLabel("Return", { exact: false }).fill("2026-11-20T14:00");
      await page.getByLabel("Permission deadline", { exact: false }).fill("2026-11-18T17:00");
      await page.getByLabel("Trip fee (USD)").fill("0");
      await page.getByLabel("Permission statement version").fill("synthetic-qa-20261104-v1");
      await page.getByLabel("School-approved guardian permission statement").fill(`${marker}: Fictional zero-cost trip for browser testing only. This statement acknowledges supervised participation in a synthetic science museum activity. No real travel, payment, medical information, or student movement is authorized. Guardian consent remains required.`);
      await page.getByRole("button", { name: "Propose trip", exact: true }).click();
      await page.getByText("Field trip proposed. Review and approve it below.", { exact: true }).waitFor({ timeout: 20000 });
      const card = page.getByRole("article").filter({ hasText: `${marker} Science museum planning` });
      await card.getByRole("button", { name: "Approve trip", exact: true }).click();
      await page.getByText("Trip approved and added to the school calendar.", { exact: true }).waitFor();
      const student = card.getByLabel("Invite an enrolled student", { exact: false });
      const jordan = await student.locator("option").filter({ hasText: "Jordan" }).getAttribute("value");
      if (!jordan) throw new Error("Jordan unavailable in this trip's enrolled roster; no foreign student invited.");
      await student.selectOption(jordan);
      await card.getByRole("button", { name: "Invite student", exact: true }).click();
      await page.getByText("Invitation sent to the student's guardians.", { exact: true }).waitFor();
      return { status: "Approved synthetic planning event", fee: 0, invitation: "Jordan guardian" };
    });
  }
  if (role === "site_admin" && selected("student-inquiry")) {
    await scenario(page, role, "student-inquiry", async () => {
      await page.goto("/admissions/intake", { waitUntil: "networkidle" });
      await page.getByLabel("Program", { exact: false }).first().selectOption("f1000000-0000-4000-8000-000000000004");
      await page.getByLabel("Student first name", { exact: false }).fill("Synthetic QA");
      await page.getByLabel("Student last name", { exact: false }).fill("Walkthrough 20261104");
      await page.getByLabel("Guardian first name", { exact: false }).fill("Synthetic");
      await page.getByLabel("Guardian last name", { exact: false }).fill("QA Guardian 20261104");
      await page.getByLabel("Guardian email", { exact: false }).fill("qa-walkthrough-20261104@example.test");
      await page.getByLabel("Entering grade").fill("9");
      await page.getByLabel("Notes", { exact: true }).fill(`${marker}: Fictional admissions inquiry. No authentic person, no outbound delivery, no guardian verification claimed.`);
      await page.getByRole("button", { name: "Create inquiry", exact: true }).click();
      await page.waitForURL(url => url.searchParams.has("application"), { timeout: 20000 });
      await page.getByRole("heading", { name: "Synthetic QA Walkthrough 20261104", exact: true }).waitFor();
      return { applicationUrl: page.url(), stage: "Inquiry only; verification, eligibility, offer and activation not bypassed" };
    });
  }
  if (role === "site_admin" && selected("website-services")) {
    await scenario(page, role, "website-services", async () => {
      await page.goto("/sites/f1000000-0000-4000-8000-000000000003/publish", { waitUntil: "networkidle" });
      const panel = page.getByRole("region", { name: "Family services configuration" });
      const card = panel.getByRole("group", { name: "Meals", exact: true });
      if (await card.getByLabel("Current status").inputValue() !== "not_offered") throw new Error("Meals are not in the expected not-offered state; existing service claims left intact.");
      const description = card.getByLabel("Parent-friendly description");
      const existing = await description.inputValue();
      if (existing.includes(marker)) {
        return { change: "Previously saved synthetic meals disclosure verified on reload", status: "not_offered preserved", repeatMutation: false };
      }
      await description.fill(`${existing}\n${marker}: Meals are not offered in this synthetic school configuration.`.trim());
      await panel.getByLabel("Publication review reason", { exact: false }).fill(`${marker}: Reviewed current service statements, preserving all statuses and evidence. Clarified the existing not-offered meals statement with synthetic-data disclosure.`);
      await panel.getByRole("checkbox").check();
      await panel.getByRole("button", { name: "Save verified service information", exact: true }).click();
      await page.getByText("Family-service review saved.", { exact: false }).waitFor({ timeout: 20000 });
      await page.reload({ waitUntil: "networkidle" });
      await expect(description).toHaveValue(new RegExp(marker));
      return { change: "Synthetic disclosure in meals description", status: "not_offered preserved", verified: "Reviewed configuration persisted on reload; separate public gate remains" };
    });
  }
  if (role === "teacher" && selected("class-tabs")) {
    await scenario(page, role, "class-tabs", async () => {
      await page.goto("/classes?section=7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0", { waitUntil: "networkidle" });
      const checks = [];
      for (const tab of ["planning", "files", "syllabus", "announcements", "people", "teacher-guide", "lessons", "overview"]) {
        await page.locator(`a[href$="&tab=${tab}"]`).first().click();
        await page.waitForURL(url => url.searchParams.get("tab") === tab);
        const body = await page.locator("main").innerText();
        const controls = await page.locator("main input, main textarea, main select, main button").evaluateAll(elements => elements.map(element => ({ type: element.getAttribute("type"), accept: element.getAttribute("accept"), label: element.getAttribute("aria-label") ?? element.labels?.[0]?.textContent ?? element.textContent })));
        checks.push({ tab, controls });
        log({ role, scenario: "class-tab", tab, outcome: "clicked-and-rendered", controls, text: body.slice(-5000) });
      }
      return { tabs: checks.map(check => check.tab) };
    });
  }
  if (role === "teacher" && selected("group-session")) {
    await scenario(page, role, "group-session", async () => {
      const events = readFileSync(journal, "utf8").trim().split("\n").map(JSON.parse);
      const created = events.find(event => event.scenario === "create-study-group" && event.detail?.groupUrl);
      if (!created) throw new Error("No recorded newly created group is available.");
      const groupId = new URL(created.detail.groupUrl).searchParams.get("group");
      await page.goto(`/teacher/study-groups?group=${groupId}`, { waitUntil: "networkidle" });
      const queue = page.locator("section").filter({ has: page.getByRole("heading", { name: "Membership requests", exact: true }) });
      const row = queue.locator("div.flex.items-center").filter({ hasText: /^Jordan\s*·/ });
      const approvalAvailable = await row.count() > 0;
      if (approvalAvailable) {
        await row.getByRole("button", { name: "Approve", exact: true }).click();
        await page.getByText("Study group change saved.", { exact: true }).waitFor();
      }
      const session = page.getByRole("link", { name: `${marker} Algebra practice session`, exact: true });
      if (await session.count()) {
        return { groupId, approvalAvailable, session: "Existing synthetic session verified; no duplicate scheduled", reviewQueue: await queue.innerText() };
      }
      await page.getByLabel("Choose study group").selectOption(groupId);
      await page.getByLabel("Session title", { exact: true }).fill(`${marker} Algebra practice session`);
      await page.getByLabel("Agenda", { exact: true }).fill(`${marker}: Compare solution methods and practice respectful peer feedback. Synthetic future session; no attendance is claimed.`);
      await page.getByLabel("Starts at", { exact: false }).fill("2026-11-10T15:00");
      await page.getByLabel("Ends at", { exact: false }).fill("2026-11-10T16:00");
      await page.getByRole("button", { name: "Schedule", exact: true }).click();
      await page.getByRole("link", { name: `${marker} Algebra practice session`, exact: true }).waitFor({ timeout: 20000 });
      return { groupId, approvalAvailable, approvalClicked: approvalAvailable, session: "Future synthetic session scheduled; no attendance recorded", reviewQueue: await queue.innerText() };
    });
  }
  if (role === "teacher" && selected("video-upload")) {
    await scenario(page, role, "video-upload", async () => {
      await page.goto("/classes?section=7b6eb18e-8191-fbd5-bc2d-cd860e6b26a0&tab=files", { waitUntil: "networkidle" });
      const form = page.getByRole("form", { name: "Upload class video", exact: true });
      if (!await form.getByRole("button", { name: "Upload video", exact: true }).isEnabled()) {
        return { blocked: "Video upload is disabled by this deployment; no storage gate changed" };
      }
      const bytes = await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 320; canvas.height = 180;
        const drawing = canvas.getContext("2d");
        const stream = canvas.captureStream(24);
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
        const chunks = [];
        const finished = new Promise(resolveVideo => {
          recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
          recorder.onstop = async () => resolveVideo(Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer())));
        });
        recorder.start();
        for (let frame = 0; frame < 30; frame += 1) {
          drawing.fillStyle = "#ffffff"; drawing.fillRect(0, 0, 320, 180);
          drawing.fillStyle = "#184c38"; drawing.font = "20px sans-serif";
          drawing.fillText("SYNTHETIC QA VIDEO", 24, 40);
          drawing.fillText("2x + 3 = 11; x = 4", 24, 90);
          drawing.fillStyle = "#da3452"; drawing.fillRect(24, 125, 8 + frame * 8, 12);
          await new Promise(nextFrame => requestAnimationFrame(nextFrame));
        }
        recorder.stop();
        const video = await finished;
        stream.getTracks().forEach(track => track.stop());
        return video;
      });
      const video = Buffer.from(bytes);
      writeFileSync(resolve(directory, "synthetic-algebra-qa.webm"), video);
      await form.getByLabel("Video title", { exact: false }).fill(`${marker} Synthetic algebra video`);
      await form.getByLabel("Video file", { exact: false }).setInputFiles({ name: "synthetic-algebra-qa.webm", mimeType: "video/webm", buffer: video });
      await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: "Upload video", exact: true }).click();
      await expect.poll(async () => {
        const text = await form.innerText();
        return /Video uploaded and attached|Unable to upload this video/.test(text);
      }, { timeout: 60000 }).toBe(true);
      const feedback = await form.innerText();
      if (feedback.includes("Unable to upload this video")) return { blocked: feedback, bytes: video.length, generated: "Valid original WebM; no authentic media" };
      return { uploaded: true, title: `${marker} Synthetic algebra video`, bytes: video.length, generated: "Original canvas animation" };
    });
  }
  if (role === "parent" && selected("trip-permission")) {
    await scenario(page, role, "trip-permission", async () => {
      await page.goto("/guardian/field-trips", { waitUntil: "networkidle" });
      const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: `${marker} Science museum planning`, exact: true }) });
      await expect(card.getByRole("button", { name: "Sign permission", exact: true })).toBeDisabled();
      await card.getByRole("checkbox").check();
      await card.getByRole("button", { name: "Sign permission", exact: true }).click();
      await page.getByText("Your field trip permission was recorded.", { exact: true }).waitFor({ timeout: 20000 });
      return { permission: "Signed by ordinary guardian session", fee: 0, realTravel: false };
    });
  }
  if (role === "parent" && selected("offer-checklists")) {
    await scenario(page, role, "offer-checklists", async () => {
      await page.goto("/guardian/admission-offers", { waitUntil: "networkidle" });
      const buttons = page.getByRole("button", { name: "View enrollment checklist", exact: true });
      const checks = [];
      for (let index = 0; index < await buttons.count(); index += 1) {
        await buttons.nth(index).click();
        checks.push({ checklist: index + 1, controls: await page.locator("main button, main input").evaluateAll(elements => elements.map(element => ({ type: element.getAttribute("type"), label: element.getAttribute("aria-label") ?? element.labels?.[0]?.textContent ?? element.textContent, disabled: element.disabled }))) });
      }
      const accept = page.getByRole("button", { name: "Accept", exact: true });
      return { checklistsOpened: checks.length, availableAcceptButtons: await accept.count(), checks, note: "Existing accepted offers left intact; no new verified guardian invented" };
    });
  }
  if (selected("workspace-controls")) {
    await scenario(page, role, "workspace-controls", async () => {
      await page.goto("/home", { waitUntil: "networkidle" });
      const checks = [];
      for (const name of ["Search workspace", "Notifications", "Account menu"]) {
        const button = page.getByRole("button", { name, exact: true });
        if (!await button.count()) continue;
        await button.click();
        checks.push({ opened: name, dialogs: await page.getByRole("dialog").allTextContents() });
        await page.keyboard.press("Escape");
        const close = page.getByRole("button", { name: /Close Notifications|Close search|Close account/ }).first();
        if (await close.isVisible().catch(() => false)) await close.click();
      }
      await page.setViewportSize({ width: 390, height: 844 });
      const menu = page.getByRole("button", { name: "Open workspace navigation", exact: true });
      if (await menu.isVisible()) {
        await menu.click();
        checks.push({ opened: "Mobile workspace navigation", navigationCount: await page.getByRole("navigation").count() });
        await page.keyboard.press("Escape");
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error("Mobile workspace has horizontal overflow.");
      return { checks, viewport: "390x844", horizontalOverflow: false };
    });
  }
}
try {
  for (const role of options.role ? options.role.split(",") : Object.keys(accounts)) {
    if (!accounts[role]) throw new Error(`Unknown role: ${role}`);
    const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await page.goto("/access", { waitUntil: "networkidle", timeout: 30000 });
      await page.getByRole("textbox", { name: /Email/ }).fill(accounts[role]);
      await page.getByRole("textbox", { name: /Access code/ }).fill("000000");
      const verification = page.waitForResponse(response => new URL(response.url()).pathname === "/access/verify" && response.request().method() === "POST");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const verificationResponse = await verification;
      const destination = verificationResponse.headers().location;
      log({ role, scenario: "native-credential-response", status: verificationResponse.status(), destination: destination?.startsWith("/") ? destination : undefined });
      if (verificationResponse.status() >= 400) throw new Error(`Normal credential verification returned HTTP ${verificationResponse.status()}.`);
      if (role === "room_admin" && destination === "/access") {
        await page.getByRole("link", { name: "Attendance", exact: true }).click();
        log({ role, scenario: "landing-recovery", outcome: "followed-authorized-sidebar-link", originalDestination: "/access", url: page.url() });
      }
      await page.waitForURL(url => !url.pathname.startsWith("/access"), { timeout: 30000 });
      log({ role, scenario: "sign-in", outcome: "passed", url: page.url(), errors: [...errors] });
      if (options.mutations === "true") await mutations(page, role);
      const selectedRoutes = options.routes === "none" ? [] : options.routes ? options.routes.split(",") : routes[role];
      for (const [index, path] of selectedRoutes.entries()) {
        errors.length = 0;
        try {
          const response = await page.goto(path, { waitUntil: "networkidle", timeout: 30000 });
          const body = await page.locator("body").innerText();
          const controls = await page.locator("input, textarea, select, button").evaluateAll(elements => elements.map(element => ({
            tag: element.tagName.toLowerCase(), type: element.getAttribute("type"),
            name: element.getAttribute("name"), label: element.getAttribute("aria-label") ?? element.labels?.[0]?.textContent ?? element.textContent,
            disabled: element.disabled, options: element.tagName === "SELECT" ? [...element.options].map(option => ({ value: option.value, text: option.text })) : undefined,
          })));
          const links = await page.locator("main a[href]").evaluateAll(elements => elements.map(element => ({ text: element.textContent, href: element.getAttribute("href") })));
          const stem = `${role}-${Date.now()}-${index}`;
          writeFileSync(resolve(directory, `${stem}.txt`), body);
          await page.screenshot({ path: resolve(directory, `${stem}.png`), fullPage: true });
          const alerts = await page.getByRole("alert").allTextContents();
          const denied = alerts.some(text => /access denied|not authorized|do not have permission/i.test(text));
          const outcome = errors.length ? "page-error" : response?.status() >= 400 ? "http-error" : denied ? "permission-denied" : "rendered";
          log({ role, scenario: "route-controls", path, url: page.url(), status: response?.status(), outcome, errors: [...errors], controls, links, text: body.slice(0, 1800), snapshot: `${stem}.txt`, screenshot: `${stem}.png` });
        } catch (error) {
          failures += 1;
          log({ role, scenario: "route-controls", path, outcome: "failed", error: error.message, errors: [...errors] });
        }
      }
    } catch (error) {
      failures += 1;
      log({ role, scenario: "sign-in", outcome: "failed", error: error.message, url: page.url(), text: (await page.locator("body").innerText()).slice(-2000), errors: [...errors] });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
log({ scenario: "run-summary", failures, journal });
process.exitCode = failures ? 1 : 0;