import {describe,it,expect} from "vitest";
import {assertR2DemoEnabled,assertR2DocumentGrant,enrollmentDocumentStorageVerified} from "@/domain/r2-document-access";
const member=(role:string,organizationIds:string[]=[])=>({role,actorPersonId:"person",organizationIds});
describe("R2 fail-closed document access policy",()=>{
 it("accepts legacy fixture objects only in Valor, never from a metadata bit alone",()=>{
  const valor="f1000000-0000-4000-8000-000000000002";
  expect(enrollmentDocumentStorageVerified({synthetic:true},valor)).toBe(true);
  expect(enrollmentDocumentStorageVerified({synthetic:true},"ordinary-school")).toBe(false);
  expect(enrollmentDocumentStorageVerified({},valor)).toBe(false);
  expect(enrollmentDocumentStorageVerified({storageVerified:true},"ordinary-school")).toBe(true);
 });
 it.each([undefined,"","false","TRUE","1"])("denies R2 when flag is %s",flag=>{
  expect(()=>assertR2DemoEnabled(flag)).toThrow("disabled");
 });
 it("requires explicit true",()=>expect(()=>assertR2DemoEnabled("true")).not.toThrow());
 it("grants registrar only within their organization",()=>{
  expect(()=>assertR2DocumentGrant(member("registrar",["school-a"]),{organizationId:"school-a",guardianCanManage:false})).not.toThrow();
  expect(()=>assertR2DocumentGrant(member("registrar",["school-a"]),{organizationId:"school-b",guardianCanManage:false})).toThrow();
 });
 it("grants guardians only on managing relationships",()=>{
  expect(()=>assertR2DocumentGrant(member("guardian"),{organizationId:"school-a",guardianCanManage:true})).not.toThrow();
  expect(()=>assertR2DocumentGrant(member("guardian"),{organizationId:"school-a",guardianCanManage:false})).toThrow();
 });
 it.each(["student","teacher","specialist","anonymous"])("denies %s even when related",role=>{
  expect(()=>assertR2DocumentGrant(member(role,["school-a"]),{organizationId:"school-a",guardianCanManage:true})).toThrow();
 });
 it("rejects missing authenticated person for either role",()=>{
  expect(()=>assertR2DocumentGrant({role:"registrar",actorPersonId:null,organizationIds:["school-a"]},{organizationId:"school-a",guardianCanManage:true})).toThrow();
  expect(()=>assertR2DocumentGrant({role:"guardian",actorPersonId:null},{organizationId:"school-a",guardianCanManage:true})).toThrow();
 });
});
