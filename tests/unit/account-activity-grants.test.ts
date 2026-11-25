import {resolveAccessContext} from "@/domain/access-context";
import {describe,expect,it} from "vitest";
import {
  selectActivityMemberships,activityMembershipCovers,selectEffectiveStudentActivityMembership,
  type AccountActivityGrant,
} from "@/domain/account-activity-grants";
const account="00000000-0000-4000-8000-000000000001";
const person="00000000-0000-4000-8000-000000000002";
const orgA="00000000-0000-4000-8000-000000000003";
const orgB="00000000-0000-4000-8000-000000000004";
const siteA="00000000-0000-4000-8000-000000000005";
const siteB="00000000-0000-4000-8000-000000000006";
const grant=(i:number,role:string,org:string|null,site:string|null):
  AccountActivityGrant=>({
  id:String(i),accountId:account,personId:person,active:true,
  role,organizationId:org,siteId:site,
});
describe("account-wide personal participation authority",()=>{
  it("combines separately verified student and guardian memberships only for one Person",()=>{
    const all=[
      grant(1,"student",orgA,siteA),
      grant(2,"guardian",orgB,siteB),
      grant(3,"site_admin",orgB,null),
      {...grant(4,"guardian",orgA,siteB),active:false},
      {...grant(5,"guardian",orgA,siteB),personId:"someone-else"},
      {...grant(6,"student",orgA,null),accountId:"other-account"},
      grant(7,"account_holder",null,null),
    ];
    const selected=selectActivityMemberships(all,account,person);
    expect(selected.student.map(row=>row.id)).toEqual(["1"]);
    expect(selected.guardian.map(row=>row.id)).toEqual(["2"]);
    expect(selected.student).toHaveLength(1);
    expect(selected.guardian).toHaveLength(1);
  });
  it("never turns a same-Organization Site grant into sibling Site access",()=>{
    const selected=selectActivityMemberships([
      grant(1,"student",orgA,siteA),grant(2,"guardian",orgB,null),
    ],account,person);
    expect(activityMembershipCovers(selected.student[0]!,orgA,siteA)).toBe(true);
    expect(activityMembershipCovers(selected.student[0]!,orgA,siteB)).toBe(false);
    expect(activityMembershipCovers(selected.student[0]!,orgB,siteA)).toBe(false);
    expect(activityMembershipCovers(selected.guardian[0]!,orgB,siteA)).toBe(true);
    expect(activityMembershipCovers(selected.guardian[0]!,orgB,null)).toBe(true);
  });
  it("never invents a personal learning grant from staff or another Person",()=>{
    const result=selectActivityMemberships([
      grant(1,"site_admin",orgA,null),
      {...grant(2,"guardian",orgA,siteA),personId:"child"},
      {...grant(3,"student",orgA,siteB),active:false},
    ],account,person);
    expect(result).toEqual({student:[],guardian:[]});
  });
});

it("uses only the verified effective Student grant for switched history",()=>{
 const active=grant(1,"student",orgA,siteA);
 const actor=resolveAccessContext({accountId:account,sessionId:"session",activeGrantId:active.id},[active]);
 actor.impersonatedByAccountId="operator";
 expect(selectEffectiveStudentActivityMembership(actor)).toEqual([{id:active.id,role:"student",organizationId:orgA,siteId:siteA}]);
 expect(selectEffectiveStudentActivityMembership({...actor,scope:{organizationIds:[orgA],siteIds:[siteA,siteB]}})).toEqual([]);
 expect(selectEffectiveStudentActivityMembership({...actor,role:"guardian"})).toEqual([]);
});
