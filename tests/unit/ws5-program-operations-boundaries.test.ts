import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classDefinitionSchema } from "@/domain/unified-class";
import { validateClassAuthority } from "@/modules/classes/unified-class-authority.server";

const organization = "00000000-0000-4000-8000-000000000001";
const otherOrg = "00000000-0000-4000-8000-000000000002";
const siteA = "00000000-0000-4000-8000-000000000003";
const siteB = "00000000-0000-4000-8000-000000000004";
const template = classDefinitionSchema.parse({
  deploymentId:organization, adoptionId:organization,
  offeringVersionId:organization, courseVersionId:organization,
  operatingOrganizationId:organization, siteId:siteA,
  title:"Local four-session skills", deliveryMode:"facilitated",
  capacity:25,
});
// All assertions here must deny BEFORE touching the DB; the SQL/RLS and
// cross-Site browser acceptance remain separate, required release gates.
const forbiddenDb = new Proxy({}, {get(){throw new Error("Unauthorized guard reached database");}})
  as Parameters<typeof validateClassAuthority>[0];
const operator={organizationId:organization,siteIds:[siteA],actor:{}}
  as unknown as Parameters<typeof validateClassAuthority>[1];

describe("WS5 authority and publisher/operator boundary",()=>{
  it("denies another Organization before looking up an adoption",async()=>{
    await expect(validateClassAuthority(forbiddenDb,operator,{
      ...template,operatingOrganizationId:otherOrg,
    })).rejects.toThrow("current operating Organization");
  });
  it("denies a sibling Site before a publisher or operation lookup",async()=>{
    await expect(validateClassAuthority(forbiddenDb,operator,{
      ...template,siteId:siteB,
    })).rejects.toThrow("current Site operator scope");
  });
  it("denies unsited scheduled delivery; independent self-paced remains allowable only after DB validation",async()=>{
    await expect(validateClassAuthority(forbiddenDb,operator,{
      ...template,siteId:null,deliveryMode:"scheduled",
    })).rejects.toThrow("require an authorized Site");
  });
  it("keeps approved adoption, effective grants and Site placement in server authority",()=>{
    const src=readFileSync("src/modules/classes/unified-class-authority.server.ts","utf8");
    const options=readFileSync("src/modules/classes/unified-class.functions.ts","utf8");
    for(const check of [
      'eq(educationOperationOrganizationRoles.organizationId,operator.organizationId)',
      'eq(educationOperationOrganizationRoles.status,"approved")',
      'eq(deploymentOfferingAdoptions.approvalStatus,"approved")',
      'eq(courseVersions.lifecycle,"published")',
      'eq(catalogSites.status,"active")',
      'eq(classroomDeploymentSites.siteId,input.siteId)',
    ])expect(src).toContain(check);
    expect(options).toContain('eq(educationOperationOrganizationRoles.roleCode,"operator")');
    expect(options).toContain('publishedOfferingKind(productDefinition)');
    expect(options).not.toContain('networkMembershipId');
    expect(options).toContain('await validateClassAuthority(tx,operator,instance)');
  });
});
