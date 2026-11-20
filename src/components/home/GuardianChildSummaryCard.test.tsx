import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GuardianChildSummaryCard, type GuardianChild } from "./GuardianChildSummaryCard";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,search:_search,hash:_hash}:{
    to:string;children:ReactNode;search?:unknown;hash?:string;
  })=><a href={to}>{children}</a>,
}));

const child={
  studentProfileId:"profile-1",studentPersonId:"person-1",
  displayName:"Alex",lastName:"Learner",sectionCount:2,awaitingSections:false,
  status:"on_track",missingCount:0,unexcusedAbsences:0,unexcusedTardies:0,
  nextDueAt:null,nextDueTimezone:null,workNeedsAttentionCount:0,workToReview:[],
} as unknown as GuardianChild;

describe("guardian child summary card", () => {
  it("renders current authorized learner signals and guardian destinations", () => {
    const html=renderToStaticMarkup(<GuardianChildSummaryCard child={child}/>);
    expect(html).toContain("Alex Learner");
    expect(html).toContain("On track");
    expect(html).toContain("2 active classes");
    expect(html).toContain("No overdue unfinished work");
    expect(html).toContain('href="/guardian/attendance"');
  });
  it("distinguishes awaiting Classes from completed placement", () => {
    const html=renderToStaticMarkup(<GuardianChildSummaryCard
      child={{...child,awaitingSections:true,status:"awaiting_courses"} as GuardianChild}/>);
    expect(html).toContain("Enrolled · awaiting classes");
    expect(html).toContain("Your school is arranging class placement");
  });
});
