import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";


const script = new URL("../../scripts/package-algebra1.mjs", import.meta.url);
const run = (...args: string[]) => execFileSync(process.execPath, [script.pathname, ...args], { encoding: "utf8" });
describe("CAN Algebra I packaging controls", () => {
  it("reports actual authored coverage and refuses to mark full-year ready", () => {
    const coverage = JSON.parse(run("--report"));
    expect(coverage).toMatchObject({
      targetWeeks: 36, authoredWeeks: 6, authoredLessons: 30,
      plannedLessons: 180, unwrittenLessons: 150,
      creditStatus: "not_credit_ready", publisherAdoption: "not_authorized",
    });
  });
  it("does not silently publish without an explicit command", () => {
    expect(() => run()).toThrow(/Use --report or --write/);
  });
  it("requires independent Week 2 assessment scoring keys", () => {
    const assessments=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/week02-assessments-draft.json",import.meta.url),"utf8"));
    const key=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/week02-assessment-teacher-key.json",import.meta.url),"utf8"));
    expect(assessments.assessments).toHaveLength(2);
    expect(key.visibility).toBe("teacher_only");
    const keyed=new Set(key.units.flatMap((u: {assessments?: {assessmentKey:string}[]})=>(u.assessments??[]).map(a=>a.assessmentKey)));
    for(const a of assessments.assessments){
      expect(keyed.has(a.key)).toBe(true);
      expect(a.rubricCriteria.reduce((n:number,r:{maxPoints:number})=>n+r.maxPoints,0)).toBe(a.pointsPossible);
      expect(a.rubricCriteria.every((r:{description:string})=>!r.description.includes("x=−8"))).toBe(true);
    }
  });
  it("keeps teacher keys out of the student-facing canonical content payload", () => {
    const source = readFileSync(script.pathname, "utf8");
    expect(source).toContain("version:1");
    expect(source).not.toContain("modules=[{id:week1.unitId,title:week1.title,lessons,teacherGuides");
    const license=JSON.parse(readFileSync(new URL("../../curriculum/can-high-school-core/algebra1/release-metadata.json",import.meta.url),"utf8"));
    expect(license.externalSources).toEqual([]);
    expect(license.releaseStatus).toBe("review_required");
  });
});
