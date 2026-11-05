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

