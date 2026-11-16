import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Noncredit cohort RPC import protection and authorization",()=>{
  const facade=read("src/modules/enrollment/noncredit-cohort-operations.functions.ts");
  const server=read("src/modules/enrollment/noncredit-cohort-operations.server.ts");
  it("exposes only createServerFn RPCs and no static client imports of protected modules",()=>{
    expect(facade).not.toMatch(/^import .*\\.server["'];?$/gm);
    expect(facade).not.toContain("async function scopedRelease");
    expect(facade).not.toContain("async function assignCohortPlan");
    expect(facade).toContain('await import("./noncredit-cohort-operations.server")');
    expect(facade).toContain('await import("./noncredit-self-enrollment-catalog.server")');
    expect((facade.match(/export const \\w+=createServerFn/g)||[]).length).toBe(5);
  });
  it("preserves current canonical staff verification and exact release/Site ownership",()=>{
    expect(server).toContain("requireCanonicalLabProvider()");
    expect(server).toContain("if(lock)await assertCurrentCanonicalStaffForMutation(tx,getRequest(),provider.actor)");
    expect(server).toContain("release.siteId && !provider.siteIds.includes(release.siteId)");
    expect(server).toContain("eq(noncreditSelfEnrollmentReleases.registeringOrganizationId,provider.organizationId)");
    expect(server).toContain("plan.enrollmentReleaseId!==null");
    expect(server).toContain("plan.hostOrganizationId!==provider.organizationId");
    expect(server).toContain("for(\"update\",{of:facilitatedClassroomPlans})");
  });
});
