import {describe,it,expect} from "vitest";
import {canIssueAnotherOffer,selectActionableOffer} from "@/domain/admissions-offer-selection";
const year="2027";
const stale={id:"old",status:"declined",expiresAt:null,schoolYearId:year};
describe("admission offer selection",()=>{
 it("allows a replacement after guardian decline",()=>{
  expect(selectActionableOffer([stale])).toBeUndefined();
  expect(canIssueAnotherOffer("application",0,[stale],year)).toBe(true);
 });
 it("allows reoffer when issued offer expired",()=>{
  const expired={id:"expired",status:"issued",expiresAt:"2020-01-01T00:00:00Z",schoolYearId:year};
  expect(selectActionableOffer([expired])).toBeUndefined();
  expect(canIssueAnotherOffer("application",0,[expired],year)).toBe(true);
 });
 it("prevents duplicates within the same year but allows another year",()=>{
  const live={id:"current",status:"issued",expiresAt:"2099-01-01T00:00:00Z",schoolYearId:year};
  expect(selectActionableOffer([stale,live])?.id).toBe("current");
  expect(canIssueAnotherOffer("application",0,[live],year)).toBe(false);
  expect(canIssueAnotherOffer("application",0,[live],"2028")).toBe(true);
 });
 it("requires readiness and eligible application stage",()=>{
  expect(canIssueAnotherOffer("application",1,[],year)).toBe(false);
  expect(canIssueAnotherOffer("accepted",0,[],year)).toBe(false);
 });
 it("requires explicit waitlist restoration even with completed readiness",()=>{
  expect(canIssueAnotherOffer("eligibility",0,[],year,new Date(),"waitlisted")).toBe(false);
  expect(canIssueAnotherOffer("eligibility",0,[],year,new Date(),null)).toBe(true);
 });
});