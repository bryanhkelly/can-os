import {describe,expect,it} from "vitest";
import {engagementActionAvailable} from "@/domain/engagement-action-policy";
const id="11111111-1111-4111-8111-111111111111";
describe("engagement interaction capability boundary",()=>{
  it("supports marketing, recruitment interest, and partner information without admission",()=>{
    expect(engagementActionAvailable("discover",{kind:"information",journeyId:"church-networks"})).toBe(true);
    expect(engagementActionAvailable("respond",{kind:"information",journeyId:"teach-with-can"})).toBe(true);
    expect(engagementActionAvailable("respond",{kind:"site-page",page:"contact"})).toBe(true);
    expect(engagementActionAvailable("respond",{kind:"site-page",page:"home"})).toBe(false);
  });
  it("allows registration through existing independently governed releases only",()=>{
    expect(engagementActionAvailable("register",{kind:"adult-training",releaseId:id})).toBe(true);
    expect(engagementActionAvailable("register",{kind:"enrichment",seasonId:id})).toBe(true);
    expect(engagementActionAvailable("register",{kind:"class",classId:id})).toBe(false);
    expect(engagementActionAvailable("register",{kind:"information",journeyId:"family-admissions"})).toBe(false);
  });
  it("never advertises unsupported application, payment, contract or resume transactions",()=>{
    const destination={kind:"information",journeyId:"teach-with-can"} as const;
    for(const interaction of ["apply","schedule","contribute","accept","continue"] as const)
      expect(engagementActionAvailable(interaction,destination)).toBe(false);
  });
});
