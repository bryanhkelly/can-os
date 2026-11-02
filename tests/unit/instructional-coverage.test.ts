import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { coveringInstructorIds } from "@/modules/staffing/instructional-coverage";
import { evaluateInstructionalCoverage } from "@/modules/staffing/instructional-coverage.server";
import type { TeachingEligibilityReader } from "@/modules/staffing/teaching-eligibility.server";

const state=vi.hoisted(()=>({rows:[] as unknown[][],whereClauses:[] as unknown[]}));
vi.mock("@/db/client",()=>({db:{}}));

const window = {
  from: new Date("2027-08-16T07:00:00.000Z"),
  through: new Date("2027-12-19T07:59:59.000Z"),
};
const providerId = "provider-current";
const arrangement = {
  instructorPersonId: "teacher",
  academicProviderOrganizationId: providerId,
  effectiveFrom: window.from,
  effectiveThrough: window.through,
};

describe("instructional delivery coverage", () => {
  it("accepts an assigned instructor covering the exact instructional window", () => {
    expect(coveringInstructorIds(window, providerId, ["teacher"], [arrangement])).toEqual(new Set(["teacher"]));
  });

  it("accepts an arrangement extending beyond the instructional window", () => {
    expect(coveringInstructorIds(window, providerId, ["teacher"], [{
      ...arrangement,
      effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      effectiveThrough: new Date("2028-01-01T00:00:00.000Z"),
    }])).toEqual(new Set(["teacher"]));
  });

  it.each([
    ["starts late", { effectiveFrom: new Date("2027-08-17T00:00:00.000Z") }],
    ["ends early", { effectiveThrough: new Date("2027-12-18T00:00:00.000Z") }],
    ["has no instructor", { instructorPersonId: null }],
    ["belongs to another instructor", { instructorPersonId: "other" }],
  ])("rejects an arrangement that %s", (_label, override) => {
    expect(coveringInstructorIds(window, providerId, ["teacher"], [{ ...arrangement, ...override }])).toEqual(new Set());
  });

  it("accepts an arrangement bound to the Program's current provider", () => {
    expect(coveringInstructorIds(window, providerId, ["teacher"], [
      { ...arrangement, academicProviderOrganizationId: providerId },
    ])).toEqual(new Set(["teacher"]));
  });

  it("rejects an arrangement bound to any other provider", () => {
    expect(coveringInstructorIds(window, providerId, ["teacher"], [
      { ...arrangement, academicProviderOrganizationId: "provider-stale" },
    ])).toEqual(new Set());
  });

  it("keeps coverage attached to each individual instructor", () => {
    expect(coveringInstructorIds(window, providerId, ["covered", "uncovered"], [
      { ...arrangement, instructorPersonId: "covered" },
    ])).toEqual(new Set(["covered"]));
  });
});

describe("instructional coverage section_teachers read",()=>{
  const chain=()=>({
    from(){return this;},innerJoin(){return this;},
    where(predicate:unknown){state.whereClauses.push(predicate);return this;},
    async limit(){return state.rows.shift()??[];},
    then(resolve:(value:unknown[])=>unknown,reject:(error:unknown)=>unknown){
      return Promise.resolve(state.rows.shift()??[]).then(resolve,reject);
    },
  });
  const executor={select:vi.fn(chain)} as unknown as TeachingEligibilityReader;
  const sectionRow={
    id:"section",programId:"program",siteId:"site",active:true,
    organizationId:"church",providerId:"can",programSiteId:"site",
    yearOrganizationId:"church",yearSiteId:"site",yearProgramId:"program",
    startsAt:new Date("2030-01-01"),endsAt:new Date("2030-06-01"),
    startsOn:"2030-01-01",endsOn:"2030-06-01",timezone:"UTC",
  };
  const coveringArrangement={
    instructorPersonId:"teacher",academicProviderOrganizationId:"can",
    effectiveFrom:new Date("2030-01-01"),effectiveThrough:new Date("2030-06-01"),
  };
  beforeEach(()=>{vi.clearAllMocks();state.whereClauses=[];});
  it("reads only teacher-role assignment rows so non-teacher copies cannot count",async()=>{
    state.rows=[[sectionRow],[coveringArrangement],[{personId:"teacher"}]];
    const result=await evaluateInstructionalCoverage("section",executor);
    expect(result.covered).toBe(true);
    expect(result.assignedTeacherIds).toEqual(["teacher"]);
    expect([...result.coveredInstructorIds]).toEqual(["teacher"]);
    const query=new PgDialect().sqlToQuery(state.whereClauses[2] as SQL);
    expect(query.sql).toContain('"section_teachers"."section_id"');
    expect(query.sql).toContain('"section_teachers"."role"');
    expect(query.params).toEqual(["section","teacher"]);
  });
  it("reports no coverage when only non-teacher rows remain after the role filter",async()=>{
    state.rows=[[sectionRow],[coveringArrangement],[]];
    const result=await evaluateInstructionalCoverage("section",executor);
    expect(result.covered).toBe(false);
    expect(result.assignedTeacherIds).toEqual([]);
    expect([...result.coveredInstructorIds]).toEqual([]);
  });
  it("still rejects teacher coverage bound to a stale academic provider",async()=>{
    state.rows=[[sectionRow],[{...coveringArrangement,academicProviderOrganizationId:"stale"}],[{personId:"teacher"}]];
    const result=await evaluateInstructionalCoverage("section",executor);
    expect(result.covered).toBe(false);
    expect(result.assignedTeacherIds).toEqual(["teacher"]);
  });
});
