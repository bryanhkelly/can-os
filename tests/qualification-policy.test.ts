import { describe,expect,it } from "vitest";
import {evaluateQualificationPolicy,type PolicyExpression} from "../src/domain/qualification-policy";
const now=new Date("2026-10-15T12:00:00Z");
const cpr={type:"cpr",verified:true,expiresAt:new Date("2027-10-15")};
describe("configurable qualification rules",()=>{
 it("supports alternatives and conjunctions without hardcoded role branches",()=>{
  const rule:PolicyExpression={op:"all",rules:[{op:"any",rules:[{op:"credential",type:"cpr"},{op:"credential",type:"bls"}]},{op:"credential",type:"first_aid"}]};
  expect(evaluateQualificationPolicy(rule,[cpr],now).satisfied).toBe(false);
  expect(evaluateQualificationPolicy(rule,[cpr,{type:"first_aid",verified:true}],now).satisfied).toBe(true);
 });
 it("fails closed on empty and malformed compound rules",()=>{
  expect(evaluateQualificationPolicy({op:"all",rules:[]},[],now).satisfied).toBe(false);
  expect(evaluateQualificationPolicy({op:"atLeast",count:3,rules:[{op:"credential",type:"cpr"}]},[cpr],now).satisfied).toBe(false);
 });
 it("excludes expired, revoked, future, and unverified credentials",()=>{
  expect(evaluateQualificationPolicy({op:"credential",type:"cpr"},[{...cpr,revoked:true}],now).satisfied).toBe(false);
  expect(evaluateQualificationPolicy({op:"credential",type:"cpr"},[{...cpr,expiresAt:new Date("2025-01-01")}],now).satisfied).toBe(false);
  expect(evaluateQualificationPolicy({op:"credential",type:"cpr"},[{...cpr,validFrom:new Date("2027-01-01")}],now).satisfied).toBe(false);
  expect(evaluateQualificationPolicy({op:"credential",type:"cpr"},[{...cpr,verified:false}],now).satisfied).toBe(false);
 });
});
