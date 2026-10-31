vi.mock("@/modules/operations/onsite-day-preparation.functions",()=>({getOnsiteSchoolDayPreparation:vi.fn()}));
vi.mock("@/modules/operations/onsite-room-plan.functions",()=>({getOnsiteRoomPlanningFn:vi.fn(),submitOnsiteRoomPlanFn:vi.fn(),reviewOnsiteRoomPlanFn:vi.fn()}));
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteDayPage } from "@/routes/site.day";
import { workspaceHome, workspaceLinks } from "@/components/shell/WorkspaceNavigation";

vi.mock("@tanstack/react-router", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  createFileRoute: () => (config: unknown) => config,
}));
vi.mock("@/modules/attendance/onsite-attendance-workflow.functions", () => ({
  getOnsiteStaffDayContext: vi.fn(),
  listExpectedOnsiteRoster: vi.fn(),
  markExpectedOnsiteAttendance: vi.fn(),
}));
vi.mock("@/components/shell/WorkspaceSession",()=>({useWorkspaceSession:()=>({
  session:null,error:null,
})}));
vi.mock("@/modules/profiles/qualifications.functions",()=>({
  beginQualificationUpload:vi.fn(),decideQualification:vi.fn(),finishQualificationUpload:vi.fn(),
  getQualificationEvidence:vi.fn(),getQualifications:vi.fn(),
}));
vi.mock("@/modules/operations/onsite-supervision.functions",()=>({
  getOnsiteSupervisionPlan:vi.fn(),
}));
vi.mock("@/modules/operations/onsite-duty-response.functions",()=>({
  getOnsiteDutyResponses:vi.fn(),respondToOnsiteDuty:vi.fn(),
}));
vi.mock("@/modules/operations/onsite-physical-presence.functions",()=>({
  getOnsitePhysicalPresence:vi.fn(),reportOnsitePhysicalPresence:vi.fn(),witnessOnsiteBlockPresence:vi.fn(),
}));
vi.mock("@/modules/operations/onsite-day-review.functions",()=>({
  attestOnsiteDayReview:vi.fn(),getOnsiteDayReview:vi.fn(),
}));
vi.mock("@/modules/operations/pickup.functions",()=>({
  createPickupCustodyHold:vi.fn(),getOnsitePickupRoster:vi.fn(),
  recordDeniedPickup:vi.fn(),recordUncollectedChild:vi.fn(),
  recordVerifiedPickupRelease:vi.fn(),resolvePickupCustodyHold:vi.fn(),
}));

describe("Hybrid Site daily facilitator workspace",()=>{
  it("links only site-day and no grades, counseling or generic case consoles",()=>{
    for(const role of ["room_facilitator","site_staff","site_leader"]){
      expect(workspaceHome[role]).toBe("/site/day");
      const destinations=workspaceLinks[role].map(item=>item.path);
      expect(destinations).toContain("/site/day");
      for(const forbidden of ["/teacher/gradebook","/counselor","/support","/admissions","/admin"])
        expect(destinations).not.toContain(forbidden);
    }
    expect(workspaceLinks.paraeducator).toEqual([
      {title:"Report a safety concern",path:"/safeguarding"},
      {title:"My profile",path:"/profiles"},
    ]);
  });
  it("explains the boundary between physical presence, online activity and student release",()=>{
    const html=renderToStaticMarkup(<SiteDayPage />);
    expect(html).toContain("Site Today");
    expect(html).toContain("Online learning activity is not proof of physical presence");
    expect(html).toContain("arrival marks do not authorize student release");
    for(const disallowed of ["Guardian excuse details","Counseling notes","Approve grade","Sign out student"]){
      expect(html).not.toContain(disallowed);
    }
  });
});
