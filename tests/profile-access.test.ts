import {describe,expect,it} from "vitest";
import {assertCredentialVerification,assertProfileRead,profileModules} from "../src/domain/profile-access";
import {roleCapabilities} from "../src/domain/access-context";
const ctx=(person:string|null,caps:string[])=>({actorPersonId:person,capabilities:new Set(caps),scope:{}});
describe("profile resource permissions",()=>{
 it.each(Object.keys(roleCapabilities))("allows %s to manage only its own photo and granted modules",role=>{
  const context={...ctx("self",[...roleCapabilities[role]!]),role};
  expect(profileModules(context,"self").photo).toBe(true);
  expect(profileModules(context,"other")).toEqual({photo:false,personal:false,professional:false,qualifications:false});
 });
 it("does not infer editing authority from a role without its capability",()=>{
  expect(profileModules({...ctx("self",[]),role:"teacher"},"self").professional).toBe(false);
  expect(profileModules({...ctx("self",[]),role:"student"},"self").personal).toBe(false);
 });
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
