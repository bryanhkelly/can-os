import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {accessSessionCookie} from "@/domain/access-tokens";

const state=vi.hoisted(()=>({
 sessions:[] as Record<string,unknown>[],
 grants:[] as Record<string,unknown>[],
 selects:0,calls:0,
}));
vi.mock("@/db/client",()=>({
 db:{select:()=>{
  const call=state.calls++;
  const rows=call===0?state.sessions:call===1?state.grants:[];
  const query={
   from:()=>query,
   innerJoin:()=>query,
   where:()=>query,
   limit:async()=>{state.selects++;return rows;},
   then:(resolve:(value:unknown)=>unknown,reject:(error:unknown)=>unknown)=>{
    state.selects++;return Promise.resolve(rows).then(resolve,reject);
   },
  };
  return query;
 }}
}));
import {getCommandContext} from "@/modules/identity/command-context.server";

const account="11111111-1111-4111-8111-111111111111",person="22222222-2222-4222-8222-222222222222";
const session={id:"33333333-3333-4333-8333-333333333333",accountId:account,activeGrantId:"44444444-4444-4444-8444-444444444444"};
const grant={id:session.activeGrantId,accountId:account,personId:person,role:"registrar",organizationId:"55555555-5555-4555-8555-555555555555",siteId:null,active:true};
const request=(token="x".repeat(48))=>new Request("https://demo.example/access",{headers:{cookie:accessSessionCookie+"="+token}});
beforeEach(()=>{state.sessions=[session];state.grants=[grant];state.selects=0;state.calls=0;process.env.CAN_ACCESS_TOKEN_PEPPER="integration-test-only-pepper-32-characters";});
afterEach(()=>vi.restoreAllMocks());
describe("R2 session source boundary",()=>{
 it("denies missing cookies without querying the database",async()=>{
  await expect(getCommandContext(new Request("https://demo.example/"))).rejects.toThrow();
  expect(state.selects).toBe(0);
 });
 it("denies malformed cookies without querying the database",async()=>{
  await expect(getCommandContext(request("short"))).rejects.toThrow();
  expect(state.selects).toBe(0);
 });
 it("denies expired or revoked sessions when database lookup returns none",async()=>{
  state.sessions=[];
  await expect(getCommandContext(request())).rejects.toThrow();
 });
 it("rejects revoked or inactive active grants",async()=>{
  state.grants=[{...grant,active:false}];
  await expect(getCommandContext(request())).rejects.toThrow();
 });
 it("rejects a grant belonging to a different account",async()=>{
  state.grants=[{...grant,accountId:"66666666-6666-4666-8666-666666666666"}];
  await expect(getCommandContext(request())).rejects.toThrow();
 });
 it("resolves role, organization and actor from verified session and grant",async()=>{
  const ctx=await getCommandContext(request());
  expect(ctx.actorPersonId).toBe(person);
  expect(ctx.role).toBe("registrar");
  expect(ctx.scope.organizationIds).toEqual([grant.organizationId]);
 });
});
