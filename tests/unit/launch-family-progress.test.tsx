import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LaunchFamilyProgress } from "@/components/operations/LaunchFamilyProgress";
import type { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({children}: {children:ReactNode}) => <a>{children}</a>,
}));
vi.mock("@/components/operations/FamilyInviteImporter", () => ({
  FamilyInviteImporter: () => <div>Saved invitation actions</div>,
}));

type Workspace = Awaited<ReturnType<typeof listFamilyInvitations>>;
const batch = (programId:string, siteId:string) => ({
  id:programId+"-batch",programId,siteId,programName:"School",subject:"Welcome",
  introduction:"Hello",createdAt:"2026-10-31T00:00:00.000Z",
  status:"complete" as const,purpose:"interest" as const,outboxStatus:"processed" as const,
  recipients:[{firstName:"Family",lastName:"One",email:"family@example.test",
    status:"provider_accepted" as const,attempts:1,respondedAt:null,interest:null}],
});
function view(workspace:Workspace|null,programId="a",siteId="site"){
  return renderToStaticMarkup(<LaunchFamilyProgress
    admissionsCounts={null} enrollmentCounts={null} familyInvitations={workspace}
    programId={programId} siteId={siteId}/>);
}
describe("launch family outreach progress",()=>{
  it("uses saved program and site scoped invitation records without calling provider acceptance delivery",()=>{
    const html=view({programs:[],batches:[batch("a","site"),batch("b","site")]} as Workspace);
    expect(html).toContain("Saved invitation batches");
    expect(html).toContain("Accepted by provider");
    expect(html).toContain("Provider acceptance is not confirmed inbox delivery");
    expect(html).toContain(">1</strong>Saved invitation batches");
  });
  it("does not treat unavailable invitation history as a successful send",()=>{
    const html=view(null);
    expect(html).toContain("Invitation history is unavailable");
    expect(html).toContain("Do not assume outreach was sent");
  });
});
