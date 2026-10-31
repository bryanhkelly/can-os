import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state=vi.hoisted(()=>({
  acquired:true,
  recent:[] as Array<{id:string}>,
  failTransaction:false,
  writes:vi.fn(),
  condition:null as SQL|null,
  lockCall:0,
}));

vi.mock("@/platform/mutation",()=>({writeAudit:state.writes}));
vi.mock("@/db/client",()=>{
 const query={
  from:()=>query,
  where:(condition:SQL)=>{state.condition=condition;return query;},
  limit:async()=>state.recent,
 };
 const tx={
  execute:async()=>{state.lockCall++;return {rows:[{acquired:state.acquired}]};},
  select:()=>query,
 };
 return {db:{transaction:async(fn:(tx:typeof tx)=>Promise<unknown>)=>{
  if(state.failTransaction)throw new Error("DB unavailable");
  return fn(tx);
 }}};
});

import {
 ANONYMOUS_AUTH_RESOURCE_ID,
 MAX_RECORDED_AUTH_REJECTIONS_PER_MINUTE,
 recordRejectedAuthentication,
} from "@/modules/identity/authentication-rejections.server";

beforeEach(()=>{
 state.acquired=true;
 state.recent=[];
 state.failTransaction=false;
 state.writes.mockReset();
 state.condition=null;
 state.lockCall=0;
});

describe("bounded anonymous authentication rejection auditing",()=>{
 it("records a generic unauthenticated failure, without account, email, IP or secret",async()=>{
  expect(await recordRejectedAuthentication("email_link")).toBe(true);
  expect(state.lockCall).toBe(1);
  expect(state.writes).toHaveBeenCalledTimes(1);
  expect(state.writes.mock.calls[0]?.[1]).toEqual({
   actorPersonId:null,
   action:"identity.verification.rejected",
   resourceType:"authentication",
   resourceId:ANONYMOUS_AUTH_RESOURCE_ID,
   scope:{},
   context:{method:"email_link",outcome:"rejected",attributable:false},
  });
  const condition=new PgDialect().sqlToQuery(state.condition!);
  expect(condition.sql).toContain("occurred_at");
  expect(condition.params).toContain("email_link");
  expect(condition.params).toContain(ANONYMOUS_AUTH_RESOURCE_ID);
 });
 it("does not write more events when the per-method, per-minute cap is full",async()=>{
  state.recent=Array.from({length:MAX_RECORDED_AUTH_REJECTIONS_PER_MINUTE},
   (_,i)=>({id:String(i)}));
  expect(await recordRejectedAuthentication("local_demo_code")).toBe(false);
  expect(state.writes).not.toHaveBeenCalled();
 });
 it("does not queue up writers when a parallel attempt already holds the cap lock",async()=>{
  state.acquired=false;
  expect(await recordRejectedAuthentication("email_link")).toBe(false);
  expect(state.writes).not.toHaveBeenCalled();
  expect(state.condition).toBeNull();
 });
 it("fails safely if event persistence is down without exposing token or account details",async()=>{
  state.failTransaction=true;
  const warn=vi.spyOn(console,"warn").mockImplementation(()=>{});
  try {
   expect(await recordRejectedAuthentication("email_link")).toBe(false);
   expect(state.writes).not.toHaveBeenCalled();
   expect(warn).toHaveBeenCalledWith("Anonymous authentication audit unavailable");
  }finally{warn.mockRestore();}
 });
});
