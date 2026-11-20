import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GroupMembershipRequestRow, GroupModerationReportRow } from "./GroupReviewRows";
import type { StudyGroupRecord } from "@/domain/study-group-display";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
const member={id:"pending-1",studentName:"Learner",studentPersonId:"person-1",
  guardianReady:false} as StudyGroupRecord["pendingMembers"][number];
const report={id:"report-1",reason:"Unkind language",
  postBody:"Reviewed report text",postHidden:false} as StudyGroupRecord["reports"][number];

describe("shared group review rows", () => {
  it("never enables approval before guardian permission is recorded", () => {
    const html=renderToStaticMarkup(<GroupMembershipRequestRow
      member={member} groupId="group-1" groupTitle="Academic skills"
      busy={false} membershipEnabled={true} onDecision={()=>{}}/>);
    expect(html).toContain("Awaiting guardian permission");
    expect(html).toContain("Academic skills");
    expect(html).toMatch(/disabled[^>]*>Approve/);
  });
  it("uses one approval view in the directory and group workspace", () => {
    const html=renderToStaticMarkup(<GroupMembershipRequestRow
      member={{...member,guardianReady:true}} groupId="group-1"
      variant="directory" busy={false} membershipEnabled={true} onDecision={()=>{}}/>);
    expect(html).toContain("Guardian permission recorded");
    expect(html).toContain("Approve");
  });
  it("renders report review as a moderation decision, not an automatic ban", () => {
    const html=renderToStaticMarkup(<GroupModerationReportRow
      report={report} groupId="group-1" groupTitle="Study group"
      variant="directory" busy={false} moderationEnabled={true}
      onResolve={()=>{}}/>);
    expect(html).toContain("Reviewed report text");
    expect(html).toContain("Hide and resolve");
    expect(html).toContain("Resolve only");
  });
  it("does not allow a hidden post report to bypass disabled moderation authority", () => {
    const html=renderToStaticMarkup(<GroupModerationReportRow
      report={{...report,postHidden:true}} groupId="group-1"
      busy={false} moderationEnabled={false} onResolve={()=>{}}/>);
    expect(html).toContain("Post already hidden");
    expect((html.match(/disabled/g)??[]).length).toBeGreaterThanOrEqual(2);
  });
});
