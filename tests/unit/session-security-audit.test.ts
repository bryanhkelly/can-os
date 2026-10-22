import { beforeEach, describe, expect, it, vi } from "vitest";

const state=vi.hoisted(()=>({writeAudit:vi.fn()}));
vi.mock("@/platform/mutation",()=>({writeAudit:state.writeAudit}));

import { recordSessionSecurityEvent } from "@/modules/identity/session-security-audit.server";
import type { MutationTx } from "@/platform/mutation";

beforeEach(()=>state.writeAudit.mockReset());

describe("verified session security audit",()=>{
 const tx={} as MutationTx;
 it("records consistent account, person, session, grant, role and outcome",async()=>{
  await recordSessionSecurityEvent(tx,{
   action:"identity.session.started",accountId:"account-1",
   actorPersonId:"person-1",sessionId:"session-1",
   grantId:"grant-1",role:"teacher",method:"email_link",
  });
  expect(state.writeAudit).toHaveBeenCalledWith(tx,expect.objectContaining({
   action:"identity.session.started",
   resourceType:"account",resourceId:"account-1",
   actorPersonId:"person-1",
   context:{accountId:"account-1",sessionId:"session-1",
    grantId:"grant-1",role:"teacher",outcome:"success",method:"email_link"},
  }));
 });
 it("records remote revocation without a raw cookie, token, or student information",async()=>{
  await recordSessionSecurityEvent(tx,{
   action:"identity.session.revoked_remote",accountId:"account-1",
   actorPersonId:"person-1",sessionId:"session-1",grantId:"grant-1",
   role:"registrar",targetSessionId:"session-2",revokedCount:1,
   // Deliberately unexpected object data is ignored by the event allowlist.
   ...({ rawToken:"DO-NOT-STORE", email:"private@example.test", ip:"192.0.2.1" } as Record<string,string>),
  });
  const row=state.writeAudit.mock.calls[0]?.[1];
  expect(row.context).toMatchObject({accountId:"account-1",
   sessionId:"session-1",grantId:"grant-1",role:"registrar",
   targetSessionId:"session-2",revokedCount:1,outcome:"success"});
  expect(JSON.stringify(row)).not.toMatch(/DO-NOT-STORE|private@example\.test|192\.0\.2\.1|rawToken/);
 });
 it("keeps actor null instead of claiming who revoked a detached session",async()=>{
  await recordSessionSecurityEvent(tx,{
   action:"identity.session.revoked",accountId:"account-1",actorPersonId:null,
   sessionId:"session-1",grantId:null,role:null,
  });
  expect(state.writeAudit.mock.calls[0]?.[1]).toMatchObject({
   actorPersonId:null,context:{grantId:null,role:null,outcome:"success"},
  });
 });
});
