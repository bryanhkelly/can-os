import {describe,expect,it} from "vitest";
import {assertMembershipSwitchIdentity} from "@/domain/membership-switch-policy";
import {resolveAccessContext} from "@/domain/access-context";

const accountId="account-1", personId="person-1";
const grants=[
  {id:"personal",accountId,personId,active:true,role:"account_holder",organizationId:null,siteId:null},
  {id:"student",accountId,personId,active:true,role:"student",organizationId:"org-a",siteId:"site-a"},
  {id:"guardian",accountId,personId,active:true,role:"guardian",organizationId:"org-a",siteId:"site-a"},
  {id:"teacher",accountId,personId,active:true,role:"teacher",organizationId:"org-b",siteId:"site-b"},
  {id:"site-admin",accountId,personId,active:true,role:"site_admin",organizationId:"org-a",siteId:"site-a"},
  {id:"network",accountId,personId,active:true,role:"network_admin",organizationId:"network-a",siteId:null},
];
const select=(targetGrantId:string,activePersonIds:string[]=[personId])=>
  assertMembershipSwitchIdentity({accountId,accountPersonId:personId,targetGrantId,grants,
    activePersonIds,demoAccountSwitching:false});
describe("one CAN account and independently scoped capacities",()=>{
  it.each(grants)("selects $role without changing account or Person",grant=>{
    expect(select(grant.id).personId).toBe(personId);
  });
  it("role switching does not union another grant's capabilities or Site",()=>{
    const student=resolveAccessContext({accountId,sessionId:"session",activeGrantId:"student"},grants);
    const teacher=resolveAccessContext({accountId,sessionId:"session",activeGrantId:"teacher"},grants);
    const network=resolveAccessContext({accountId,sessionId:"session",activeGrantId:"network"},grants);
    expect(student.scope.siteIds).toEqual(["site-a"]);
    expect(student.capabilities.has("assignments:grade")).toBe(false);
    expect(teacher.scope.siteIds).toEqual(["site-b"]);
    expect(teacher.capabilities.has("guardian:read")).toBe(false);
    expect(network.scope.organizationIds).toEqual(["network-a"]);
    expect(network.capabilities.has("enrollment:manage")).toBe(false);
    expect(network.scope.siteIds).toEqual([]);
  });
  it("blocks a second Person, foreign-account grant, inactive grant and unanchored account",()=>{
    expect(()=>select("teacher",[personId,"foreign-person"])).toThrow();
    expect(()=>assertMembershipSwitchIdentity({accountId,accountPersonId:null,
      targetGrantId:"student",grants,activePersonIds:[personId],demoAccountSwitching:false})).toThrow();
    expect(()=>assertMembershipSwitchIdentity({accountId,accountPersonId:personId,
      targetGrantId:"foreign",grants:[...grants,{...grants[1]!,id:"foreign",accountId:"other"}],
      activePersonIds:[personId],demoAccountSwitching:false})).toThrow();
    expect(()=>select("nonexistent")).toThrow();
  });
});
