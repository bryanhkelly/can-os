import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("first-class My Activity resilience and source-scoped enrollment",()=>{
  it("renders training management independently of the combined activity read model",()=>{
    const activity=read("src/routes/learn.my-activity.tsx");
    const endOfProjection=activity.indexOf("    </>}");
    const management=activity.lastIndexOf('id="noncredit-management"');
    expect(endOfProjection).toBeGreaterThan(0);
    expect(management).toBeGreaterThan(endOfProjection);
    expect(activity).toContain("showAllTraining&&<NoncreditEnrollmentManagement/>");
    expect(activity).toContain("activity.isError");
    expect(activity).toContain('href="#noncredit-management"');
    expect(activity).toContain("Your registrations remain source-authoritative.");
  });

  it("queries only the owning CAN Person's exact registration at the database",()=>{
    const source=read("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
    expect(source).toContain("getMyNoncreditRegistrationById");
    expect(source).toContain("registrationId?eq(noncreditRegistrations.id,registrationId):undefined");
    expect(source).toContain("eq(noncreditSelfEnrollmentClaims.canonicalAccountId,link.canonicalAccountId)");
    expect(source).toContain("eq(noncreditRegistrations.participantPersonId,link.canonicalPersonId)");
    expect(source).toContain('z.object({registrationId:z.string().uuid()}).strict()');
  });

  it("queries an exact waiting-list release with signed-in account and Person ownership",()=>{
    const source=read("src/modules/enrollment/noncredit-waitlist.server.ts");
    expect(read("src/modules/enrollment/noncredit-waitlist.functions.ts")).toContain("getMyNoncreditWaitlistByRelease");
    expect(source).toContain("releaseId?eq(noncreditEnrollmentWaitlist.releaseId,releaseId):undefined");
    expect(source).toContain("eq(noncreditEnrollmentWaitlist.accessAccountId,owner.accountId)");
    expect(source).toContain("eq(noncreditEnrollmentWaitlist.accessPersonId,owner.personId)");
    expect(source).toContain('z.object({releaseId:z.string().uuid()}).strict()');
  });

  it("keeps registration and waitlist query caches separate by selected ID and verified grant",()=>{
    const source=read("src/components/learning/NoncreditEnrollmentManagement.tsx");
    expect(source).toContain('["my-noncredit-self-enrollments",scopeKey,registrationId??"all"]');
    expect(source).toContain("noncreditWaitlistQueryKeys.pages(scopeKey,releaseId)");
    expect(source).toContain("getMyNoncreditRegistrationById({data:{registrationId}})");
    expect(source).toContain("getMyNoncreditWaitlistByRelease({data:{releaseId}})");
    expect(source).toContain('enabled:authorized&&!releaseId');
    expect(source).toContain('enabled:authorized&&!registrationId');
  });
});

describe("shared Site and network workspace composition",()=>{
  it("uses common workspace elements but only authorized source records",()=>{
    const site=read("src/routes/sites.index.tsx");
    const network=read("src/components/home/NetworkHome.tsx");
    const shared=read("src/components/workspace/ScopedWorkspaceSection.tsx");
    expect(site).toContain("<ScopedWorkspaceSection");
    expect(network).toContain("<ScopedWorkspaceSection");
    expect(site).toContain("listMySites()");
    expect(network).toContain("getNetworkSites()");
    expect(site).toContain("profileLinks");
    expect(network).not.toContain("profileLinks");
    expect(shared).not.toContain("getNetworkSites");
    expect(shared).not.toContain("listMySites");
  });
});
