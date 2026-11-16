import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classDefinitionSchema, classEnrollmentRequestSchema,
  enrollmentNeedsOffering } from "@/domain/unified-class";

const id="5d9bd7cb-b6b8-443b-8732-087e7ea6a236";
const read=(path:string)=>readFileSync(path,"utf8");
describe("Class identity and optional enrollment publication",()=>{
  it("supports a Class without a Class Offering and with its own capacity",()=>{
    const cls=classDefinitionSchema.parse({
      deploymentId:id,adoptionId:id,offeringVersionId:id,courseVersionId:id,
      operatingOrganizationId:id,siteId:null,title:"Four-week AI Skills",
      deliveryMode:"self_paced",capacity:24,
    });
    expect(cls.capacity).toBe(24);
    const assigned=classEnrollmentRequestSchema.parse({
      classId:id,classOfferingVersionId:null,learnerPersonId:id,
      enrollmentMethod:"assignment",creditMode:"audit",
    });
    expect(assigned.classOfferingVersionId).toBeNull();
    expect(enrollmentNeedsOffering(assigned.enrollmentMethod)).toBe(false);
    expect(enrollmentNeedsOffering("self")).toBe(true);
    expect(enrollmentNeedsOffering("invitation")).toBe(false);
    expect(enrollmentNeedsOffering("approval")).toBe(false);
  });
  it("creates Class first; Class Offering is optional and can be added afterward",()=>{
    const server=read("src/modules/classes/unified-class.functions.ts");
    expect(server).toContain("terms:terms==null?null:classOfferingTermsSchema.parse(terms)");
    expect(server).toContain("if(data.terms){");
    expect(server).toContain("export const activateUnifiedClass");
    expect(server).toContain("existingOffering??(await tx.insert(canonicalClassOfferings)");
    expect(server).toContain(".leftJoin(canonicalClassOfferings");
  });
  it("direct assignment must verify an adult, an active learner grant, and lock Class capacity",()=>{
    const src=read("src/modules/classes/native-class-assignment.functions.ts");
    for(const rule of [
      "for(\"update\")","verifiedAdultOn","canonicalAccountGrants",
      "eq(canonicalAccountGrants.roleCode,\"learner\")",
      "eq(canonicalAccountGrants.organizationId,cls.operatingOrganizationId)",
      "if(cls.capacity!==null","classOfferingVersionId:null",
    ])expect(src).toContain(rule);
    expect(src).not.toContain("enrollmentMethod:\"self\"");
    expect(src).not.toContain("creditMode:z.enum([\"for_credit\"");
  });
  it("schema protects self-registration while permitting direct assignment",()=>{
    const sql=read("database/canonical/v3.0.1/patch-unified-class-offerings.sql");
    expect(sql).toContain("class_offering_version_id uuid,");
    expect(sql).toContain("enrollment_method<>'self' OR class_offering_version_id IS NOT NULL");
    expect(sql).toContain("capacity integer CHECK(capacity IS NULL OR capacity>0)");
    expect(sql).not.toMatch(/RETURNS trigger LANGUAGE plpgsql[^\n]* AS \$\n/);
    expect(sql).not.toMatch(/END \$;\n/);
  });
});
