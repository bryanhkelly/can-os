import {describe,it,expect} from "vitest";
import {reviewedMinorExpiry} from "@/domain/guardian-minor-review";
describe("independently reviewed minor eligibility",()=>{
 const now=new Date("2026-11-28T12:00:00Z");
 it("expires at adulthood without writing a Person date of birth",()=>{
  expect(reviewedMinorExpiry("2008-11-29",now)?.toISOString()).toBe("2026-11-29T00:00:00.000Z");
 });
 it.each(["2008-11-28","2007-12-01","2027-01-01","2024-02-30","invalid"])("denies adult, future or invalid birth date %s",dob=>{
  expect(reviewedMinorExpiry(dob,now)).toBeNull();
 });
 it("handles a leap-day birth without invalid dates",()=>{
  expect(reviewedMinorExpiry("2012-02-29",now)?.toISOString()).toBe("2030-03-01T00:00:00.000Z");
 });
});
