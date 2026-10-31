import {describe,it,expect} from "vitest";
import {canDownloadAuthorizedCredential} from "@/domain/academic-credential-release";
const now=new Date("2026-10-31T12:00:00Z");
const valid={actorPersonId:"recipient-1",recipientPersonId:"recipient-1",recipientEmail:"person@example.org",accountEmail:"PERSON@example.org",recipientActive:true,expiresAt:new Date("2026-11-01T12:00:00Z"),revokedAt:null,now,demoFacilitator:false};
describe("official academic credential release gate",()=>{
 it("permits only exact authenticated recipient with active authorization",()=>{
  expect(canDownloadAuthorizedCredential(valid)).toBe(true);
 });
 it.each([
  {actorPersonId:null},{actorPersonId:"another-person"},
  {accountEmail:"another@example.org"},{accountEmail:null},
  {recipientActive:false},{demoFacilitator:true},
  {expiresAt:now},{expiresAt:new Date("2026-10-30T12:00:00Z")},
  {revokedAt:new Date("2026-10-31T11:00:00Z")},
 ])("rejects invalid identity or authorization: %j",override=>{
  expect(canDownloadAuthorizedCredential({...valid,...override})).toBe(false);
 });
});
