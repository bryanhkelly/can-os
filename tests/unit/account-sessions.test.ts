import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { AccessContext } from "@/domain/access-context";

const state = vi.hoisted(() => ({
 reads: [] as Array<{id:string;createdAt:Date;lastActivityAt:Date;expiresAt:Date}>,
 changed: [] as Array<{id:string}>,
 conditions: [] as SQL[],
 changes: [] as Array<Record<string,unknown>>,
 audit: vi.fn(),
}));

vi.mock("@/platform/mutation", () => ({ writeAudit: state.audit }));

vi.mock("@/db/client", () => {
 const tx = {
  update: () => {
   const query = {
    set: (value:Record<string,unknown>) => {
     state.changes.push(value);
     return query;
    },
    where: (sql:SQL) => {
     state.conditions.push(sql);
     return query;
    },
    returning: async () => state.changed,
   };
   return query;
  },
 };
 return { db: {
  select: () => {
   const query = {
    from: () => query,
    where: (sql:SQL) => {
     state.conditions.push(sql);
     return query;
    },
    orderBy: () => query,
    limit: async () => state.reads,
   };
   return query;
  },
  transaction: async (fn:(transaction:typeof tx)=>Promise<unknown>) => fn(tx),
 } };
});

import { listAccountSessions, revokeOwnedAccountSessions } from "@/modules/identity/account-sessions.server";

const actor:AccessContext = {
 actorPersonId:"actor-1",accountId:"account-1",sessionId:"session-1",grantId:"grant-1",
 role:"registrar",capabilities:new Set(),scope:{
  organizationIds:["school-1"],siteIds:["site-1"],programIds:["program-1"],
 },
};
const sqlText = (expression:SQL) => new PgDialect().sqlToQuery(expression);

beforeEach(() => {
 state.reads=[];
 state.changed=[];
 state.conditions=[];
 state.changes=[];
 state.audit.mockReset();
});

describe("owned security sessions", () => {
 it("keeps delegated inventory and revocation scoped to the session owner",async()=>{
  const delegated={...actor,accountId:"selected-account",sessionAccountId:"admin-owner"};
  await listAccountSessions(delegated);
  expect(sqlText(state.conditions[0]!).params).toContain("admin-owner");
  expect(sqlText(state.conditions[0]!).params).not.toContain("selected-account");
  state.changed=[{id:"session-2"}];
  await revokeOwnedAccountSessions(delegated,{kind:"one",sessionId:"session-2"});
  expect(sqlText(state.conditions[1]!).params).toContain("admin-owner");
  expect(sqlText(state.conditions[1]!).params).not.toContain("selected-account");
  expect(state.audit.mock.calls[0]?.[1]).toMatchObject({
   resourceId:"admin-owner",actorPersonId:"actor-1",
   context:{accountId:"selected-account",sessionAccountId:"admin-owner",
    grantId:"grant-1",sessionId:"session-1"},
  });
 });
 it("lists only server-filtered live sessions and flags current without leaking token hashes", async () => {
  const time=new Date();
  state.reads=[
   {id:"session-2",createdAt:time,lastActivityAt:time,expiresAt:new Date(time.getTime()+60_000)},
   {id:"session-1",createdAt:time,lastActivityAt:time,expiresAt:new Date(time.getTime()+60_000)},
  ];
  const result=await listAccountSessions(actor);
  expect(result).toHaveLength(2);
  expect(result.map(x=>x.current)).toEqual([false,true]);
  expect(result[0]).toMatchObject({id:"session-2",lastActivityAt:time.toISOString()});
  expect(JSON.stringify(result)).not.toMatch(/secret|tokenHash|personId|school-1/);
  const query=sqlText(state.conditions[0]!);
  expect(query.params).toContain("account-1");
  expect(query.sql).toContain("revoked_at");
  expect(query.sql).toContain("expires_at");
  expect(query.sql).toContain("updated_at");
 });
 it("revoke-one requires account ownership in the same conditional write", async () => {
  state.changed=[{id:"session-2"}];
  const result=await revokeOwnedAccountSessions(actor,{kind:"one",sessionId:"session-2"});
  expect(result).toEqual({revokedCount:1,currentRevoked:false});
  const query=sqlText(state.conditions[0]!);
  expect(query.params).toEqual(expect.arrayContaining(["account-1","session-2"]));
  expect(query.sql).toContain("account_id");
  expect(query.sql).toContain("revoked_at");
  expect(state.changes[0]?.revokedAt).toBeInstanceOf(Date);
  expect(state.audit).toHaveBeenCalledTimes(1);
  expect(state.audit.mock.calls[0]?.[1]).toMatchObject({
   actorPersonId:"actor-1",
   action:"identity.session.revoked_remote",
   context:{accountId:"account-1",sessionId:"session-1",targetSessionId:"session-2",revokedCount:1},
  });
 });
 it("does not reveal or audit unknown and cross-account session IDs", async () => {
  const result=await revokeOwnedAccountSessions(actor,{
   kind:"one",sessionId:"someone-elses-session",
  });
  expect(result).toEqual({revokedCount:0,currentRevoked:false});
  expect(state.audit).not.toHaveBeenCalled();
  expect(sqlText(state.conditions[0]!).params).toContain("account-1");
 });
 it("sign out everywhere revokes current plus other account sessions", async () => {
  state.changed=[{id:"session-2"},{id:"session-1"}];
  const result=await revokeOwnedAccountSessions(actor,{kind:"all"});
  expect(result).toEqual({revokedCount:2,currentRevoked:true});
  const params=sqlText(state.conditions[0]!).params;
  expect(params).toContain("account-1");
  expect(params).not.toContain("session-2");
  expect(state.audit.mock.calls[0]?.[1]).toMatchObject({
   action:"identity.sessions.revoked_all",context:{revokedCount:2},
  });
 });
 it("revoke-current reports that the HTTP boundary must clear the cookie", async () => {
  state.changed=[{id:"session-1"}];
  const result=await revokeOwnedAccountSessions(actor,{kind:"one",sessionId:"session-1"});
  expect(result.currentRevoked).toBe(true);
 });
 it("denies calls without a server-verified signed-in account", async () => {
  await expect(listAccountSessions({...actor,accountId:""})).rejects.toThrow("authenticated account");
  await expect(revokeOwnedAccountSessions({...actor,actorPersonId:""},{
   kind:"all",
  })).rejects.toThrow("authenticated account");
  expect(state.conditions).toEqual([]);
 });
});
