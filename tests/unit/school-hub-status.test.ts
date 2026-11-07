import { describe, expect, it } from "vitest";
import { websiteHubStatus, academicHubStatus, complianceHubStatus, unavailableHubStatus } from "@/domain/school-hub-status";
const program={id:"program",status:"launching",journey:{id:"journey",status:"in_progress"},requirements:[{id:"requirement",key:"teacher-readiness",title:"Verify academic staffing",status:"blocked",blocking:true}]};
describe("persisted school Hub statuses",()=>{
 it("keeps an unpublished website incomplete and flags review even over an older live website",()=>{
  expect(websiteHubStatus(null,null).state).toBe("Not Started");expect(websiteHubStatus("draft",null).state).toBe("In Progress");expect(websiteHubStatus("published","published").state).toBe("In Progress");expect(websiteHubStatus("published","review_required").state).toBe("Attention Needed");expect(websiteHubStatus("published","draft").state).toBe("In Progress");
 });
 it("does not equate publication records with public host verification",()=>{
  expect(websiteHubStatus("published","published").detail).toContain("reachability has not been verified");
 });
 it("requires recorded academic requirements before declaring completion",()=>{
  expect(academicHubStatus([]).state).toBe("Not Started");expect(academicHubStatus([program]).state).toBe("Attention Needed");expect(academicHubStatus([{...program,requirements:[]}]).state).toBe("In Progress");expect(academicHubStatus([{...program,requirements:[{...program.requirements[0]!,status:"complete"}]}]).state).toBe("Complete");
 });
 it("never equates prepared requirements with independent opening permission",()=>{
  expect(complianceHubStatus([]).state).toBe("Blocked");expect(complianceHubStatus([program]).nextAction).toBe("Verify academic staffing");expect(complianceHubStatus([{...program,journey:{status:"ready"},requirements:[]}]).state).toBe("In Progress");expect(unavailableHubStatus.state).toBe("Unavailable");
 });
});
