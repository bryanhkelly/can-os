import { describe, expect, it } from "vitest";
import {
  assessLocalRollout, parsePortableRollout, publishedOfferingKind,
  serializeProgramRollout, type ProgramRolloutRecipe,
} from "@/domain/network-program-rollout";

const offering = "00000000-0000-4000-8000-000000000010";
const first = "00000000-0000-4000-8000-000000000001";
const second = "00000000-0000-4000-8000-000000000002";
const north = "00000000-0000-4000-8000-000000000003";
const south = "00000000-0000-4000-8000-000000000004";
const plan: ProgramRolloutRecipe = {
  version: 2, revision: 1, offeringVersionId: offering,
  offeringTitle: "Four-session Digital Skills", offeringKind: "program",
  courses: [
    {courseVersionId:first,courseTitle:"AI foundations",isRequired:true,sequenceNo:1,
      suggestedClassTitle:"AI foundations · Local",deliveryMode:"facilitated",capacity:25,recommendedSessionMinutes:60},
    {courseVersionId:second,courseTitle:"Digital practice",isRequired:true,sequenceNo:2,
      suggestedClassTitle:"Digital practice · Local",deliveryMode:"facilitated",capacity:25,recommendedSessionMinutes:60},
  ],
};
describe("WS5 governed publisher rollout", () => {
  it("round-trips a versioned multi-Course Program without delegated publishing authority", () => {
    const json = serializeProgramRollout(plan);
    expect(parsePortableRollout(json)).toEqual(plan);
    for (const secret of ["siteId","operatingOrganizationId","adoptionId","learnerPersonId","assessmentAnswers"]) {
      expect(json).not.toContain(secret);
      expect(() => parsePortableRollout(JSON.stringify({...plan,[secret]:first}))).toThrow();
    }
  });
  it("accepts legacy single-Class launch recipes unchanged", () => {
    const legacy = {version:1 as const,courseVersionId:first,courseTitle:"AI foundations",
      suggestedClassTitle:"AI foundations · Local",deliveryMode:"facilitated" as const,
      capacity:25,recommendedSessionMinutes:60};
    expect(parsePortableRollout(JSON.stringify(legacy))).toEqual(legacy);
  });
  it("allows standalone Course offerings with no invented parent Program or network", () => {
    const standalone={...plan,offeringKind:"course" as const,courses:[plan.courses[0]!]};
    expect(parsePortableRollout(serializeProgramRollout(standalone))).toEqual(standalone);
    expect(() => serializeProgramRollout({...plan,offeringKind:"course"})).toThrow();
  });
  it("never infers publisher kind from Course count", () => {
    expect(publishedOfferingKind({kind:"program"})).toBe("program");
    expect(publishedOfferingKind({kind:"course"})).toBe("course");
    expect(publishedOfferingKind({courses:[first,second]})).toBe("other");
    expect(publishedOfferingKind({kind:"unknown"})).toBe("other");
  });
  it("requires exact adopted Offering version and current Site entitlement at both Sites", () => {
    const options = [
      {offeringVersionId:offering,courseVersionId:first,siteOptions:[{id:north},{id:south}]},
      {offeringVersionId:offering,courseVersionId:second,siteOptions:[{id:north}]},
    ];
    expect(assessLocalRollout(plan,options,north).map(x=>x.status)).toEqual(["ready","ready"]);
    expect(assessLocalRollout(plan,options,south).map(x=>x.status))
      .toEqual(["ready","site_authorization_required"]);
    expect(assessLocalRollout(plan,options,null).map(x=>x.status)).toEqual(["ready","ready"]);
    expect(assessLocalRollout(plan,options.map(x=>({...x,offeringVersionId:second})),north)
      .map(x=>x.status)).toEqual(["adoption_required","adoption_required"]);
  });
  it("rejects Course duplicates, unapproved mutation fields and absurd plans", () => {
    expect(() => serializeProgramRollout({...plan,courses:[plan.courses[0]!,plan.courses[0]!]})).toThrow();
    expect(() => parsePortableRollout(JSON.stringify({...plan,courses:[{
      ...plan.courses[0],publisherAssessmentOverride:true,
    }]}))).toThrow();
    expect(() => parsePortableRollout("x".repeat(24001))).toThrow();
    expect(() => parsePortableRollout("{")).toThrow();
  });
});
