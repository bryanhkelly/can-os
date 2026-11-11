import { describe, it, expect } from "vitest";
import { assertBlueprintApprovedForPreparation, blueprintOperationalProgramType,
 validateBlueprintEvidenceReview } from "@/domain/blueprint-operational-readiness";

const painting={id:"painting",kind:"experience",title:"Studio Art & Painting",
 summary:"A weekly art studio",programPlanId:null,catalogVersionId:null,
 configuration:{ventilation:"not_verified",facility:"art room",staffing:"qualified art facilitator"}};
const approvedPainting={...painting,configuration:{...painting.configuration,ventilation:"verified"}};
const verified={facility:{status:"verified",documentId:"facility-evidence"},
 staffing:{status:"verified",documentId:"staff-evidence"}};
const decision={subjectKind:"item" as const,subjectId:"painting",decision:"approved" as const,evidence:verified};

describe("School Blueprint operational promotion",()=>{
 it("does not treat the school vision as authorization",()=>{
  expect(()=>assertBlueprintApprovedForPreparation({kind:"item",current:painting,
    approvedSnapshot:{items:[painting]},decision:undefined})).toThrow(/not in/);
 });
 it("holds the painting experience until facility remediation has been reviewed",()=>{
  expect(()=>assertBlueprintApprovedForPreparation({kind:"item",current:painting,
    approvedSnapshot:{items:[approvedPainting]},decision})).toThrow(/has changed/);
 });
 it("permits approved robotics independently of unapproved painting",()=>{
  const robot={...painting,id:"robotics",title:"Robotics & Engineering"};
  expect(()=>assertBlueprintApprovedForPreparation({kind:"item",current:robot,
    approvedSnapshot:{items:[robot,painting]},decision:{...decision,subjectId:"robotics"}})).not.toThrow();
  expect(()=>assertBlueprintApprovedForPreparation({kind:"item",current:painting,
    approvedSnapshot:{items:[robot,painting]},decision:{...decision,decision:"changes_required"}})).toThrow(/not in/);
 });
 it("rejects unsupported or expired approvals",()=>{
  expect(()=>assertBlueprintApprovedForPreparation({kind:"item",current:painting,
    approvedSnapshot:{items:[painting]},decision:{...decision,effectiveThrough:"2026-01-01"},now:"2026-11-11"})).toThrow(/effective dates/);
 });
 it("requires independent facility and staffing evidence review",()=>{
  expect(()=>validateBlueprintEvidenceReview({})).toThrow(/explicitly/);
  expect(()=>validateBlueprintEvidenceReview({facility:{status:"verified"},staffing:{status:"not_required"}}))
    .toThrow(/document evidence/);
  expect(validateBlueprintEvidenceReview(verified).facility.status).toBe("verified");
 });
 it("does not invent credit-bearing types for unsupported reference programs",()=>{
  expect(blueprintOperationalProgramType("middle_school_6_8")).toBe("hosted_academy");
  expect(blueprintOperationalProgramType("after_school")).toBe("after_school_enrichment");
  expect(blueprintOperationalProgramType("saturday_academy")).toBeNull();
 });
});
