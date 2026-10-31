import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { classContentSchema } from "../../src/domain/class-content";

const script = new URL("../../scripts/package-algebra1.mjs", import.meta.url);
const run = (...args: string[]) => execFileSync(process.execPath, [script.pathname, ...args], { encoding: "utf8" });
describe("CAN Algebra I packaging controls", () => {
  it("reports actual authored coverage and refuses to mark full-year ready", () => {
    const coverage = JSON.parse(run("--report"));
    expect(coverage).toMatchObject({
      targetWeeks: 36, authoredWeeks: 2, authoredLessons: 10,
      plannedLessons: 180, unwrittenLessons: 170,
      creditStatus: "not_credit_ready", publisherAdoption: "not_authorized",
    });
  });
  it("does not silently publish without an explicit command", () => {
    expect(() => run()).toThrow(/Use --report or --write/);
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
