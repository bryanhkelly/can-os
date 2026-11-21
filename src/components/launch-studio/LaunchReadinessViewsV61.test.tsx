import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProgramOfferingJourney } from "@/domain/program-offering-journey-v61";
import type {
  LaunchReadinessIntent, LaunchReadinessSolutions, LaunchReadinessPrograms,
  LaunchReadinessPublication, LaunchReadinessNoncredit,
} from "./launch-readiness-types-v61";
import { ProgramOfferingJourneyReadinessV61 } from "./ProgramOfferingJourneyReadinessV61";
import { SolutionPlansReadinessV61 } from "./SolutionPlansReadinessV61";
import { ProgramRequirementsReadinessV61 } from "./ProgramRequirementsReadinessV61";
import { SitePublicationReadinessV61 } from "./SitePublicationReadinessV61";
import { NoncreditPublisherReadinessV61 } from "./NoncreditPublisherReadinessV61";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children }: {
    to: string; search?: Record<string, string | undefined>; children: ReactNode;
  }) => {
    const params = new URLSearchParams(
      Object.entries(search ?? {}).filter((item): item is [string, string] => item[1] !== undefined));
    const href = to + (params.size ? "?" + params.toString() : "");
    return <a href={href}>{children}</a>;
  },
}));

const siteId = "00000000-0000-4000-8000-000000000121";
const loading = { state: "loading" } as const;
const unavailable = { state: "unavailable" } as const;

describe("Launch readiness read-only presentation components", () => {
  it("keeps each reader's unverified status visible independently", () => {
    const html = renderToStaticMarkup(<>
      <ProgramOfferingJourneyReadinessV61 siteId={siteId} context="prepare"
        savedIntent={loading} solutions={unavailable} noncredit={loading} pilotJourneys={null}/>
      <SolutionPlansReadinessV61 siteId={siteId} solutions={loading}/>
      <ProgramRequirementsReadinessV61 programs={unavailable}/>
      <SitePublicationReadinessV61 publication={unavailable}/>
      <NoncreditPublisherReadinessV61 siteId={siteId} noncredit={loading}/>
    </>);
    expect(html).toContain("We couldn't check the latest details for your programs.");
    expect(html).toContain("Loading Solution plans");
    expect(html).toContain("We couldn't check the latest program requirements");
    expect(html).toContain("We couldn't check your website's publication status");
    expect(html).toContain("Checking noncredit registration options");
    expect(html).not.toContain("Approved to enroll");
  });

  it("renders the actual saved Solution version with an exact Site-scoped deep link", () => {
    const solutions: LaunchReadinessSolutions = {
      siteId,
      templates: [{
        blueprintVersionId: "version-3", title: "Digital Skills", versionNo: 3,
        components: [{
          id: "requirement-1", key: "digital_lab",
          requirementMode: "required", description: "Devices for learners",
        }],
      }],
      configurations: [{
        configurationId: "plan-1", blueprintVersionId: "version-3",
        name: "Saturday Digital Skills", revision: 2, lifecycle: "draft",
      }],
    } as unknown as LaunchReadinessSolutions;
    const html = renderToStaticMarkup(
      <SolutionPlansReadinessV61 siteId={siteId} solutions={{state:"ready",value:solutions}}/>);
    expect(html).toContain("Saturday Digital Skills");
    expect(html).toContain("View what this solution needs");
    expect(html).toContain("Complete the necessary checks before offering this solution.");
    expect(html).toContain("solutionPlanId=plan-1");
    expect(html).toContain("siteId=" + siteId);
    expect(html).toContain("Continue plan");
    expect(html).not.toContain("Approved");
  });

  it("shows distinct Program, Solution and enrollment statuses without combining approvals", () => {
    const journeys: ProgramOfferingJourney[] = [{
      programCode: "can.program.ai_digital_skills",
      solution: null, savedPlan: null, offeringPublished: false,
      publisherCandidateCount: null, releasedCount: null, openRegistrationCount: null,
      facilitatedFourSessions: false,
    }];
    const intent = {siteId, intent: {programCodes:[journeys[0]!.programCode]}} as unknown as LaunchReadinessIntent;
    const html = renderToStaticMarkup(<ProgramOfferingJourneyReadinessV61
      siteId={siteId} context="prepare" savedIntent={{state:"ready",value:intent}}
      solutions={loading} noncredit={loading} pilotJourneys={journeys}/>);
    expect(html).toContain("Content not yet published");
    expect(html).toContain("Choose a solution");
    expect(html).toContain("Check registration requirements");
    expect(html).toContain("Plan this solution");
    expect(html).toContain("siteId=" + siteId);
  });

  it("keeps recorded publication, Program requirements and noncredit releases independent", () => {
    const programs = [{id:"program-1", name:"Program A",status:"planning",
      requirements:[{id:"safe-1",title:"Safeguarding",blocking:true,status:"incomplete"}],
    }] as unknown as LaunchReadinessPrograms;
    const publication = {address:{host:"academy.example",status:"published"}} as unknown as LaunchReadinessPublication;
    const noncredit = {
      candidates:[{deploymentId:"d",adoptionId:"a",trainingVersionId:"t",
        courseVersionId:"c",trainingTitle:"Training",siteOptions:[{id:siteId}],digitalSiteOptions:[]}],
      published:[{id:"release-1",siteId,title:"Digital Skills",status:"published"}],
    } as unknown as LaunchReadinessNoncredit;
    const html = renderToStaticMarkup(<>
      <ProgramRequirementsReadinessV61 programs={{state:"ready",value:programs}}/>
      <SitePublicationReadinessV61 publication={{state:"ready",value:publication}}/>
      <NoncreditPublisherReadinessV61 siteId={siteId} noncredit={{state:"ready",value:noncredit}}/>
    </>);
    expect(html).toContain("1 required step not complete");
    expect(html).toContain("Safeguarding");
    expect(html).toContain("Published · check that your website is live");
    expect(html).toContain("academy.example");
    expect(html).toContain("1 possible offering");
    expect(html).toContain("1 registration listing");
    expect(html).toContain("Capacity, permissions");
  });
});
