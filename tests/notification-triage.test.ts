import {describe,it,expect} from "vitest";
import {dedupeQueue,notificationRoute,notificationSummary} from "../src/domain/notification-triage";
describe("notification triage",()=>{
 it("does not fabricate actionable links for unsupported records",()=>{expect(notificationRoute("other","id")).toBeNull();expect(notificationRoute("action",null)).toBeNull();});
 it("removes duplicate records without losing priority",()=>{
 const items=[{id:"1",kind:"action" as const,title:"Referral",detail:"",priority:"high" as const,createdAt:"2026-10-15",href:"/student/support",needsResponse:true},{id:"1",kind:"action" as const,title:"Referral",detail:"",priority:"high" as const,createdAt:"2026-10-14",href:"/student/support",needsResponse:true}];
 expect(dedupeQueue(items)).toHaveLength(1);
 expect(notificationSummary(dedupeQueue(items))).toMatchObject({total:1,urgent:1,needsResponse:1});
 });
});
