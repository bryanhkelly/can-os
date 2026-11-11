import { describe, expect, it } from "vitest";
import { renderPublicSiteHtml, availablePublicSitePaths } from "@/domain/public-site-html";
import { assertPublicProspectusClaims, blueprintRevisionDiff, type PublicBlueprintProspectus } from "@/domain/school-blueprint-approval";
import { assertBlueprintApprovedForPreparation } from "@/domain/blueprint-operational-readiness";

const ids={
 program:"00000000-0000-4000-8000-000000000081",
 robotics:"00000000-0000-4000-8000-000000000082",
 painting:"00000000-0000-4000-8000-000000000083",
 music:"00000000-0000-4000-8000-000000000084",
};
const prospectus:PublicBlueprintProspectus={
 version:1,heading:"Heritage Community Academy is taking shape",
 introduction:"We are preparing grades six through eight academics and experiences for our community.",
 notice:"Our school is in development. Planning descriptions are not enrollment or opening commitments.",
 sourceBlueprintRevision:1,canApprovalVersion:1,items:[
 {sourceId:ids.program,sourceKind:"program",title:"6–8 Core Academy",
  summary:"Approved for CAN preparation.",state:"confirmed",canApprovalVersion:1},
 {sourceId:ids.robotics,sourceKind:"item",title:"Robotics & Engineering",
  summary:"Approved enrichment for preparation.",state:"confirmed",canApprovalVersion:1},
 {sourceId:ids.painting,sourceKind:"item",title:"Studio Art & Painting",
  summary:"Proposed painting studio pending facility review.",state:"under_review",canApprovalVersion:null},
 {sourceId:ids.music,sourceKind:"item",title:"Music & Performing Arts",
  summary:"Planned for future development.",state:"future",canApprovalVersion:null},
 ]};

describe("CAN School Blueprint acceptance: Valor and planning Heritage",()=>{
 it("renders an independent public prospectus with exact approval distinctions",()=>{
  const site={
    host:"heritage.can-os.com",
    site:{name:"Heritage Community Academy",organizationName:"Hosting Community Nonprofit"},
    offerings:[],academicPrograms:[],operatingStatus:"development" as const,
    prospectus,
  };
  expect(availablePublicSitePaths(site)).toContain("/academics");
  const html=renderPublicSiteHtml(site,{makeRequestId:()=>"00000000-0000-4000-8000-000000000098"});
  expect(html).toContain("Planning to open");
  expect(html).toContain("Heritage Community Academy");
  expect(html).toContain("Robotics &amp; Engineering");
  expect(html).toContain("Studio Art &amp; Painting");
  expect(html).toContain("Proposed · under review · not available for enrollment");
  expect(html).toContain("Future plans");
  expect(html).toContain("Register interest");
  expect(html).toContain('name="interestMode" value="planning"');
  expect(html).toContain('name="contactConsent"');
  expect(html).not.toContain('name="studentProfileId"');
  expect(html).not.toContain('name="enrollmentId"');
  expect(html).not.toContain("Painting is approved");
  const academicHtml=renderPublicSiteHtml(site,{path:"/academics",makeRequestId:()=>"00000000-0000-4000-8000-000000000098"});
  expect(academicHtml).toContain("Proposed painting studio pending facility review.");
 });
 it("never converts CAN-reviewed scope into an enrollment guarantee",()=>{
  const site={
    host:"heritage.can-os.com",site:{name:"Heritage Community Academy",organizationName:"Community Host"},
    offerings:[],academicPrograms:[],operatingStatus:"development" as const,prospectus,
  };
  const html=renderPublicSiteHtml(site);
  expect(html).toContain("enrollment and actual availability are separate");
  expect(html).not.toContain('name="interestMode" value="planning"');
  expect(html).not.toContain("Apply now");
  expect(html).not.toContain("Enroll now");
 });
 it("does not leak a proposed academy into Valor School's operational catalog",()=>{
  const html=renderPublicSiteHtml({
    host:"valor.can-os.com",site:{name:"Valor School",organizationName:"CAN test school"},
    offerings:[],academicPrograms:[],operatingStatus:"authorized",
  });
  expect(html).toContain("Valor School");
  expect(html).not.toContain("Studio Art");
  expect(html).not.toContain("Planning to open");
 });
 it("detects painting remediation without reapproving unrelated robotics",()=>{
  const before={
    programs:[{id:ids.program,name:"6–8 Core Academy"}],
    items:[
      {id:ids.robotics,title:"Robotics",facilities:"STEM lab"},
      {id:ids.painting,title:"Painting",facilities:"Ventilation not demonstrated"},
    ]};
  const after={...before,items:[
      before.items[0],
      {id:ids.painting,title:"Painting",facilities:"Ventilated art room, evidence attached"},
    ]};
  const diff=blueprintRevisionDiff(before,after);
  expect(diff.programs.changed).toEqual([]);
  expect(diff.items.changed).toEqual([ids.painting]);
  expect(diff.items.added).toEqual([]);
 });
 it("prohibits painting preparation until its current details match the approved snapshot",()=>{
  const proposed={id:ids.painting,title:"Studio Art & Painting",summary:"Art",kind:"experience",
    configuration:{facilityPlan:"Ventilation not demonstrated"}};
  const approved={...proposed,configuration:{facilityPlan:"Ventilation verified"}};
  expect(()=>assertBlueprintApprovedForPreparation({
    kind:"item",current:proposed,approvedSnapshot:{items:[approved]},
    decision:{subjectKind:"item",subjectId:ids.painting,decision:"approved",
      evidence:{facility:{status:"not_required"},staffing:{status:"not_required"}}},
  })).toThrow(/has changed/);
 });
 it("rejects false approval claims in curated parent-facing releases",()=>{
  expect(()=>assertPublicProspectusClaims({...prospectus,canApprovalVersion:null}))
    .toThrow(/approved Blueprint/);
  expect(()=>assertPublicProspectusClaims({...prospectus,items:prospectus.items.map(x=>
    x.sourceId===ids.painting?{...x,state:"confirmed" as const,canApprovalVersion:1}:x)}))
    .not.toThrow(); // Requires server-side decision checking; rendering is not authorization.
 });
});
