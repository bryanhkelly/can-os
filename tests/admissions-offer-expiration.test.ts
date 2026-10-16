import {describe,expect,it} from "vitest";
import {offerHoldsSeat,transitionAdmissionsOffer,type OfferRecord} from "../src/domain/admissions-offer-lifecycle";
const now=new Date("2026-10-16T12:00:00Z");
const offer:OfferRecord={applicationId:"test-application",schoolYearId:"2027-2028",status:"issued",expiresAt:"2026-10-15T12:00:00Z"};
describe("expired admissions offers",()=>{
 it("stops holding a seat once expiry passes",()=>{
  expect(offerHoldsSeat(offer,now)).toBe(false);
 });
 it("can transition only a passed-deadline issued offer to expired",()=>{
  const expired=transitionAdmissionsOffer(offer,"expire",now);
  expect(expired.status).toBe("expired");
  expect(offerHoldsSeat(expired,now)).toBe(false);
 });
 it("cannot expire an unexpired offer",()=>{
  expect(()=>transitionAdmissionsOffer({...offer,expiresAt:"2026-10-18T12:00:00Z"},"expire",now)).toThrow();
 });
 it("accepted offers still reserve their place after offer expiry",()=>{
  expect(offerHoldsSeat({...offer,status:"accepted"},now)).toBe(true);
 });
});
