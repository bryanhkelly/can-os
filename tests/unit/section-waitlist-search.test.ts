import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandContext } from "@/domain/command-context";
import { searchSectionWaitlistStudents } from "@/modules/programs/section-waitlist-search.server";

const state = vi.hoisted(() => ({ rows: [] as unknown[][][], queries: [] as { sql: string; params: unknown[] }[] }));
vi.mock("@/db/client", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return { db: drizzle(async (sql, params) => {
    state.queries.push({ sql, params });
    return { rows: state.rows.shift() ?? [] };
  }) };
});
const context: CommandContext = { actorPersonId: "registrar", capabilities: new Set(["program.launch.start", "enrollment:manage"]),
  scope: { organizationIds: ["org"], programIds: ["program"], siteIds: ["site"] } };
const section = ["section", true, "program", "site", "org", "year"];
beforeEach(() => { state.rows = [[section]]; state.queries = []; });
describe("section waitlist student search", () => {
  it.each(["program.launch.start", "enrollment:manage"])("requires %s before reading identities", async capability => {
    await expect(searchSectionWaitlistStudents({ ...context,
      capabilities: new Set([...context.capabilities].filter(value => value !== capability)) }, "section", "Jo"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.queries).toHaveLength(0);
  });
  it.each(["organizationIds", "siteIds", "programIds", "sectionIds"] as const)("rejects a section outside %s before searching students", async key => {
    await expect(searchSectionWaitlistStudents({ ...context, scope: { ...context.scope, [key]: [] } }, "section", "Jo"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(state.queries).toHaveLength(1);
  });
  it("restricts eligibility to active same-organization Program/year membership and excludes enrolled/waitlisted students", async () => {
    state.rows.push([["student", "Jordan", "Fixture", "Jo", "9", "S001"]]);
    const result = await searchSectionWaitlistStudents(context, "section", "Jo_%!");
    expect(result).toEqual({ students: [{ studentProfileId: "student", name: "Jo Fixture", gradeLevel: "9", studentNumber: "S001" }], hasMore: false });
    const query = state.queries[1]!;
    expect(query.params).toEqual(expect.arrayContaining(["org", "program", "year", "program", "active", true, "%Jo!_!%!!%", "section", "section_waitlist", "open", "waiting", "in_progress", 26]));
    expect(query.sql).toContain('"enrollments"."school_year_id"');
    expect(query.sql).toContain('"enrollments"."organization_id"');
    expect(query.sql.match(/not exists/g)).toHaveLength(2);
    expect(result.students[0]).not.toHaveProperty("legalFirstName");
  });
  it("preserves section-restricted student visibility in addition to target section authorization", async () => {
    state.rows.push([]);
    await searchSectionWaitlistStudents({ ...context, scope: { ...context.scope, sectionIds: ["section", "other-permitted"] } }, "section", "Jo");
    const query = state.queries[1]!;
    expect(query.sql).toContain('"waitlist_visible_enrollment"."student_profile_id" = "student_profiles"."id"');
    expect(query.sql).toContain('"waitlist_visible_section"."id" in');
    expect(query.params).toContain("other-permitted");
    expect(query.params.filter(value => value === "year")).toHaveLength(2);
    expect(query.params.filter(value => value === "site")).toHaveLength(1);
  });
  it("bounds identity results and signals when staff should refine the search", async () => {
    state.rows.push(Array.from({ length: 26 }, (_, i) => [`student-${i}`, "Jordan", "Fixture", null, "9", `S${i}`]));
    const result = await searchSectionWaitlistStudents(context, "section", "Jordan");
    expect(result.students).toHaveLength(25);
    expect(result.hasMore).toBe(true);
  });
  it.each(["", "J", "x".repeat(101)])("does not search identities for invalid query %s", async query => {
    expect(await searchSectionWaitlistStudents(context, "section", query)).toEqual({ students: [], hasMore: false });
    expect(state.queries).toHaveLength(1);
  });
  it("does not offer new waitlist candidates for a closed section", async () => {
    state.rows = [[section.map((value, i) => i === 1 ? false : value)]];
    expect(await searchSectionWaitlistStudents(context, "section", "Jo")).toEqual({ students: [], hasMore: false });
    expect(state.queries).toHaveLength(1);
  });
});
