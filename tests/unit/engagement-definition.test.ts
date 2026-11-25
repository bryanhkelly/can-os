import { describe, expect, it } from "vitest";
import {
  engagementDefinitionSchema, engagementOwnerSchema,
  engagementContextSummary,
} from "@/domain/engagement-definition";

const example = {
  domain:"partnerships",
  subject:{kind:"partnership",id:null,label:"University pre-college partnership"},
  audience:["partners","organizations"],
  interaction:"respond",
  expectedOutcome:"inquiry",
  presentation:{headline:"Partner with our community",summary:"Explore a pre-college experience for local students."},
  execution:{mode:"page",template:"invitation",action:{kind:"information",journeyId:"school-leader"},actionLabel:"Learn more"},
};

describe("universal engagement definition",()=>{
  it("supports non-enrollment engagement without Site coupling",()=>{
    const parsed=engagementDefinitionSchema.parse(example);
    expect(engagementContextSummary(parsed)).toEqual({
      domain:"partnerships",subjectKind:"partnership",interaction:"respond",
      audiences:["partners","organizations"],executionMode:"page",
    });
    expect(engagementOwnerSchema.parse({kind:"platform"})).toEqual({kind:"platform"});
    expect(engagementOwnerSchema.parse({kind:"organization",organizationId:"11111111-1111-4111-8111-111111111111"}).kind).toBe("organization");
  });
  it("rejects arbitrary external redirects and ungoverned forms",()=>{
    expect(engagementDefinitionSchema.safeParse({
      ...example,execution:{mode:"redirect",destination:{kind:"url",url:"https://evil.example"}},
    }).success).toBe(false);
    expect(engagementDefinitionSchema.safeParse({
      ...example,execution:{mode:"page",template:"custom-js",action:{kind:"class",classId:"11111111-1111-4111-8111-111111111111"},actionLabel:"Do it"},
    }).success).toBe(false);
  });
  it("keeps expected outcomes separate from actual events",()=>{
    expect(engagementDefinitionSchema.parse({...example,expectedOutcome:"agreement"}).expectedOutcome).toBe("agreement");
  });
});
