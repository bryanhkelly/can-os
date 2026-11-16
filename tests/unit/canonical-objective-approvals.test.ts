import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import {
  recordObjectiveReviewInput,canonicalAssessmentApprovalRole,
  objectiveApprovalGate,type AssessmentReviewDecision,
} from "@/domain/canonical-objective-review";
const org="11110000-0000-4000-8000-000000000001";
const a="11110000-0000-4000-8000-000000000010";
const b="11110000-0000-4000-8000-000000000011";
const author="11110000-0000-4000-8000-000000000012";
const reviewer="11110000-0000-4000-8000-000000000013";
const reviewerRow=(kind:string,order=1):AssessmentReviewDecision=>({
  kind,decision:"approved",reviewerPersonId:reviewer,order,
});
const common=["academic","rights","accessibility"];
const makeRows=()=>({
  items:[{id:a,authorPersonId:author},{id:b,authorPersonId:author}],
  assessmentReviews:[...common,"independent"].map(k=>reviewerRow(k)),
  formReviews:common.map(k=>reviewerRow(k)),
  itemReviews:[...common.map(kind=>({...reviewerRow(kind),itemVersionId:a})),
    ...common.map(kind=>({...reviewerRow(kind),itemVersionId:b}))],
});
const read=(path:string)=>readFileSync(path,"utf8");
describe("canonical independent objective assessment review and atomic publication",()=>{
  it("does not let one item's approvals release other questions",()=>{
    const full=makeRows();
    expect(objectiveApprovalGate(full).ready).toBe(true);
    const onlyA={...full,itemReviews:full.itemReviews.filter(x=>x.itemVersionId===a)};
    const status=objectiveApprovalGate(onlyA);
    expect(status.items.find(x=>x.id===a)?.ready).toBe(true);
    expect(status.items.find(x=>x.id===b)?.ready).toBe(false);
    expect(status.ready).toBe(false);
  });
  it("uses only the latest independent decision per domain",()=>{
    const full=makeRows();
    expect(objectiveApprovalGate({...full,
      itemReviews:[...full.itemReviews,{...reviewerRow("rights",2),
        itemVersionId:b,decision:"rejected"}]}).ready).toBe(false);
    expect(objectiveApprovalGate({...full,
      assessmentReviews:[...full.assessmentReviews,{
        ...reviewerRow("independent",3),reviewerPersonId:author,
      }]}).ready).toBe(false);
    expect(objectiveApprovalGate({...full,
      formReviews:[...full.formReviews,{...reviewerRow("academic",2),
        decision:"rejected"}]}).ready).toBe(false);
  });
  it("disallows self-review regardless of group and empty item sets",()=>{
    const full=makeRows();
    expect(objectiveApprovalGate({...full,
      itemReviews:full.itemReviews.map(x=>({...x,reviewerPersonId:author}))}).ready)
      .toBe(false);
    expect(objectiveApprovalGate({...full,items:[]}).ready).toBe(false);
  });
  it("binds review targets exactly and requires real rationale",()=>{
    const base={
      assessmentVersionId:a,target:"item",itemVersionId:b,
      kind:"academic",decision:"approved",rationale:"I verified every published objective option.",
    };
    expect(recordObjectiveReviewInput.safeParse(base).success).toBe(true);
    expect(recordObjectiveReviewInput.safeParse({...base,itemVersionId:undefined}).success)
      .toBe(false);
    expect(recordObjectiveReviewInput.safeParse({...base,target:"form",
      itemVersionId:undefined,kind:"independent"}).success).toBe(false);
    expect(recordObjectiveReviewInput.safeParse({...base,rationale:"approved"}).success)
      .toBe(false);
  });
  it("requires a single canonical Organization and an independently provisioned role",()=>{
    const staff={scope:{organizationIds:[org]},
      capabilities:new Set(["class.manage"])};
    const reviewerRole=canonicalAssessmentApprovalRole(staff,"assessment_reviewer");
    const publisherRole=canonicalAssessmentApprovalRole(staff,"assessment_publisher");
    expect(reviewerRole).toBe("can_v30_assess_reviewer_11110000000040008000000000000001");
    expect(publisherRole).toBe("can_v30_assess_publisher_11110000000040008000000000000001");
    expect(reviewerRole.length).toBeLessThanOrEqual(63);
    expect(publisherRole.length).toBeLessThanOrEqual(63);
    expect(()=>canonicalAssessmentApprovalRole({
      scope:{organizationIds:[org,org]},capabilities:staff.capabilities},
      "assessment_reviewer")).toThrow();
    expect(()=>canonicalAssessmentApprovalRole({
      scope:{organizationIds:[org]},capabilities:new Set()},
      "assessment_publisher")).toThrow();
  });
  it("keeps existing canonical review records, publication triggers and encrypted key isolation",()=>{
    const patch=read("database/canonical/v3.0.1/patch-canonical-assessment-review-publication.sql");
    const roles=read("database/canonical/v3.0.1/provision-canonical-assessment-approval-roles.sql");
    const service=read("src/modules/classes/canonical-objective-approval.functions.ts");
    const publisher=read("src/routes/canonical.assessment-publications.tsx");
    const reviewerUi=read("src/routes/canonical.assessment-reviews.tsx");
    for(const table of ["assessment_item_review_decisions",
      "assessment_version_review_decisions","assessment_form_review_decisions"]){
      expect(patch).toContain("INSERT INTO "+table);
    }
    expect(patch).toContain("pg_advisory_xact_lock");
    expect(patch).toContain("Missing independent latest item approval");
    expect(patch).toContain("UPDATE assessment_item_versions SET lifecycle='published'");
    expect(patch).toContain("UPDATE assessment_versions SET lifecycle='published'");
    expect(patch).toContain("UPDATE assessment_form_versions SET lifecycle='published'");
    expect(patch).toContain("REVOKE ALL ON FUNCTION");
    expect(roles).toContain("NOLOGIN NOINHERIT NOBYPASSRLS");
    expect(roles).not.toContain("GRANT SELECT ON education_v30.assessment_item_secure_keys");
    expect(roles).not.toContain("GRANT UPDATE ON education_v30.assessment_versions");
    expect(service).toContain("openNoncreditAnswerKey");
    expect(service).toContain("SET LOCAL ROLE");
    expect(service).toContain("CAN_CANONICAL_ASSESSMENT_REVIEW_ENABLED");
    expect(service).toContain("CAN_CANONICAL_ASSESSMENT_PUBLICATION_ENABLED");
    expect(publisher).toContain("objectiveApprovalGate");
    expect(reviewerUi).toContain("Publisher-designated correct answer");
    expect(service).not.toContain("grantNativeClassAssessmentAccess");
    expect(service).not.toContain("recordNativeClassCompletionEvidence");
  });
});
