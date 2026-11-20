import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LaunchClassroomPrerequisites } from "./LaunchClassroomPrerequisites";

vi.mock("@tanstack/react-router",()=>({
  Link: ({to,children}:{to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
type Snapshot=Parameters<typeof LaunchClassroomPrerequisites>[0]["data"];
const empty={
  program:{id:"program-1",siteId:"site-1"},terms:[],scheduleOptions:[],
  catalog:[],teachingStaff:[],academicAuthority:{teacherAssignment:false},
} as unknown as Snapshot;

describe("academic classroom prerequisites",()=>{
  it("preserves blockers for missing academic year, curriculum and instructor",()=>{
    const html=renderToStaticMarkup(<LaunchClassroomPrerequisites data={empty}/>);
    expect(html).toContain("Prepare an academic year");
    expect(html).toContain("No instructional schedule exists");
    expect(html).toContain("No eligible instructor");
    expect(html).toContain("Complete institutional instructional service authorization");
  });
  it("describes preselected choices as reviewable, not approved",()=>{
    const ready={
      ...empty,terms:[{id:"term-1",schoolYearId:"year-1"}],
      scheduleOptions:[{id:"schedule-1",schoolYearId:"year-1"}],
      catalog:[{recommendation:{recommended:true}}],
      teachingStaff:[{personId:"teacher-1"}],
      academicAuthority:{teacherAssignment:true},
    } as unknown as Snapshot;
    const html=renderToStaticMarkup(<LaunchClassroomPrerequisites
      data={ready} schoolYearId="year-1"/>);
    expect(html).toContain("Reviewed choices are available");
    expect(html).toContain("must be reviewed");
    expect(html).not.toContain("Complete institutional instructional service authorization");
  });
});
