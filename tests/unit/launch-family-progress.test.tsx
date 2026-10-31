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
const batch = (programId:string, siteId:string): Workspace["batches"][number] => ({
  id:programId+"-"+siteId+"-batch",programId,siteId,programName:"School",subject:"Welcome",
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
    const html=view({programs:[],batches:[batch("a","site"),batch("b","site")]});
    expect(html).toContain("Saved invitation batches");
    expect(html).toContain("Accepted by provider");
    expect(html).toContain("Provider acceptance is not confirmed inbox delivery");
    expect(html).toContain(">1</strong>Saved invitation batches");
  });
  it("isolates the selected site when a program has invitation batches at multiple sites",()=>{
    const html=view({programs:[],batches:[batch("a","site"),batch("a","other-site")]});
    expect(html).toContain(">1</strong>Saved invitation batches");
    expect(html).toContain(">1</strong>Accepted by provider");
  });
  it("distinguishes failed batches and queued recipients from completed delivery",()=>{
    const failed={...batch("a","site"),outboxStatus:"failed" as const,
      recipients:[{...batch("a","site").recipients[0]!,status:"retrying" as const}]};
    const html=view({programs:[],batches:[failed]});
    expect(html).toContain(">1</strong>Queued or retrying");
    expect(html).toContain(">0</strong>Accepted by provider");
    expect(html).toContain("need delivery review");
  });
  it("does not offer unauthorized outreach as a completed launch step",()=>{
    const html=view({programs:[],batches:[batch("a","site")]});
    expect(html).toContain("You cannot create new outreach for this selected school");
    expect(html).toContain("Saved batch records are loaded from the server");
  });
  it("does not treat unavailable invitation history as a successful send",()=>{
    const html=view(null);
    expect(html).toContain("Invitation history is unavailable");
    expect(html).toContain("Do not assume outreach was sent");
  });
});
