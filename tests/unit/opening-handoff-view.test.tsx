import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OpeningHandoffs } from "@/components/operations/OpeningHandoffs";
import { Route } from "@/routes/operations.launch.index";
import type { getSiteToday } from "@/modules/operations/site-today.functions";

const state=vi.hoisted(()=>({data:null as unknown}));
// Static presentation tests never open a database connection.
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/hooks/useWorkspaceMutation", () => ({ useWorkspaceMutation: () => ({ isSubmitting: false, submit: vi.fn() }) }));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=> (options:object)=>({options,useLoaderData:()=>state.data,useSearch:()=>({})}),
  Link:({children}: {children:ReactNode})=><a>{children}</a>,
  useRouter:()=>({invalidate:vi.fn()}),
}));
vi.mock("@/modules/programs/opening-handoff.functions",()=>({acknowledgeLaunchHandoff:vi.fn(),transferLaunchHandoff:vi.fn()}));
vi.mock("@/modules/enrollment/family-invitations.functions",()=>({
  listFamilyInvitations:vi.fn(),sendFamilyInvitations:vi.fn(),
}));
vi.mock("@/modules/programs/launch.functions",()=>({
  activateLaunch:vi.fn(),completeLaunchRequirement:vi.fn(),listLaunches:vi.fn(),listLaunchOptions:vi.fn(),
  startLaunch:vi.fn(),createLaunchSite:vi.fn(),scheduleLaunchOrientation:vi.fn(),
}));
vi.mock("@/components/operations/LaunchPortfolio",()=>({LaunchPortfolio:()=>null}));

type Handoff=Awaited<ReturnType<typeof getSiteToday>>["openingHandoffs"][number];
const handoff:Handoff={
  id:"handoff",programId:"program",siteId:"site",title:"Academy - opening handoff",status:"open",
  ownerPersonId:"receiver",firstName:"Alex",lastName:"Operator",createdAt:"2026-10-19T12:00:00.000Z",
  openedAt:"2026-10-19T12:00:00.000Z",sectionCountAtOpening:2,
  resolvedAt:null,resolutionNote:null,canAcknowledge:false,
  recipientEligible:true,replacementOperators:[],revision:0,lastTransfer:null,
};
describe("opening handoff presentation",()=>{
  it("surfaces lost recipient access without offering unauthorized reassignment",()=>{
    const html=renderToStaticMarkup(<OpeningHandoffs handoffs={[{...handoff,recipientEligible:false}]}/>);
    expect(html).toContain("named recipient is no longer eligible");
    expect(html).not.toContain("Transfer pending handoff");
  });
  it("offers explicitly authorized recovery with a reason and independent receipt",()=>{
    const html=renderToStaticMarkup(<OpeningHandoffs handoffs={[{...handoff,recipientEligible:false,
      replacementOperators:[{personId:"next",firstName:"New",lastName:"Operator"}]}]}/>);
    expect(html).toContain("Replacement site operator");
    expect(html).toContain("Reason for recovery");
    expect(html).toContain("independently acknowledge receipt");
    expect(html).toContain("Transfer pending handoff");
  });
  it("does not invent acknowledgment for legacy active programs",()=>{
    const html=renderToStaticMarkup(<OpeningHandoffs handoffs={[]}/>);
    expect(html).toContain("No opening handoff is recorded");
    expect(html).toContain("not automatically marked acknowledged");
    expect(html).not.toContain("Acknowledge receipt");
  });
  it("shows the named recipient and opening snapshot without offering another operator acknowledgment",()=>{
    const html=renderToStaticMarkup(<OpeningHandoffs handoffs={[handoff]}/>);
    expect(html).toContain("Alex");
    expect(html).toContain("Operator");
    expect(html).toContain("2 sections in the opening record");
    expect(html).toContain("Awaiting named operator acknowledgment");
    expect(html).toContain("Only the named recipient");
    expect(html).not.toContain("Acknowledge receipt");
    expect(html).toContain("not regulatory approval");
  });
  it("offers confirmed receipt with a note only when the server permits it",()=>{
    const html=renderToStaticMarkup(<OpeningHandoffs handoffs={[{...handoff,canAcknowledge:true}]}/>);
    expect(html).toContain("Acknowledgment note");
    expect(html).toContain("received responsibility for daily operations");
    expect(html).toContain("Acknowledge receipt");
    expect(html).toContain('disabled=""');
  });
  it("preserves completed receipt and its note without a second completion control",()=>{
    const html=renderToStaticMarkup(<OpeningHandoffs handoffs={[{...handoff,status:"resolved",
      resolvedAt:"2026-10-19T13:00:00.000Z",resolutionNote:"Reviewed launch and received operations."}]}/>);
    expect(html).toContain("Acknowledged at");
    expect(html).toContain("Reviewed launch and received operations.");
    expect(html).not.toContain("Acknowledge receipt");
  });
  function renderLaunch(operators:{personId:string;firstName:string;lastName:string}[]){
    state.data={ok:true,data:{authError:"",extendedPlanning:null,options:{organizations:[],academicProviderOrganizations:[],creditIssuingOrganizations:[],sites:[],jurisdictions:[]},launches:{launches:[{
      id:"program",name:"Academy",siteId:"site",status:"ready",type:"full_school",
      journey:{id:"journey",status:"ready"},requirements:[],openingOperators:operators,
    }]} ,preparationPrograms:null,familyInvitations:null,admissionsCounts:null,enrollmentCounts:null}};
    const Page=Route.options.component;
    if(typeof Page!=="function")throw new Error("Missing launch page");
    return renderToStaticMarkup(<Page/>);
  }
  it("requires deliberate selection of the receiving operator before opening",()=>{
    const html=renderLaunch([{personId:"receiver",firstName:"Alex",lastName:"Operator"}]);
    expect(html).toContain("Receiving site operator (required)");
    expect(html).toContain("Select the named receiving operator");
    expect(html).toContain("Alex");
    expect(html).toContain("This does not waive readiness checks");
    expect(html).toMatch(/disabled=""[^>]*>\s*Activate/);
  });
  it("makes missing operator access explicit rather than creating an implicit grant",()=>{
    expect(renderLaunch([])).toContain("No active site registrar/operator is available");
  });
});
