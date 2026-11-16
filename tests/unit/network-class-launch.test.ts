import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseNetworkClassLaunchRecipe, serializeNetworkClassLaunchRecipe,
} from "@/domain/network-class-launch";
const recipe={
  version:1 as const,
  courseVersionId:"00000000-0000-4000-8000-000000000001",
  courseTitle:"Reusable AI skills",
  suggestedClassTitle:"AI Digital Skills, Local Center",
  deliveryMode:"facilitated" as const,
  capacity:25,recommendedSessionMinutes:60,
};
describe("portable Course -> Site Class launch setup",()=>{
  it("roundtrips approved Course defaults without carrying Site/learner authority",()=>{
    const text=serializeNetworkClassLaunchRecipe(recipe);
    expect(parseNetworkClassLaunchRecipe(text)).toEqual(recipe);
    expect(text).not.toContain("organizationId");
    expect(text).not.toContain("siteId");
    expect(text).not.toContain("learnerPersonId");
    expect(text).not.toContain("consent");
  });
  it("rejects injected Site identity or enrollment fields rather than trusting template rights",()=>{
    expect(()=>parseNetworkClassLaunchRecipe(JSON.stringify({
      ...recipe,siteId:"00000000-0000-4000-8000-000000000002",
    }))).toThrow();
    expect(()=>parseNetworkClassLaunchRecipe(JSON.stringify({
      ...recipe,learnerPersonIds:[],
    }))).toThrow();
    expect(()=>parseNetworkClassLaunchRecipe("{not JSON")).toThrow();
    expect(()=>parseNetworkClassLaunchRecipe("x".repeat(4001))).toThrow();
  });
  it("routes every receiving Site through current adoption and authorization, not bulk enrollment",()=>{
    const page=readFileSync("src/routes/canonical.classes.tsx","utf8");
    expect(page).toContain("getUnifiedClassCourseOptions");
    expect(page).toContain("setRecipeCourseId");
    expect(page).toContain("createUnifiedClassDraft");
    expect(page).toContain("Select your organization's approved Course Offering");
    expect(page).not.toContain("bulkEnroll");
  });
  it("keeps Class discovery and manager roster paginated and independently authorized",()=>{
    const catalog=readFileSync("src/modules/classes/native-class-enrollment.functions.ts","utf8");
    const learner=readFileSync("src/routes/learn.classes.tsx","utf8");
    const manager=readFileSync("src/modules/classes/native-class-workspace.functions.ts","utf8");
    expect(catalog).toContain("getNativePublicClassCatalogPage");
    expect(catalog).toContain('eq(canonicalClassOfferingVersions.visibility,"public")');
    expect(catalog).toContain("currentClassAuthority(tx,row.classId,now)");
    expect(learner).toContain("useInfiniteQuery");
    expect(learner).toContain("Load more Classes");
    expect(manager).toContain("getNativeClassRosterPage");
    expect(manager).toContain("await validateClassAuthority(tx");
    expect(manager).toContain("nextOffset:rows.length>50?data.offset+50:null");
  });
});
