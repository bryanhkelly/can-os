import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GroupOverviewPanel, GroupDetailsPanel, GroupResourcesPanel } from "./GroupInformationPanels";
import type { StudyGroupRecord } from "@/domain/study-group-display";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
const group = {
  id:"group-1", title:"Research group", kind:"interest",
  description:"Compare reliable sources",facilitatorName:"Facilitator",
  timezone:"UTC", memberCount:2,maxMembers:12,sectionId:null,
  sessions:[],
} as unknown as StudyGroupRecord;

describe("shared study group information", () => {
  it("does not imply a session exists when nothing has been scheduled", () => {
    const html=renderToStaticMarkup(<GroupOverviewPanel group={group} next={null}/>);
    expect(html).toContain("No sessions scheduled yet");
    expect(html).toContain("Compare reliable sources");
  });
  it("shows canonical type and facilitator facts", () => {
    const html=renderToStaticMarkup(<GroupDetailsPanel group={group}/>);
    expect(html).toContain("Interest group");
    expect(html).toContain("Facilitator");
    expect(html).toContain("2 of 12");
  });
  it("blocks class material links before verified group approval", () => {
    const html=renderToStaticMarkup(<GroupResourcesPanel
      group={{...group,sectionId:"section-1"}} approvedMember={false} role="student"/>);
    expect(html).toContain("Join to access shared resources");
    expect(html).not.toContain("Open class lessons");
  });
  it("reuses the authorized Class workspace for approved group learning", () => {
    const html=renderToStaticMarkup(<GroupResourcesPanel
      group={{...group,sectionId:"section-1"}} approvedMember={true} role="student"/>);
    expect(html).toContain("Open class lessons");
    expect(html).toContain("View class assignments");
  });
});
