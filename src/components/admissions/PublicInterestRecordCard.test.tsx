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
  it("offers a scoped Program handoff for a consented Site-level lead without auto-enrolling",()=>{
    const siteLead={...base,programId:null,programName:null,applicationId:null,
      source:"published_site_general",consentAt:"2026-11-20T00:00:00.000Z",
      admissionsAuthorized:false,canSendApplicationInvitation:false,
      nextStep:{state:"follow_up",owner:"registrar",
        message:"Follow up on the Site interest."}} as unknown as PublicInterestRecord;
    const html=renderToStaticMarkup(<PublicInterestRecordCard row={siteLead} busy={false}
      programChoices={[{id:"program-1",siteId:"site-1",name:"Authorized Program"}]}
      selectedProgramId="program-1" onSelectProgram={()=>{}} onAssign={()=>{}}
      onInvite={()=>{}} onStatusChange={()=>{}}/>);
    expect(html).toContain("General Site interest");
    expect(html).toContain("Prelaunch Site interest");
    expect(html).toContain("Link to Program");
    expect(html).not.toContain("Invite to apply");
    expect(html).not.toContain("Verify email to apply");
  });
  it("keeps inquiry contact and guardianship verification separate", () => {
    const html=renderToStaticMarkup(<PublicInterestTimeline row={base}/>);
    expect(html).toContain("No affirmative follow-up consent recorded");
    expect(html).toContain("Family inquiry received");
    expect(html).not.toContain("School-year enrollment activated");
  });
});
