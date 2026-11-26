import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPrivateAccessCode, issueOpaqueSecret } from "@/domain/access-tokens";
import { rotatePrivateAccountAccessCode } from "@/modules/identity/platform-owner-delegation.server";

const state=vi.hoisted(()=>({
  ownerRows:[] as unknown[], rows:[] as unknown[][],
  updates:[] as unknown[], select:vi.fn(), transaction:vi.fn(),
  grants:vi.fn(), raw:vi.fn(), audit:vi.fn(),
}));
vi.mock("@/db/client",()=>({db:{select:state.select,transaction:state.transaction}}));
vi.mock("@/modules/identity/session-grants.server",()=>({readOwnerDelegationGrants:state.grants}));
vi.mock("@/modules/identity/unambiguous-adult-account.server",()=>({assertRawAccountPerson:state.raw}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.audit}));

const pepper="unit-test-private-account-recovery-pepper";
const grantId="11111111-1111-4111-8111-111111111111";
const accountId="22222222-2222-4222-8222-222222222222";
const personId="33333333-3333-4333-8333-333333333333";
const oldCode=issueOpaqueSecret();
const account={id:accountId,personId,email:"founder@school.demo",disabled:false,privateAccessCodeHash:hashPrivateAccessCode(oldCode,pepper)};
const grant={accountId,personId,role:"site_admin"};
const request=()=>new Request("https://example.org/platform",{method:"POST",headers:{origin:"https://example.org",cookie:"__Host-can_os_session="+"a".repeat(43)}});
const input={grantId,reason:"Approved founder access recovery",confirm:true};
function query(rows:unknown[]){
 const builder={from:()=>builder,innerJoin:()=>builder,where:()=>builder,for:()=>builder,limit:async()=>rows};
 return builder;
}

beforeEach(()=>{
 vi.clearAllMocks();vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER",pepper);
 state.updates=[];
 const now=new Date();
 state.ownerRows=[{sessionId:"owner-session",ownerAccountId:"owner-account",ownerPersonId:"owner-person",
   ownerEmail:"owner@institution.edu",grantId:"owner-grant",grantPersonId:"owner-person",accountVerifiedAt:now,
   accountDisabled:false,personActive:true,sessionSharedDevice:false,lastActivityAt:now,
   expiresAt:new Date(now.getTime()+600000),delegatedGrantId:null}];
 state.rows=[[grant],[account],[grant]];
 state.select.mockImplementation(()=>query(state.ownerRows));
 state.grants.mockResolvedValue([{id:grantId,...grant,active:true}]);
 state.transaction.mockImplementation(async run=>run({
   select:()=>query(state.rows.shift()??[]),
   update:()=>({set:(values:unknown)=>{state.updates.push(values);return {where:()=>({
     returning:async()=>[{id:"revoked-session"}],
   })};}}),
 }));
});
afterEach(()=>vi.unstubAllEnvs());

describe("private account credential recovery",()=>{
 it("replaces only the hash, revokes current sessions and records no credential in audit",async()=>{
   const result=await rotatePrivateAccountAccessCode(request(),input);
   expect(result.privateAccessCode).not.toBe(oldCode);
   expect(result.revokedCount).toBe(1);
   expect(state.updates[0]).toMatchObject({privateAccessCodeHash:hashPrivateAccessCode(result.privateAccessCode,pepper)});
   expect(state.updates[1]).toMatchObject({revokedAt:expect.any(Date)});
   expect(state.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({action:"identity.private_access_code.rotated",resourceId:accountId}));
   expect(JSON.stringify(state.updates)).not.toContain(result.privateAccessCode);
   expect(JSON.stringify(state.audit.mock.calls)).not.toContain(result.privateAccessCode);
 });
 it.each([{disabled:true},{privateAccessCodeHash:null},{email:"founder@example.org"},{personId:"different-person"}])("rejects ineligible accounts %j",async change=>{
   state.rows=[[grant],[{...account,...change}]];
   await expect(rotatePrivateAccountAccessCode(request(),input)).rejects.toThrow();
   expect(state.updates).toEqual([]);
 });
 it("enrolls a legacy operational Account only with an explicit enrollment action",async()=>{
   state.rows=[[grant],[{...account,privateAccessCodeHash:null}],[grant]];
   const result=await rotatePrivateAccountAccessCode(request(),{...input,operation:"enroll"});
   expect(state.updates[0]).toMatchObject({privateAccessCodeHash:hashPrivateAccessCode(result.privateAccessCode,pepper)});
   expect(state.audit).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({action:"identity.private_access_code.enrolled"}));
   expect(state.updates[1]).toMatchObject({revokedAt:expect.any(Date)});
 });
 it("cannot recover an account carrying an independent protected role",async()=>{
   state.rows=[[grant],[account],[grant,{...grant,role:"academic_content_reviewer"}]];
   await expect(rotatePrivateAccountAccessCode(request(),input)).rejects.toThrow();
   expect(state.updates).toEqual([]);
 });
 it("cannot rotate while delegated or from a foreign origin",async()=>{
   state.ownerRows=[{...(state.ownerRows[0] as object),delegatedGrantId:"other-grant"}];
   await expect(rotatePrivateAccountAccessCode(request(),input)).rejects.toThrow();
   await expect(rotatePrivateAccountAccessCode(new Request("https://example.org/platform",{method:"POST",headers:{origin:"https://other.example"}}),input)).rejects.toThrow();
   expect(state.transaction).not.toHaveBeenCalled();
 });
});
