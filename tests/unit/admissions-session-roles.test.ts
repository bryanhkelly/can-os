import {describe,it,expect} from "vitest";
import {resolveAccessContext} from "@/domain/access-context";
import {assertCapability,assertProgramScope,AuthorizationError} from "@/domain/command-context";
const principal={accountId:"account",sessionId:"session",activeGrantId:"guardian-grant"};
const grants=[
 {id:"guardian-grant",accountId:"account",personId:"guardian",role:"guardian",organizationId:"org",siteId:null,active:true},
 {id:"registrar-grant",accountId:"account",personId:"registrar",role:"registrar",organizationId:"org",siteId:null,active:true},
] as const;
describe("cross-persona admissions authorization",()=>{
 it("allows an authenticated guardian to apply but never issue or activate",()=>{
  const guardian=resolveAccessContext(principal,grants);
  expect(guardian.actorPersonId).toBe("guardian");
  expect(()=>assertCapability(guardian,"enrollment.apply")).not.toThrow();
  expect(()=>assertCapability(guardian,"enrollment.decide")).toThrow(AuthorizationError);
  expect(()=>assertCapability(guardian,"enrollment.activate")).toThrow(AuthorizationError);
 });
 it("allows registrar issuance and activation but never a guardian decision",()=>{
  const registrar=resolveAccessContext({...principal,activeGrantId:"registrar-grant"},grants);
  expect(()=>assertCapability(registrar,"enrollment.decide")).not.toThrow();
  expect(()=>assertCapability(registrar,"enrollment.activate")).not.toThrow();
  expect(()=>assertCapability(registrar,"enrollment.apply")).toThrow(AuthorizationError);
 });
 it("denies inactive, foreign-account, and missing persona grants",()=>{
  expect(()=>resolveAccessContext({...principal,activeGrantId:"absent"},grants)).toThrow(AuthorizationError);
  expect(()=>resolveAccessContext({...principal,accountId:"another"},grants)).toThrow(AuthorizationError);
  expect(()=>resolveAccessContext(principal,grants.map(g=>({...g,active:false})))).toThrow(AuthorizationError);
 });
 it("enforces program scope once resolved from the verified organization grant",()=>{
  const guardian=resolveAccessContext(principal,grants);
  guardian.scope.programIds=["program-one"];
  expect(()=>assertProgramScope(guardian,"program-one")).not.toThrow();
  expect(()=>assertProgramScope(guardian,"other-program")).toThrow(AuthorizationError);
 });
});
