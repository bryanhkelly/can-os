import { neon } from "@neondatabase/serverless";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createAccessSession, withAuthenticatedPage } from "./helpers/authenticated-persona";
import { expectWorkspaceRoute, expectWorkspaceShell } from "./helpers/workspace-assertions";
import { createGf1Fixture, destroyGf1Fixture, type Gf1Fixture, type Sql } from "./fixture";
import { DATABASE_URL } from "./env";
import { insertFixtureId } from "./helpers/canonical-fixture";

const sql: Sql | null = DATABASE_URL ? neon(DATABASE_URL) : null;
let fixture: Gf1Fixture | undefined;
const additionalGrantIds: string[] = [];
const sessionExpiresAt = () => new Date(Date.now() + 60 * 60 * 1000);
let roleSecrets: Record<string, string> = {};
const smokeManifest = JSON.parse(readFileSync(new URL("./route-smoke-manifest.json", import.meta.url), "utf8")) as {
  authenticatedPersonas: readonly { persona: string; destination: string }[];
  authenticatedDynamicRoutes: readonly { persona: string; route: string }[];
};

test.beforeAll(async () => {
  if (!sql) throw new Error("TEST_DATABASE_URL is required for authenticated route smoke fixtures.");
  fixture = await createGf1Fixture(sql);
  const grantAndSession = async (role: string, organizationId: string, siteId: string | null) => {
    const grantId = await insertFixtureId(sql, `
      insert into account_person_grants (account_id, person_id, role, organization_id, site_id, active)
      values ($1, $2, $3, $4, $5, true) returning id`,
    [fixture!.teacherAccountId, fixture!.teacherPersonId, role, organizationId, siteId]);
    additionalGrantIds.push(grantId);
    return createAccessSession(sql, {
      accountId: fixture!.teacherAccountId, activeGrantId: grantId, expiresAt: sessionExpiresAt(),
    });
  };

  roleSecrets = {
    student: fixture.studentSecret,
    guardian: fixture.guardianSecret,
    teacher: fixture.teacherSecret,
    registrar: await grantAndSession("registrar", fixture.hostOrgId, fixture.siteId),
    site_admin: await grantAndSession("site_admin", fixture.hostOrgId, fixture.siteId),
    site_leader: await grantAndSession("site_leader", fixture.hostOrgId, fixture.siteId),
    room_facilitator: await grantAndSession("room_facilitator", fixture.hostOrgId, fixture.siteId),
    can_network_steward: await grantAndSession("can_network_steward", fixture.canOrgId, null),
    can_jurisdiction_reviewer: await grantAndSession("can_jurisdiction_reviewer", fixture.canOrgId, null),
  };
});

test.afterAll(async () => {
  if (!sql || !fixture) return;
  try {
    if (additionalGrantIds.length) {
      await sql.query("delete from account_person_grants where id = any($1::uuid[])", [additionalGrantIds]);
    }
  } finally {
    await destroyGf1Fixture(sql, fixture);
  }
});

for (const { persona: role, destination } of smokeManifest.authenticatedPersonas) {
  test(`${role} can use its primary destination`, async ({ browser }) => {
    const secret = roleSecrets[role];
    if (!secret) throw new Error(`Missing synthetic session for ${role}.`);
    await withAuthenticatedPage(browser, secret, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const home = await page.goto("/home");
      expect(home?.status()).toBe(200);
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      const destinationLink = page.locator(`a[href="${destination}"]`).first();
      await expect(destinationLink).toBeVisible();
      await destinationLink.click();
      await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
      await expectWorkspaceShell(page);
      expect(errors).toEqual([]);
    });
  });
}

for (const { persona, route } of smokeManifest.authenticatedDynamicRoutes) {
test(`${persona} opens its dynamic route`, async ({ browser }) => {
  const secret = roleSecrets[persona];
  if (!fixture || !secret) throw new Error(`${persona} smoke fixture is unavailable.`);
  const path = route.replace("$siteId", fixture.siteId);
  await withAuthenticatedPage(browser, secret, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expectWorkspaceShell(page);
    expect(errors).toEqual([]);
  });
});
}

for (const persona of ["student", "guardian", "teacher"] as const) {
  test(`${persona} uses shared messages and calendar routes`, async ({ browser }) => {
    const secret = roleSecrets[persona];
    if (!secret || !fixture) throw new Error(`Missing ${persona} smoke fixture.`);
    await withAuthenticatedPage(browser, secret, async ({ page }) => {
      await expectWorkspaceRoute(page, "/messages", "Messages");
      await expect(page.getByRole("heading", { name: "Conversations", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "New message" })).toBeVisible();

      await expectWorkspaceRoute(page, "/calendar", "Calendar");
      await expect(page.getByRole("navigation", { name: "Calendar view" })).toBeVisible();
      await expect(page.getByLabel("Show")).toBeVisible();
      const movableAssessments = page.locator('a[draggable="true"]');
      if (persona === "teacher") {
        await expect(movableAssessments.first()).toBeVisible();
      } else {
        await expect(movableAssessments).toHaveCount(0);
      }
      if (persona === "student") {
        await expect(page.getByRole("link", { name: "Export deadlines (.ics)" })).toBeVisible();
      }
    });
  });
}


/**
 * Parent P0 acceptance uses the real, independently scoped synthetic guardian
 * session and fixture. These routes were previously missing from the browser
 * sweep, so primary navigation alone could pass while parent loaders failed.
 * No real family data or production deployment is involved.
 */
const guardianP0Destinations = [
  { route: "/guardian/students", heading: "Academic progress" },
  { route: "/classes", heading: "Your family's classes" },
  { route: "/guardian/report-cards", heading: "Report card" },
  { route: "/messages", heading: "Messages" },
  { route: "/notifications", heading: "Notifications" },
  { route: "/guardian/attendance", heading: "Attendance & excuses" },
  { route: "/guardian/experiences", heading: "E2E Campus" },
  { route: "/calendar", heading: "Calendar" },
] as const;

for (const destination of guardianP0Destinations) {
  test(`guardian P0 route ${destination.route} loads with verified family access`, async ({ browser }) => {
    const secret = roleSecrets.guardian;
    if (!secret) throw new Error("Missing synthetic guardian session.");
    await withAuthenticatedPage(browser, secret, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await expectWorkspaceRoute(page, destination.route, destination.heading);
      await expect(page.getByRole("main")).not.toContainText(
        /Sign in with an authorized|You do not have permission to view|Unable to load your workspace/i,
      );
      expect(errors).toEqual([]);
    });
  });
}

test("guardian home links to academic, communication, attendance, safety and conference workflows", async ({ browser }) => {
  const secret = roleSecrets.guardian;
  if (!secret || !fixture) throw new Error("Missing guardian P0 fixture.");
  await withAuthenticatedPage(browser, secret, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/home");
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Family quick links" })).toBeVisible();
    const links = [
      "/guardian/experiences",
      "/guardian/attendance",
      "/guardian/report-cards",
      "/guardian/field-trips",
      "/guardian/health",
    ] as const;
    for (const route of links) {
      await expect(page.locator('nav[aria-label="Family quick links"] a[href^="' + route + '"]').first()).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Official records and credentials" })).toBeVisible();
    await expectWorkspaceShell(page);
    expect(errors).toEqual([]);
  });
});

/**
 * Every student-facing destination must resolve under a real, scoped student
 * session. A home-page smoke test alone misses failures in secondary loaders,
 * shared student services, and legacy links.
 */
const studentDestinations = [
  { route: "/student/courses", heading: "Choose your classes." },
  { route: "/student/assignments", heading: "Your assignments" },
  { route: "/student/discussions", heading: "Course discussions" },
  { route: "/student/experiences", heading: "Your actions" },
  { route: "/student/field-trips", heading: "My field trips" },
  { route: "/student/report-card", heading: "My report card" },
  { route: "/student/settings", heading: "Display settings" },
  { route: "/student/support", heading: "Get help and follow through." },
  { route: "/notifications", heading: "Notifications" },
  { route: "/groups", heading: "Study groups" },
] as const;

test("student visits every learning and support page", async ({ browser }) => {
  const secret = roleSecrets.student;
  if (!secret) throw new Error("Missing synthetic student session.");
  await withAuthenticatedPage(browser, secret, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    for (const destination of studentDestinations) {
      await expectWorkspaceRoute(page, destination.route, destination.heading);
      // A route shell is not enough: a failed loader can render a matching
      // heading with a sign-in/error notice. Check the actual page content.
      await expect(page.getByRole("main")).not.toContainText(
        /Sign in with an authorized|You do not have permission to view|Unable to load your workspace/i,
      );
    }
    await expectWorkspaceShell(page);
    expect(errors).toEqual([]);
  });
});

test("student opens school community from School Life", async ({ browser }) => {
  const secret = roleSecrets.student;
  if (!secret) throw new Error("Missing synthetic student session.");
  await withAuthenticatedPage(browser, secret, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/home");
    const schoolLife = page.locator("#school-life");
    await expect(schoolLife.getByRole("heading", { name: "School Life" })).toBeVisible();
    await schoolLife.locator('a[href^="/student/my-school"]').first().click();
    await expect(page).toHaveURL(/\/student\/my-school(?:\?|$)/);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "About", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("student opens enrolled classroom and assessment detail", async ({ browser }) => {
  const secret = roleSecrets.student;
  if (!secret || !fixture) throw new Error("Missing synthetic student fixture.");
  await withAuthenticatedPage(browser, secret, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const classroom = await page.goto(`/classes?section=${fixture!.sectionId}&tab=lessons`);
    expect(classroom?.status()).toBe(200);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expectWorkspaceShell(page);

    const assignment = await page.goto(`/student/assignments/${fixture!.assessmentId}`);
    expect(assignment?.status()).toBe(200);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your work" })).toBeVisible();
    await expect(page.getByRole("heading", { name: fixture!.assessmentTitle })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit assignment" })).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test("student saves and submits assignment work, then sees persisted receipt", async ({ browser }) => {
  const secret = roleSecrets.student;
  if (!secret || !fixture) throw new Error("Missing synthetic student fixture.");
  const assignmentUrl = "/student/assignments/" + fixture.assessmentId;
  const responseText = "Synthetic student response " + fixture.suffix + ": showing my work.";
  await withAuthenticatedPage(browser, secret, async ({ page }) => {
    await page.goto(assignmentUrl);
    const response = page.getByRole("textbox", { name: /Your response/ });
    await expect(response).toBeEnabled();
    await response.fill(responseText);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft: Saved")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: /Your response/ })).toHaveValue(responseText);

    await page.getByRole("button", { name: "Submit assignment" }).click();
    await expect(page.getByText(/Submitted .*Receipt:/)).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Submitted .*Receipt:/)).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Your response/ })).toHaveCount(0);
  });
});

test("student dashboard class links open the enrolled classroom directory", async ({ browser }) => {
  const secret = roleSecrets.student;
  if (!secret) throw new Error("Missing synthetic student session.");
  await withAuthenticatedPage(browser, secret, async ({ page }) => {
    await page.goto("/home");
    const classLink = page.getByRole("link", { name: /View my classes/ }).first();
    await expect(classLink).toHaveAttribute("href", "/classes");
    await classLink.click();
    await expect(page).toHaveURL(/\/classes(?:\?|$)/);
    await expect(page.getByRole("main").getByRole("heading", { name: "My classes" })).toBeVisible();
  });
});
