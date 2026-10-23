import { describe, expect, it } from "vitest";
import { requireSectionForChurchHostedActivation } from "@/domain/accepted-offer-placement";

describe("accepted offer to staffed church class",()=>{
  it("will not activate a church-hosted CAN school without a Section",()=>{
    expect(()=>requireSectionForChurchHostedActivation("approved-contract"))
      .toThrow("Choose a staffed class");
    expect(()=>requireSectionForChurchHostedActivation("approved-contract",""))
      .toThrow("Choose a staffed class");
  });
  it("permits an explicit Section whose staffing, capacity and year are checked transactionally",()=>{
    expect(()=>requireSectionForChurchHostedActivation("approved-contract","class-id"))
      .not.toThrow();
  });
  it("leaves non-church and same-institution legacy enrollment semantics unchanged",()=>{
    expect(()=>requireSectionForChurchHostedActivation(null)).not.toThrow();
  });
});
