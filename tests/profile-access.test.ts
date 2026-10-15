import {describe,expect,it} from "vitest";
import {assertCredentialVerification,assertProfileRead} from "../src/domain/profile-access";
const ctx=(person:string|null,caps:string[])=>({actorPersonId:person,capabilities:new Set(caps),scope:{}});
describe("profile resource permissions",()=>{
 it("allows own education and denies self verification",()=>{
  expect(()=>assertProfileRead(ctx("a",[]),"a","education")).not.toThrow();
  expect(()=>assertProfileRead(ctx("a",[]),"a","evidence")).toThrow();
  expect(()=>assertCredentialVerification(ctx("a",["profiles.credentials.verify"]),"a",true)).toThrow();
 });
 it("does not mistake a capability for authorization to a specific person",()=>{
  expect(()=>assertProfileRead(ctx("a",["profiles.read"]),"b","credential")).toThrow();
  expect(()=>assertProfileRead(ctx("a",["profiles.read"]),"b","credential",{targetPersonId:"c",authorizedRelationship:true,permittedFields:new Set(["credential"])})).toThrow();
  expect(()=>assertProfileRead(ctx("a",["profiles.read"]),"b","credential",{targetPersonId:"b",authorizedRelationship:true,permittedFields:new Set(["credential"])})).not.toThrow();
 });
 it("denies unscoped and self credential review",()=>{
  expect(()=>assertCredentialVerification(ctx("reviewer",["profiles.credentials.verify"]),"b")).toThrow();
  expect(()=>assertCredentialVerification(ctx("reviewer",["profiles.credentials.verify"]),"b",true)).not.toThrow();
 });
});
