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

describe("Hybrid Site daily facilitator workspace",()=>{
  it("links only site-day and no grades, counseling or generic case consoles",()=>{
    for(const role of ["room_facilitator","site_staff","site_leader"]){
      expect(workspaceHome[role]).toBe("/site/day");
      expect(workspaceLinks[role]).toEqual([{title:"Onsite day",path:"/site/day"}]);
    }
    expect(workspaceLinks.paraeducator).toEqual([{title:"My profile",path:"/profiles"}]);
  });
  it("explains the boundary between physical presence, online activity and student release",()=>{
    const html=renderToStaticMarkup(<SiteDayPage />);
    expect(html).toContain("Onsite day");
    expect(html).toContain("Online lesson activity cannot mark");
    expect(html).toContain("not student release or checkout authorization");
    for(const disallowed of ["Guardian excuse details","Counseling notes","Approve grade","Sign out student"]){
      expect(html).not.toContain(disallowed);
    }
  });
});
