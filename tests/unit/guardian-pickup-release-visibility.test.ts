import { describe, expect, it } from "vitest";
import { projectGuardianPickupReleaseEvents } from "@/domain/guardian-pickup-release-visibility";
const common = {
  studentProfileId:"child", householdId:"house", programId:"program",
  occurredAt:new Date("2026-11-01T22:00:00Z"),
};
describe("least-privilege family pickup history",()=>{
  it("retains a verified release name and timestamp but not staff's raw observations",()=>{
    const [result]=projectGuardianPickupReleaseEvents([{
      ...common,id:"released",status:"released",presentedName:"Verified grandparent",
      denialReason:null,handoffEvidence:"Private staff witness evidence and review notes",
    }]);
    expect(result).toMatchObject({
      status:"released",presentedName:"Verified grandparent",
      occurredAt:"2026-11-01T22:00:00.000Z",handoffEvidence:null,
    });
    expect(JSON.stringify(result)).not.toContain("Private staff witness evidence");
  });
  it("does not reveal a denied adult's identity or underlying custody allegation",()=>{
    const [result]=projectGuardianPickupReleaseEvents([{
      ...common,id:"denial",status:"denied",presentedName:"Restricted person's private legal name",
      denialReason:"custody_dispute",handoffEvidence:"Sensitive onsite response",
    }]);
    expect(result).toMatchObject({
      id:"denial",status:"denied",presentedName:"Pickup not released",
      denialReason:null,handoffEvidence:null,
    });
    const visible=JSON.stringify(result);
    for(const privateValue of ["Restricted person's private legal name","custody_dispute","Sensitive onsite response"])
      expect(visible).not.toContain(privateValue);
  });
});
