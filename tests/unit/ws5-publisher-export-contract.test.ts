import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePortableRollout } from "@/domain/network-program-rollout";

const read=(path:string)=>readFileSync(path,"utf8");
describe("WS5 publisher composition export and Site launch boundaries",()=>{
  it("exports a complete canonical Offering composition rather than a truncated picker page",()=>{
    const fn=read("src/modules/programs/publisher-rollout.functions.ts");
    const page=read("src/components/learning/NativeClassManager.tsx");
    expect(fn).toContain("getPublisherRolloutTemplate");
    expect(fn).toContain("canonicalOfferingCourses");
    expect(fn).toContain(".orderBy(asc(canonicalOfferingCourses.sequenceNo)");
    expect(fn).toContain(".limit(51)");
    expect(fn).toContain("assertCompletePortableCourseComposition(approved.productDefinition,rows)");
    expect(page).toContain("await getPublisherRolloutTemplate({data:{");
    expect(page).not.toContain("const rows=(options.data??[])");
  });
  it("never exports a publisher version without a live approved operator and adoption",()=>{
    const fn=read("src/modules/programs/publisher-rollout.functions.ts");
    for(const check of [
      'assertCapability(actor,"class.manage")',
      'eq(educationOperationOrganizationRoles.organizationId,organizationId)',
      'eq(educationOperationOrganizationRoles.roleCode,"operator")',
      'eq(educationOperationOrganizationRoles.status,"approved")',
      'eq(deploymentOfferingAdoptions.approvalStatus,"approved")',
      'eq(offeringVersions.id,data.offeringVersionId)',
      'eq(offerings.status,"active")',
      'lifecycle:courseVersions.lifecycle',
      'publishedAt:courseVersions.publishedAt',
    ])expect(fn).toContain(check);
    expect(fn).not.toContain("networkMembership");
    expect(fn).not.toContain("insert(");
    expect(fn).not.toContain("update(");
  });
  it("keeps local Site modes and activation independent from portable instructions",()=>{
    const fn=read("src/modules/classes/unified-class.functions.ts");
    const page=read("src/components/learning/NativeClassManager.tsx");
    expect(fn).toContain('siteByOperation=new Map');
    expect(fn).toContain('placementKeys.has(row.deploymentId+":"+id)');
    expect(page).toContain('site.allowedDeliveryModes.includes(deliveryMode)');
    expect(page).toContain('value={siteId} required');
    expect(page).toContain('disabled={busy||!item.siteId}');
    expect(page).toContain('to="/class/$classId"');
    expect(page).toContain('tab:"sessions"');
  });
  it("rejects cross-tenant authority claims in a recipe and incomplete Course components",()=>{
    const id="00000000-0000-4000-8000-000000000001";
    const good={
      version:2 as const,revision:1,offeringVersionId:id,
      offeringTitle:"Standalone AI Course",offeringKind:"course" as const,
      courses:[{
        courseVersionId:id,courseTitle:"AI essentials",
        isRequired:true,sequenceNo:1,suggestedClassTitle:"AI Essentials Local",
        deliveryMode:"self_paced" as const,capacity:null,recommendedSessionMinutes:60,
      }],
    };
    expect(parsePortableRollout(JSON.stringify(good))).toEqual(good);
    for(const attemptedGrant of [
      {networkMembershipId:id},{organizationId:id},{siteId:id},
      {adoptionId:id},{publisherAssessmentOverrides:[]},
    ])expect(()=>parsePortableRollout(JSON.stringify({...good,...attemptedGrant}))).toThrow();
    expect(()=>parsePortableRollout(JSON.stringify({...good,courses:[]}))).toThrow();
  });
});
