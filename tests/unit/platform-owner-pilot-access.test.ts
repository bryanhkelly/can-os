import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {ownerGrantRequiresSite,ownerPilotRoles,ownerPilotGrantInput} from "@/domain/platform-owner-pilot-roles";

const source=(p:string)=>readFileSync(new URL("../../"+p,import.meta.url),"utf8");
const uuid=(x:string)=>x+"11111111-1111-4111-8111-111111111111".slice(x.length);

describe("Platform Owner pilot staffing controls",()=>{
  it("keeps the first-wave owner roles closed and explicitly scoped",()=>{
    expect(ownerPilotRoles).toEqual(["academic_content_creator","academic_content_reviewer",
      "registrar","site_admin","room_facilitator"]);
    expect(ownerGrantRequiresSite("registrar")).toBe(true);
    expect(ownerGrantRequiresSite("site_admin")).toBe(true);
    expect(ownerGrantRequiresSite("academic_content_creator")).toBe(false);
    expect(ownerGrantRequiresSite("academic_content_reviewer")).toBe(false);
    expect(ownerPilotGrantInput.safeParse({
      accountId:uuid("2"),organizationId:uuid("3"),siteId:null,
      role:"platform_owner",reason:"pilot setup authorized",
    }).success).toBe(false);
  });
  it("validates Person, exact Site ownership, and scope without issuing course authority",()=>{
    const server=source("src/modules/identity/platform-owner-pilot-access.server.ts");
    const ui=source("src/components/platform/PlatformOwnerPilotAccessPanel.tsx");
    expect(server).toContain("getVerifiedPlatformOwnerSession(request)");
    expect(server).toContain("target.accountId===owner.ownerAccountId");
    expect(server).toContain("isDemoAccountEmail(target.email)");
    expect(server).toContain('org.lifecycleStatus!=="active"');
    expect(server).toContain("eq(sites.organizationId,data.organizationId)");
    expect(server).toContain("ne(accountPersonGrants.personId,target.personId)");
    expect(server).toContain('action:"platform.owner.pilot_role.provisioned"');
    expect(server).toContain("independentCourseAppointmentCreated:false");
    expect(server).not.toContain("professional_role_assignments");
    expect(ui).toContain("grantPlatformOwnerPilotRole");
    expect(ui).not.toContain("platform-owner-pilot-access.server");
  });
  it("makes both COGIC draft Offerings visible before the first 25 generic Offerings",()=>{
    const query=source("src/modules/identity/platform-admin.functions.ts");
    const center=source("src/components/platform/PlatformReleaseCenter.tsx");
    expect(query).toContain("o.code AS \"offeringCode\"");
    expect(query).toContain("'CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01'");
    expect(query).toContain("LEFT JOIN public.noncredit_training_versions training");
    expect(query).toContain('assessment.lifecycle AS "noncreditAssessmentStatus"');
    expect(center).toContain("noncreditTrainingStatus");
    expect(center).toContain("pilotPlaceholderCount");
    expect(center).toContain("pilotContentReviewCount");
  });
});
