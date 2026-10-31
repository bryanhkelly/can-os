import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/operations.launch.$programId";
import type { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";

const state = vi.hoisted(() => ({ data: null as unknown }));
// Static presentation tests never open a database connection.
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/hooks/useWorkspaceMutation", () => ({ useWorkspaceMutation: () => ({ isSubmitting: false, submit: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useLoaderData: () => state.data }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/modules/programs/launch-academics.functions", () => ({
  getLaunchAcademicSetup: vi.fn(), provisionLaunchSection: vi.fn(), assignLaunchTeacher: vi.fn(),
  publishLaunchTeacherPolicy: vi.fn(),
}));
vi.mock("@/components/operations/SectionLifecycleManager", () => ({ SectionLifecycleWorkspace: () => null }));
vi.mock("@/components/profiles/Qualifications", () => ({ Qualifications: () => null }));
vi.mock("@/modules/profiles/qualification-catalog.functions",()=>({createQualificationCatalogEntry:vi.fn()}));
vi.mock("@/modules/programs/teacher-policy.functions",()=>({reviseLaunchTeacherPolicy:vi.fn()}));

type Snapshot = Awaited<ReturnType<typeof getLaunchAcademicSetup>>;
const snapshot: Snapshot = {
  program: { id: "program", name: "School", status: "launching", organizationId: "org",
    academicProviderOrganizationId: "org", siteId: "site", deliveryModel: { onsite: true } },
  years: [], terms: [], catalog: [], scheduleOptions: [], teachingStaff: [{ personId: "teacher", first: "Alex", last: "Teacher" }],
  qualificationCatalog: [{ key: "license", title: "Teaching license" }], policyPublished: false,canAuthorCatalog:false,canPublishTeacherPolicy:true,
  teacherPolicies: [], canReviseTeacherPolicy: false,
  academicAuthority: { teacherAssignment: true, creditConfiguration: true },
  sections: [{
    id: "section", title: "Science", code: "SCI", termId: "term", active: true, teachers: [],
    candidates: [{ personId: "teacher", eligible: false, reasons: ["Qualification policy not configured."],
      from: "2027-08-16T07:00:00.000Z", through: "2027-12-20T08:00:00.000Z" }],
    readiness: { sectionId: "section", ready: false,
      items: [{ key: "launch_staffing", state: "blocked", message: "Qualification policy not configured." }],
      metrics: { enrollmentCapacity: 30, activeEnrollment: 0, expectedDemand: null, reservedInstructionalSeats: 0 } },
    classroom: { sectionId: "section", ready: false, activeStudentCount: 0,
      blockers: [{ key: "missing_qualified_teacher", message: "Assign an eligible teacher." }],
      firstWeek: { lesson: null, assessment: null } },
  }],
};
function render(data: Snapshot) {
  state.data = { ok: true, data };
  const Page = Route.options.component;
  if (typeof Page !== "function") throw new Error("Missing launch page");
  return renderToStaticMarkup(<Page />);
}
describe("launch staffing presentation", () => {
  it("shows missing policy blockers, catalog requirements and explicit publication confirmation", () => {
    const html = render(snapshot);
    expect(html).toContain("Qualification policy not configured.");
    expect(html).toContain("Teaching license");
    expect(html).toContain("independently verified");
    expect(html).toContain("I confirm these requirements are reviewed");
    expect(html).toContain("cannot be edited here");
    expect(html).toContain("does not certify legal or regulatory compliance");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Add instructor");
    expect(html).not.toContain("Instructor assigned.");
  });
  it("hides initial publication without an explicit institutional publisher grant", () => {
    const html = render({...snapshot,canPublishTeacherPolicy:false});
    expect(html).toContain("verified, program-scoped institutional staffing-policy publisher");
    expect(html).not.toContain("Publish reviewed requirements");
    expect(html).not.toContain("I confirm these requirements are reviewed");
  });
  it("shows published status without suggesting that publication verifies a teacher", () => {
    const html = render({ ...snapshot, policyPublished: true });
    expect(html).toContain("Program requirements are published");
    expect(html).toContain("Qualification policy not configured.");
    expect(html).not.toContain("Publish reviewed requirements");
  });
  it("makes an empty qualification catalog actionable instead of inventing requirements", () => {
    const html = render({ ...snapshot, qualificationCatalog: [] });
    expect(html).toContain("No qualification catalog entries exist");
    expect(html).toContain("Configure the shared qualification catalog");
  });
  it("does not offer shared catalog writes to an ordinary registrar",()=>{
    const html=render(snapshot);
    expect(html).toContain("explicit qualification-catalog steward grant");
    expect(html).not.toContain("Add shared definition");
    expect(html).toContain("(license)");
  });
  it("offers create-only catalog authoring to a verified steward with confirmation",()=>{
    const html=render({...snapshot,canAuthorCatalog:true});
    expect(html).toContain("Stable qualification key");
    expect(html).toContain("Classification key");
    expect(html).toContain("Reason for shared catalog addition");
    expect(html).toContain("I checked existing entries");
    expect(html).toContain("cannot be edited here");
    expect(html).toContain("Existing claims and published requirements will not change");
    expect(html).toContain("Add shared definition");
  });
  const policies: Snapshot["teacherPolicies"] = [
    {id:"v1",version:"1",status:"published",effectiveFrom:null,effectiveThrough:"2027-10-01T00:00:00.000Z",qualificationKeys:["license"]},
    {id:"v2",version:"2",status:"published",effectiveFrom:"2027-10-01T00:00:00.000Z",effectiveThrough:null,qualificationKeys:["license"]},
  ];
  it("shows policy history without offering revisions to an ordinary registrar",()=>{
    const html=render({...snapshot,policyPublished:true,teacherPolicies:policies});
    expect(html).toContain("Version 1");
    expect(html).toContain("Version 2");
    expect(html).toContain("2027-10-01T00:00:00.000Z");
    expect(html).toContain("explicit institutional staffing-policy publisher grant");
    expect(html).not.toContain("Publish policy revision");
  });
  it("offers a complete future-dated revision with explicit confirmation to a publisher",()=>{
    const html=render({...snapshot,policyPublished:true,teacherPolicies:policies,canReviseTeacherPolicy:true});
    expect(html).toContain("complete replacement requirement set");
    expect(html).toContain("Future effective date and time (UTC)");
    expect(html).toContain("Reason for revision");
    expect(html).toContain("Earlier policy history will be preserved");
    expect(html).toContain("opening is blocked");
    expect(html).toContain("Publish policy revision");
  });
  it("keeps planning and history visible while disabling new delegated academic acts",()=>{
    const html=render({...snapshot,academicAuthority:{teacherAssignment:false,creditConfiguration:false}});
    expect(html).toContain("Current academic authority is incomplete");
    expect(html).toContain("Existing assignments, credits and official records remain visible");
    expect(html).toContain("Planning and revocation remain available");
    expect(html).toContain('aria-label="Credit units for new section"');
    expect(html).toContain('disabled=""');
  });
});

// Child staffing panels have their own query and authorization tests.
vi.mock("@/components/operations/LocalSiteDelegationPanel",()=>({LocalSiteDelegationPanel:()=>null}));
vi.mock("@/components/operations/SectionFacilitatorPanel",()=>({SectionFacilitatorPanel:()=>null}));
