import { describe, expect, it, vi } from "vitest";
import {
  groupSessionSelectionSchema, optionalSearchString, optionalSearchUuid,
  siteProgramHref, siteProgramSelectionSchema, uuidProgramSelectionSchema,
} from "@/lib/route-search";
import { Route as Capacity } from "@/routes/admissions.capacity";
import { Route as Families } from "@/routes/admissions.families";
import { Route as Admissions } from "@/routes/admissions.index";
import { Route as Intake } from "@/routes/admissions.intake";
import { Route as Operations } from "@/routes/operations";
import { Route as OperationsIndex } from "@/routes/home";
import { Route as Insights } from "@/routes/operations.insights";
import { Route as Website } from "@/routes/site-website";
import { Route as Groups } from "@/routes/groups";
import { Route as StudentGroups } from "@/routes/student.study-groups";
import { Route as TeacherGroups } from "@/routes/teacher.study-groups";
import { Route as Admin } from "@/routes/admin";
import { Route as Apply } from "@/routes/launch.family";
import { Route as Attendance } from "@/routes/staff.attendance";
import { Route as Curriculum } from "@/routes/operations.curriculum";
import { Route as Marketplace } from "@/routes/operations.curriculum-marketplace";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@neondatabase/serverless", () => ({ Pool: class {} }));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: () => ({}) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options }),
  Link: () => null, Outlet: () => null,
}));

const uuid = "00000000-0000-4000-8000-000000000123";
const siteProgramRoutes = [
  ["capacity", Capacity], ["family readiness", Families], ["admissions", Admissions], ["intake", Intake],
  ["operations layout", Operations], ["operations index", OperationsIndex], ["insights", Insights], ["website", Website],
] as const;
const groupRoutes = [["student groups", StudentGroups], ["teacher groups", TeacherGroups]] as const;
const allRoutes = [...siteProgramRoutes, ...groupRoutes, ["groups", Groups], ["admin", Admin],
  ["guardian apply", Apply], ["attendance", Attendance], ["curriculum", Curriculum], ["marketplace", Marketplace]] as const;

function parse(route: { options: { validateSearch?: unknown } }, search: Record<string, unknown>): Record<string, unknown> {
  if (typeof route.options.validateSearch !== "function") throw new Error("Missing route search validator");
  return route.options.validateSearch(search);
}
function params(query: string): Record<string, unknown> {
  return Object.fromEntries(new URLSearchParams(query));
}
function loaderDeps(route: { options: { validateSearch?: unknown; loaderDeps?: unknown } }, search: Record<string, unknown>): unknown {
  if (typeof route.options.loaderDeps !== "function") throw new Error("Missing loader dependencies");
  return route.options.loaderDeps({ search: parse(route, search) });
}

describe("shared selection fields", () => {
  it("preserves scoped navigation order and encoding while omitting absent selections", () => {
    expect(siteProgramHref("/admissions", { siteId: "school one", programId: "program" }))
      .toBe("/admissions?siteId=school+one&programId=program");
    expect(siteProgramHref("/home", { siteId: "school" })).toBe("/home?siteId=school");
    expect(siteProgramHref("/admissions/capacity", {})).toBe("/admissions/capacity");
  });
  it.each([undefined, null, false, 1, [], ["site"], {}, { id: "site" }])("does not coerce malformed %j", value => {
    expect(optionalSearchString.parse(value)).toBeUndefined();
    expect(optionalSearchUuid.parse(value)).toBeUndefined();
    expect(siteProgramSelectionSchema.parse({ siteId: value, programId: value }))
      .toEqual({ siteId: undefined, programId: undefined });
    expect(groupSessionSelectionSchema.parse({ group: value, session: value }))
      .toEqual({ group: undefined, session: undefined });
  });
  it("preserves opaque and empty string selections rather than introducing UUID or trimming rules", () => {
    expect(siteProgramSelectionSchema.parse({ siteId: "school", programId: " program " }))
      .toEqual({ siteId: "school", programId: " program " });
    expect(groupSessionSelectionSchema.parse({ group: "", session: "session" }))
      .toEqual({ group: "", session: "session" });
  });
  it("keeps ignored UUID hints separate from strict curriculum validation", () => {
    expect(optionalSearchUuid.parse("not-a-uuid")).toBeUndefined();
    expect(optionalSearchUuid.parse(uuid)).toBe(uuid);
    expect(uuidProgramSelectionSchema.parse({})).toEqual({});
    expect(() => uuidProgramSelectionSchema.parse({ programId: "not-a-uuid" })).toThrow();
  });
});

describe("composed route search contracts", () => {
  it.each(allRoutes)("%s allows missing selections without adding unrelated fields", (_name, route) => {
    expect(() => parse(route, {})).not.toThrow();
    const result = parse(route, { unsupported: "discard" });
    expect(result).not.toHaveProperty("unsupported");
    for (const [key, value] of Object.entries(result)) {
      expect(["page", "studentPage"].includes(key) ? value === 1 : value === undefined).toBe(true);
    }
  });
  it.each(siteProgramRoutes)("%s preserves site/program deep links", (_name, route) => {
    expect(parse(route, params("siteId=school&programId=program"))).toMatchObject({ siteId: "school", programId: "program" });
    expect(parse(route, { siteId: ["school"], programId: 42 })).toMatchObject({ siteId: undefined, programId: undefined });
    expect(parse(route, { siteId: "school" }).siteId).toBe("school");
    expect(parse(route, { programId: "program" }).programId).toBe("program");
  });
  it.each(groupRoutes)("%s retains both independent group and session selections", (_name, route) => {
    expect(parse(route, params("group=group&session=session"))).toEqual({ group: "group", session: "session" });
    expect(parse(route, { session: "session" }).session).toBe("session");
    expect(parse(route, { group: "group", session: ["bad"] })).toEqual({ group: "group", session: undefined });
  });
  it("does not add session selection to the group-only workspace", () => {
    expect(parse(Groups, { group: "group", session: "session" })).toEqual({ group: "group" });
  });
  it.each([Operations, OperationsIndex])("preserves the action deep link on both operations levels", route => {
    expect(parse(route, params("siteId=school&programId=program&action=action")))
      .toEqual({ siteId: "school", programId: "program", action: "action" });
  });
  it("retains insight, website return and guardian application context", () => {
    expect(parse(Insights, params("siteId=school&programId=program&insight=insight")).insight).toBe("insight");
    expect(parse(Website, params("siteId=school&programId=program&returnGrantId=grant")).returnGrantId).toBe("grant");
    expect(parse(Apply, params("programId=program&familyStart=token&application=application&siteId=unused")))
      .toEqual({ programId: "program", familyStart: "token", application: "application" });
    expect(parse(Website, { returnGrantId: {} }).returnGrantId).toBeUndefined();
    expect(parse(Insights, { insight: true }).insight).toBeUndefined();
  });
  it("retains the staff-invitation role allowlist and site-only contract", () => {
    expect(parse(Admin, { siteId: "site", inviteRole: "site_website_editor", programId: "unused" }))
      .toEqual({ siteId: "site", inviteRole: "site_website_editor" });
    expect(parse(Admin, { inviteRole: "registrar" }).inviteRole).toBe("registrar");
    expect(parse(Admin, { inviteRole: "admin" }).inviteRole).toBeUndefined();
  });
  it("keeps attendance UUID hints fail-closed without changing the route's supported keys", () => {
    expect(parse(Attendance, { programId: uuid, siteId: "unused" })).toEqual({ programId: uuid });
    expect(parse(Attendance, { programId: "program" }).programId).toBeUndefined();
  });
  it.each([Curriculum, Marketplace])("retains strict curriculum program validation", route => {
    expect(parse(route, { programId: uuid, siteId: "unused" })).toEqual({ programId: uuid });
    for (const programId of ["bad", "", 4, null, ["bad"]])
      expect(() => parse(route, { programId })).toThrow();
  });
  it.each([
    ["capacity", Capacity, ["siteId", "programId"]],
    ["family readiness", Families, ["siteId", "programId", "application", "page"]],
    ["admissions", Admissions, ["siteId", "programId", "application", "stage", "page"]],
    ["intake", Intake, ["siteId", "programId", "application", "interest", "page", "studentPage", "search"]],
    ["operations layout", Operations, ["siteId", "programId", "action"]],
    ["home", OperationsIndex, ["siteId", "programId", "action", "student", "gradeAction", "case", "person", "returnGrantId", "date"]],
    ["insights", Insights, ["siteId", "programId", "insight"]],
    ["website", Website, ["siteId", "programId", "returnGrantId"]],
    ["groups", Groups, ["group"]],
    ["student groups", StudentGroups, ["group", "session"]],
    ["teacher groups", TeacherGroups, ["group", "session"]],
    ["admin", Admin, ["siteId", "inviteRole"]],
    ["apply", Apply, ["programId", "application", "familyStart"]],
    ["attendance", Attendance, ["programId", "student", "date"]],
    ["curriculum", Curriculum, ["programId"]],
    ["marketplace", Marketplace, ["programId"]],
  ] as const)("%s retains only its supported search fields", (_name, route, keys) => {
    const result = parse(route, {
      siteId: "school", programId: uuid, application: uuid, stage: "accepted", page: 2,
      interest: "interest", studentPage: 3, search: "query", action: "action",
      insight: "insight", returnGrantId: "grant", group: "group", session: "session",
      inviteRole: "registrar", familyStart: "token", unsupported: "discard",
      student: uuid, date: "2026-11-04", gradeAction: "grade", case: "case", person: uuid,
    });
    expect(Object.keys(result).sort()).toEqual([...keys].sort());
    expect(Object.values(result)).not.toContain(undefined);
  });
});

describe("admissions-specific search fields", () => {
  it("preserves family readiness application links and numeric-only pagination defaults", () => {
    expect(parse(Families, { siteId: "school", programId: "program", application: "application", page: 2 }))
      .toEqual({ siteId: "school", programId: "program", application: "application", page: 2 });
    for (const page of [undefined, "2", 0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
      expect(parse(Families, { page }).page).toBe(1);
    expect(parse(Families, { application: ["bad"] }).application).toBeUndefined();
  });
  it("preserves intake context, independent pages and search truncation", () => {
    expect(parse(Intake, { siteId: "school", programId: "program", application: "application",
      interest: "interest", page: 2, studentPage: 3, search: "x".repeat(101) }))
      .toEqual({ siteId: "school", programId: "program", application: "application",
        interest: "interest", page: 2, studentPage: 3, search: "x".repeat(100) });
    expect(parse(Intake, { page: "2", studentPage: -1, search: {} }))
      .toMatchObject({ page: 1, studentPage: 1, search: undefined });
  });
  it("retains admissions UUID, stage and capped string-or-number pagination", () => {
    expect(parse(Admissions, params(`siteId=school&programId=program&application=${uuid}&stage=accepted&page=3`)))
      .toEqual({ siteId: "school", programId: "program", application: uuid, stage: "accepted", page: 3 });
    for (const page of [10001, "10001"]) expect(parse(Admissions, { page }).page).toBe(10000);
    for (const page of [0, -1, 1.2, "1.2", "no", null, []])
      expect(parse(Admissions, { page }).page).toBeUndefined();
    expect(parse(Admissions, { application: "bad", stage: "unknown" }))
      .toMatchObject({ application: undefined, stage: undefined });
  });
  it("keeps loader dependency names and family application mapping intact", () => {
    expect(loaderDeps(Capacity, { siteId: "school", programId: "program" }))
      .toEqual({ siteId: "school", programId: "program" });
    expect(loaderDeps(Families, { application: "application", page: 2 }))
      .toEqual({ siteId: undefined, programId: undefined, applicationId: "application", page: 2 });
  });
});
