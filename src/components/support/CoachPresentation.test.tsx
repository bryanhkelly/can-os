import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CoachCaseloadList } from "./CoachCaseloadList";
import { CoachStudentTimeline } from "./CoachStudentTimeline";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,search:_search}:{to:string;children:ReactNode;search?:unknown})=><a href={to}>{children}</a>,
}));
type Caseload = Parameters<typeof CoachCaseloadList>[0]["students"][number];
type Event = Parameters<typeof CoachStudentTimeline>[0]["entries"][number];
const caseload=[{studentProfileId:"profile-1",name:"Student One",gradeLevel:"9",
  openReferrals:1,latestReferralStage:"follow_up",hasOpenPlan:false,
  openInsights:0,openActions:2,lastActivityAt:"2026-11-18T16:00:00Z"}] as unknown as Caseload[];

describe("shared specialist caseload and student timeline", () => {
  it("renders a select-only caseload control with semantic V6.1 colors", () => {
    const html=renderToStaticMarkup(<CoachCaseloadList students={caseload}
      selected="profile-1" onSelect={()=>{}}/>);
    expect(html).toContain("Student One");
    expect(html).toContain('type="button"');
    expect(html).toContain("1 open referral");
    expect(html).not.toContain("bg-stone-warm");
  });
  it("does not claim history exists before the authorized load completes", () => {
    const html=renderToStaticMarkup(<CoachStudentTimeline entries={[]} loading={true}/>);
    expect(html).toContain("Loading history");
    expect(html).not.toContain("No recorded history yet");
  });
  it("renders a source-owned referral event", () => {
    const events=[{id:"referral-1",kind:"referral",title:"Support referral",
      occurredAt:"2026-11-19T16:00:00Z",outcome:null,status:"open",
      detail:"Teacher requested follow-up.",stageHistory:[]}] as unknown as Event[];
    const html=renderToStaticMarkup(<CoachStudentTimeline entries={events} loading={false}/>);
    expect(html).toContain("Support referral");
    expect(html).toContain("Teacher requested follow-up.");
    expect(html).toContain("Open referral");
  });
});
