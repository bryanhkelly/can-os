import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { projectClassLaunchReadiness, type ClassLaunchReadState } from
  "@/domain/native-class-launch-readiness";

const baseline:ClassLaunchReadState={
  operatorSites:"success",authorizedSiteCount:0,
  adoptedCourses:"success",visibleAdoptedCourseCount:0,
  visibleDraftClasses:"success",visibleDraftClassCount:0,
  filtered:false,
};

describe("native Class launch readiness is a source-backed presentation",()=>{
  it("never treats a failed read as an empty authorized catalog",()=>{
    const rows=projectClassLaunchReadiness({
      ...baseline,operatorSites:"error",adoptedCourses:"error",
      visibleDraftClasses:"error",
    });
    expect(rows).toHaveLength(3);
    expect(rows.every(row=>row.status==="unavailable")).toBe(true);
    expect(rows.every(row=>row.detail.includes("No readiness is assumed"))).toBe(true);
  });

  it("keeps missing prerequisites actionable without inventing a Class",()=>{
    const rows=projectClassLaunchReadiness(baseline);
    expect(rows.map(row=>row.status)).toEqual([
      "action_required","action_required","action_required"
    ]);
    expect(rows[1]?.detail).toContain("Publication and local adoption");
    expect(rows[2]?.detail).toContain("do not seed Class rows directly");
  });

  it("does not interpret filtered result emptiness as global absence",()=>{
    const rows=projectClassLaunchReadiness({...baseline,filtered:true});
    expect(rows[1]?.detail).toContain("current filter");
    expect(rows[1]?.detail).toContain("Clear the filter");
  });

  it("reports only visible evidence, not operating approval",()=>{
    const rows=projectClassLaunchReadiness({
      ...baseline,authorizedSiteCount:1,
      visibleAdoptedCourseCount:3,visibleDraftClassCount:2,
    });
    expect(rows.every(row=>row.status==="visible")).toBe(true);
    expect(rows[0]?.detail).toContain("verified when creating a Class");
    expect(rows[1]?.detail).toContain("current authorization");
    expect(rows[2]?.detail).toContain("separate checks");
  });

  it("preserves checking status rather than showing an unverified block",()=>{
    const rows=projectClassLaunchReadiness({
      ...baseline,operatorSites:"pending",adoptedCourses:"pending",
      visibleDraftClasses:"pending",
    });
    expect(rows.map(row=>row.status)).toEqual(["checking","checking","checking"]);
  });

  it("renders the same readiness inside the production /class manager",()=>{
    const manager=readFileSync("src/components/learning/NativeClassManager.tsx","utf8");
    const component=readFileSync("src/components/learning/NativeClassLaunchReadiness.tsx","utf8");
    expect(manager).toContain("<NativeClassLaunchReadiness");
    expect(manager).toContain("operatorSites:operatorSites.status");
    expect(manager).toContain("adoptedCourses:options.status");
    expect(manager).toContain("visibleDraftClasses:classes.status");
    expect(component).toContain("projectClassLaunchReadiness(state)");
    expect(component).toContain("Deployment and adoption inspection (staging)");
    expect(component).not.toContain("createUnifiedClassDraft");
  });
  it("guards the mutating QA browser journey with isolated-branch checks",()=>{
    const config=readFileSync("playwright.native-class-operator.config.ts","utf8");
    const preflight=readFileSync("scripts/acceptance/check-native-class-operator-qa.mjs","utf8");
    const spec=readFileSync("tests/e2e/qa/native-class-operator.spec.ts","utf8");
    expect(config).toContain('CAN_TEST_DB_WRITES_ENABLED!=="true"');
    expect(config).toContain("CAN_APPLICATION_DB_HOST");
    expect(config).toContain('url.protocol!=="http:"');
    expect(preflight).toContain("verifyAdmissionsNeonBranch");
    expect(preflight).toContain('CAN_E2E_TEST_BRANCH_ID');
    expect(preflight).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i);
    expect(spec).toContain("withAuthenticatedPage");
    expect(spec).toContain("Create draft Class");
    expect(spec).toContain("await page.reload()");
    expect(spec).toContain("persistedTitle");
    expect(spec).not.toContain("sql.query");
  });

});
