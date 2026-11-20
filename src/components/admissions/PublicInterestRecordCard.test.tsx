import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PublicInterestRecordCard, type PublicInterestRecord } from "./PublicInterestRecordCard";
import { PublicInterestTimeline } from "./PublicInterestTimeline";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children,search:_search}: {to:string;children:ReactNode;search?:unknown})=><a href={to}>{children}</a>,
}));

const base = {
  id:"interest-1",siteId:"site-1",programId:"program-1",
  firstName:"Jordan",lastName:"Applicant",programName:"Community learning",
  email:"jordan@example.org",status:"new",source:"public_site",
  createdAt:"2026-11-10T20:00:00.000Z",consentAt:null,
  contactedAt:null,invitationBatchId:null,
  admissionsAuthorizationStatus:"authorized",admissionsAuthorized:true,
  canSendApplicationInvitation:true,applicationId:null,
  familyStartRequestId:null,emailVerifiedAt:null,
  nextStep:{owner:"Registrar",message:"Review the family's inquiry."},
  message:null,
} as unknown as PublicInterestRecord;

describe("family interest record presentation", () => {
  it("renders actions for an authorized, open interest only", () => {
    const html = renderToStaticMarkup(<PublicInterestRecordCard row={base} busy={false}
      onInvite={() => {}} onStatusChange={() => {}}/>);
    expect(html).toContain("Jordan Applicant");
    expect(html).toContain("Invite to apply");
    expect(html).toContain("Mark contacted");
    expect(html).toContain("Close");
    expect(html).toContain("Review the family");
    expect(html).toContain("No affirmative follow-up consent recorded");
  });
  it("does not offer application invitations after closure", () => {
    const row={...base,status:"closed",admissionsAuthorized:false,
      canSendApplicationInvitation:false} as PublicInterestRecord;
    const html=renderToStaticMarkup(<PublicInterestRecordCard row={row} busy={false}
      onInvite={() => {}} onStatusChange={() => {}}/>);
    expect(html).not.toContain("Invite to apply");
    expect(html).not.toContain(">Mark contacted</button>");
  });
  it("keeps inquiry contact and guardianship verification separate", () => {
    const html=renderToStaticMarkup(<PublicInterestTimeline row={base}/>);
    expect(html).toContain("No affirmative follow-up consent recorded");
    expect(html).toContain("Family inquiry received");
    expect(html).not.toContain("School-year enrollment activated");
  });
});
