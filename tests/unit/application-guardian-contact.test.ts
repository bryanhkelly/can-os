import { describe, expect, it } from "vitest";
import { applicationGuardianContact } from "@/domain/application-guardian-contact";

describe("admissions application guardian resolution",()=>{
  it("uses the verified-account submitter for parent-submitted applications",()=>{
    expect(applicationGuardianContact({origin:"authenticated_guardian_application"},"parent-id")).toBe("parent-id");
  });
  it("never mistakes the registrar who entered an inquiry for its guardian",()=>{
    expect(applicationGuardianContact({origin:"registrar_intake",contactPersonId:"real-parent"},"staff-id")).toBe("real-parent");
    expect(applicationGuardianContact({origin:"registrar_intake"},"staff-id")).toBe("");
    expect(applicationGuardianContact({contactPersonId:123},"staff-id")).toBe("");
  });
});
