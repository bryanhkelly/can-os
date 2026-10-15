import { describe, expect, it } from "vitest";
import { assertCredentialVerification, assertProfileRead } from "../src/domain/profile-access";
const ctx = (person: string | null, caps: string[], orgs: string[] = []) => ({actorPersonId:person,capabilities:new Set(caps),scope:{organizationIds:orgs}});
describe("profile access security gates",()=>{
 it("allows self to read own education but not private evidence",()=>{
  expect(()=>assertProfileRead(ctx("alice",[]),"alice","education")).not.toThrow();
  expect(()=>assertProfileRead(ctx("alice",[]),"alice","evidence")).toThrow();
 });
 it("denies unauthenticated, cross-person, and unscoped reads",()=>{
  expect(()=>assertProfileRead(ctx(null,["profiles.read"],["org"]),"bob","education")).toThrow();
  expect(()=>assertProfileRead(ctx("alice",[]),"bob","credential")).toThrow();
  expect(()=>assertProfileRead(ctx("alice",["profiles.read"]),"bob","credential")).toThrow();
 });
 it("requires independent verifier with capability and scope",()=>{
  expect(()=>assertCredentialVerification(ctx("alice",["profiles.credentials.verify"],["org"]),"alice")).toThrow();
  expect(()=>assertCredentialVerification(ctx("reviewer",["profiles.credentials.verify"]),"alice")).toThrow();
  expect(()=>assertCredentialVerification(ctx("reviewer",["profiles.credentials.verify"],["org"]),"alice")).not.toThrow();
 });
});
