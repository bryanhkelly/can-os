vi.mock("@/modules/operations/onsite-day-preparation.functions",()=>({getOnsiteSchoolDayPreparation:vi.fn()}));
vi.mock("@/components/operations/RoomCoverageWorkspace",()=>({RoomCoverageWorkspace:()=><section>All-day room coverage</section>}));
vi.mock("@/modules/operations/onsite-room-plan.functions",()=>({getOnsiteRoomPlanningFn:vi.fn(),submitOnsiteRoomPlanFn:vi.fn(),reviewOnsiteRoomPlanFn:vi.fn()}));
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { SiteDayPage } from "@/components/operations/SiteDayPage";
import { getWorkspaceHome, getWorkspaceLinks, workspaceLinks } from "@/components/shell/workspace-navigation.registry";

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@tanstack/react-router", async importOriginal => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  createFileRoute: () => (config: unknown) => config,
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/modules/attendance/onsite-attendance-workflow.functions", () => ({
  getOnsiteStaffDayContext: vi.fn(),
  getSiteDayOpeningStatuses: vi.fn(),
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
  const renderSiteDay = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderToStaticMarkup(<QueryClientProvider client={client}><SiteDayPage /></QueryClientProvider>);
  };
  it("links only site-day and no grades, counseling or generic case consoles",()=>{
    for(const role of ["room_facilitator","site_staff","site_leader"]){
      expect(getWorkspaceHome(role)).toBe("/home");
      const destinations=getWorkspaceLinks(role)?.map(item=>item.path)??[];
      expect(destinations).toContain("/home");
      for(const forbidden of ["/teacher/gradebook","/support","/admissions","/admin"])
        expect(destinations).not.toContain(forbidden);
    }
    expect(workspaceLinks.paraeducator).toEqual([
      {title:"Home",path:"/home",icon:"home"},
      {title:"Report a safety concern",path:"/safeguarding",icon:"safety"},
      {title:"My profile",path:"/profiles",icon:"users"},
    ]);
  });
  it("explains the boundary between physical presence, online activity and student release",()=>{
    const html=renderSiteDay();
    expect(html).toContain("Site Today");
    expect(html).toContain("Online learning activity is not proof of physical presence");
    expect(html).toContain("arrival marks do not authorize student release");
    expect(html).toContain("role-dashboard");
    expect(html.indexOf("Checking current school-opening authorization")).toBeLessThan(html.indexOf("can-dashboard-hero"));
    for(const disallowed of ["Guardian excuse details","Counseling notes","Approve grade","Sign out student"]){
      expect(html).not.toContain(disallowed);
    }
  });
});
