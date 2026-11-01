import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { mayShowPrivatePickupAction as allowed, privatePickupActionTypes } from "@/domain/private-pickup-action";

describe("Site Today private pickup case authorization",()=>{
 const caseAction={type:"onsite_pickup_custody_hold",ownerPersonId:"director",programId:"school"};
 const named={role:"site_leader",personId:"director",authorizedPrograms:new Set(["school"])};
 it.each(privatePickupActionTypes)("only permits a live, assigned local director for %s",(type)=>{
  expect(allowed({...caseAction,type},named)).toBe(true);
  expect(allowed({...caseAction,type},{...named,role:"registrar"})).toBe(false);
  expect(allowed({...caseAction,type},{...named,personId:"another"})).toBe(false);
  expect(allowed({...caseAction,type},{...named,authorizedPrograms:new Set<string>()})).toBe(false);
 });
 it("leaves general supervision interruptions visible",()=>{
  expect(allowed({...caseAction,type:"onsite_staff_coverage_interrupted"},{...named,role:"registrar"})).toBe(true);
 });
 it("limits capped action query and rechecks director appointment before sending details",()=>{
  const code=readFileSync("src/modules/operations/site-today.functions.ts","utf8");
  expect(code.indexOf("const caseQuery")).toBeLessThan(code.indexOf("const [actionRows"));
  expect(code).toContain("requireCurrentSiteLocalDelegate(db,actor,programId");
  expect(code).toContain("caseQuery,");
  expect(code).toContain("mayShowPrivatePickupAction(");
 });
});
