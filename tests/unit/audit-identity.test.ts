import {describe,expect,it} from "vitest";
import {auditDelegation,reservedAuditIdentityKeys,sanitizeAuditContextExtras} from "@/domain/audit-identity";

const delegated={accountId:"effective",impersonatedByAccountId:"owner",sessionId:"session",grantId:"grant"};
describe("verified audit attribution",()=>{
  it("distinguishes production Platform Owner delegation from demo switching",()=>{
    expect(auditDelegation({...delegated,delegatedByPlatformOwner:true,delegationMode:"act",delegationExpiresAt:"2026-11-24T12:00:00Z"}))
      .toEqual({effectiveAccountId:"effective",sessionAccountId:"owner",sessionId:"session",selectedGrantId:"grant",delegatedByPlatformOwner:true,delegationMode:"act",delegationExpiresAt:"2026-11-24T12:00:00Z"});
    expect(auditDelegation(delegated)).toEqual({effectiveAccountId:"effective",sessionAccountId:"owner",sessionId:"session",selectedGrantId:"grant",delegatedByDemoAdmin:true});
  });
  it("does not manufacture delegation for ordinary users or background tasks",()=>{
    expect(auditDelegation({})).toEqual({});
    expect(auditDelegation({accountId:"ordinary",sessionId:"session"})).toEqual({});
  });
  it("rejects every caller supplied identity key while preserving legitimate context",()=>{
    const forged=Object.fromEntries(reservedAuditIdentityKeys.map(key=>[key,"forged"]));
    expect(sanitizeAuditContextExtras({...forged,reason:"approved"})).toEqual({reason:"approved"});
    expect(sanitizeAuditContextExtras()).toEqual({});
  });
});
