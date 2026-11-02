import {describe,expect,it} from "vitest";
import {uniqueAccountPersonId} from "@/domain/verified-family-person";
describe("public family identity reconciliation",()=>{
 it("creates a new prospective Person only when the account has no existing verified identity",()=>{
  expect(uniqueAccountPersonId([])).toBeUndefined();
 });
 it("reuses the same adult across multiple roles and school memberships",()=>{
  expect(uniqueAccountPersonId([{personId:"adult"},{personId:"adult"},{personId:"adult"}])).toBe("adult");
 });
 it("fails closed if several different people have been assigned to one account",()=>{
  expect(()=>uniqueAccountPersonId([{personId:"adult"},{personId:"other"}])).toThrow("ambiguous family identity");
 });
});
