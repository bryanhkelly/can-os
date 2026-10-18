import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { searchWorkspace } from "@/modules/search/global-search.functions";
import type { Actor } from "@/modules/identity/actors.server";

const state = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ validator() { return this; }, handler(callback: unknown) { return callback; } }),
}));
vi.mock("@tanstack/react-start/server", () => ({ setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/actors.server", () => ({ requireActor: async () => {
  if (!state.actor) throw new Error("Test actor missing");
  return state.actor;
} }));

describe("canonical workspace search", () => {
  it("finds authentic related students while denying absent or mismatched scope", async () => {
    const suffix = crypto.randomUUID();
    const [org] = await db.insert(s.organizations).values({
      name: "Search School", slug: `search-${suffix}`, type: "christian_school",
    }).returning();
    const [jurisdiction] = await db.insert(s.jurisdictions).values({ code: suffix, name: "Search" }).returning();
    const [site] = await db.insert(s.sites).values({
      organizationId: org!.id, name: "Search Site", slug: `search-${suffix}`,
    }).returning();
    const [program] = await db.insert(s.programs).values({
      organizationId: org!.id, siteId: site!.id, jurisdictionId: jurisdiction!.id,
      type: "high_school_extension", status: "active", name: "Search Program", slug: `search-${suffix}`,
      gradeRange: { min: "9", max: "12" },
      academicProviderOrganizationId: org!.id, creditIssuingOrganizationId: org!.id,
    }).returning();
    const [guardian, student] = await db.insert(s.people).values([
      { legalFirstName: "Guardian", legalLastName: suffix },
      { legalFirstName: "Alex", legalLastName: suffix },
    ]).returning();
    const [profile] = await db.insert(s.studentProfiles).values({ personId: student!.id, gradeLevel: "9" }).returning();
    await db.insert(s.guardianRelationships).values({
      guardianPersonId: guardian!.id, studentPersonId: student!.id,
      relationshipLabel: "parent", canViewAcademics: true,
    });
    await db.insert(s.enrollments).values({
      studentProfileId: profile!.id, organizationId: org!.id, programId: program!.id,
      kind: "program", status: "active",
    });
    state.actor = {
      actorPersonId: guardian!.id, role: "guardian", capabilities: new Set(["student:related-read"]),
      accountId: "test", sessionId: "test", grantId: "test",
      scope: { siteIds: [site!.id], programIds: [program!.id] },
    };
    const result = await searchWorkspace({ data: { query: suffix } });
    expect(result.students).toEqual([expect.objectContaining({
      id: `student-${student!.id}`, label: `Alex ${suffix}`, to: "/guardian/academics",
    })]);
    for (const scope of [
      { siteIds: [], programIds: [program!.id] },
      { siteIds: [site!.id], programIds: [] },
      { siteIds: [site!.id], programIds: [crypto.randomUUID()] },
    ]) {
      state.actor = { ...state.actor, scope };
      expect((await searchWorkspace({ data: { query: suffix } })).students).toEqual([]);
    }
  });
});
