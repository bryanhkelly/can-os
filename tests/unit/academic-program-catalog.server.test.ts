import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/domain/command-context";

const state = vi.hoisted(() => ({
  rows: [] as Array<{
    programId: string; publicationSiteId: string; title: string;
    summary: string; gradeRange: { min: string; max: string };
    deliveryModel: { onsite: boolean; asynchronous: boolean; liveOnline: boolean;
      onsiteDaysPerWeek: number | null };
    type: "church_hosted_academy"; status: string;
    programSiteId: string; organizationId: string; siteOrganizationId: string;
  }>,
  academicAuthority: true,
  admissionsAuthority: true,
  unexpectedError: false,
  checkedServices: [] as string[],
}));

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/modules/programs/program-site-authorization.server", () => ({
  requireChurchHostedOperatingServices: async (
    _executor: unknown, _programId: string, services: string[],
  ) => {
    state.checkedServices.push(services.join(","));
    if (state.unexpectedError) throw new Error("database unavailable");
    if (services.includes("academic_instruction") && !state.academicAuthority)
      throw new AuthorizationError("independent academic authorization");
    if (services.includes("admissions") && !state.admissionsAuthority)
      throw new AuthorizationError("authorized family admissions");
    return "signed-agreement";
  },
}));

import { readAcademicProgramCatalog } from "@/modules/sites/academic-program-catalog.server";

function fakeReader() {
  const builder = {
    innerJoin() { return this; },
    where() { return this; },
    orderBy() { return this; },
    limit() { return Promise.resolve(state.rows); },
  };
  return { select: () => ({ from: () => builder }) };
}

beforeEach(() => {
  state.rows = [{
    programId: "program-1", publicationSiteId: "site-1",
    title: "Church-Hosted Academy", summary: "A cohort supervised at our church.",
    gradeRange: { min: "9", max: "12" },
    deliveryModel: { onsite: true, asynchronous: true,
      liveOnline: false, onsiteDaysPerWeek: 2 },
    type: "church_hosted_academy", status: "active",
    programSiteId: "site-1", organizationId: "church-1",
    siteOrganizationId: "church-1",
  }];
  state.academicAuthority = true;
  state.admissionsAuthority = true;
  state.unexpectedError = false;
  state.checkedServices = [];
});

describe("approved academic listing and real admissions authority", () => {
  it("hides previously approved public copy if CAN operating authority expires", async () => {
    state.academicAuthority = false;
    const listed = await readAcademicProgramCatalog("site-1", fakeReader() as never);
    expect(listed).toEqual([]);
    expect(state.checkedServices).toEqual(["academic_instruction,school_of_record"]);
  });
  it("continues marketing an operating Program without falsely opening applications", async () => {
    state.admissionsAuthority = false;
    const listed = await readAcademicProgramCatalog("site-1", fakeReader() as never);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.availability).toBe("operating");
    expect(listed[0]?.applicationOpen).toBe(false);
  });
  it("invites verified family applications only with both independently checked services", async () => {
    const listed = await readAcademicProgramCatalog("site-1", fakeReader() as never);
    expect(listed[0]?.applicationOpen).toBe(true);
    expect(state.checkedServices).toEqual([
      "academic_instruction,school_of_record", "admissions,school_of_record",
    ]);
  });
  it("never advertises Apply for a proposed Program", async () => {
    state.rows[0]!.status = "launching";
    const listed = await readAcademicProgramCatalog("site-1", fakeReader() as never);
    expect(listed[0]?.applicationOpen).toBe(false);
    expect(state.checkedServices).toEqual(["academic_instruction,school_of_record"]);
  });
  it("fails closed for unexpected database errors rather than advertising stale authorization", async () => {
    state.unexpectedError = true;
    await expect(readAcademicProgramCatalog("site-1", fakeReader() as never))
      .rejects.toThrow(/database unavailable/);
  });
});
