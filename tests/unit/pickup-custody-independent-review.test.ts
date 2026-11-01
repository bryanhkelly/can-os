import {describe,expect,it} from "vitest";
import {mayIndependentlyResolveCustodyHold} from "@/domain/pickup-custody-review-policy";
const base={
  kind:"disputed_custody",proposerPersonId:"facilitator-1",
  requesterPersonId:"facilitator-1",reviewerPersonId:"site-director-2",
  resolutionNote:"Documented court order verified through school case record.",
  submittedNote:"Documented court order verified through school case record.",
  evidenceReference:"School custody case 101, order 2026-11-01",
  authorityBasis:"verified_court_order",
};
describe("independently reviewed custody hold release",()=>{
  it("needs a different current reviewer and matching original proposal",()=>{
    expect(mayIndependentlyResolveCustodyHold(base)).toBe(true);
    expect(mayIndependentlyResolveCustodyHold({...base,reviewerPersonId:"facilitator-1"})).toBe(false);
    expect(mayIndependentlyResolveCustodyHold({...base,requesterPersonId:"unrelated-person"})).toBe(false);
    expect(mayIndependentlyResolveCustodyHold({...base,submittedNote:"Changed without a new proposal"})).toBe(false);
  });
  it("cannot clear a disputed custody restriction with a generic emergency note",()=>{
    expect(mayIndependentlyResolveCustodyHold({...base,authorityBasis:"documented_emergency_cleared"})).toBe(false);
    expect(mayIndependentlyResolveCustodyHold({...base,evidenceReference:""})).toBe(false);
    expect(mayIndependentlyResolveCustodyHold({...base,authorityBasis:"unknown"})).toBe(false);
  });
  it("requires a dedicated emergency clearance basis for emergency holds",()=>{
    expect(mayIndependentlyResolveCustodyHold({...base,kind:"emergency",
      authorityBasis:"documented_emergency_cleared"})).toBe(true);
    expect(mayIndependentlyResolveCustodyHold({...base,kind:"emergency"})).toBe(false);
  });
});