import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import {
  adoptionPreviewAllowsAttempt,nativeAdoptionReviewKinds,
  type NativeAdoptionEvidencePreview,
} from "@/domain/native-adoption-readiness";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const base:NativeAdoptionEvidencePreview={
  lifecycle:"published",offeringStatus:"active",
  publishedAt:"2026-11-17T20:30:00Z",blueprintExecutionRecorded:true,
  evidencePreviewLimited:false,
  readiness:nativeAdoptionReviewKinds.map(kind=>({kind,recordedReady:true})),
};

describe("native Offering adoption upstream evidence preview",()=>{
  it("allows an attempted independent review only with complete visible prerequisite records",()=>{
    expect(adoptionPreviewAllowsAttempt(base)).toBe(true);
    expect(adoptionPreviewAllowsAttempt({...base,lifecycle:"draft"})).toBe(false);
    expect(adoptionPreviewAllowsAttempt({...base,publishedAt:null})).toBe(false);
    expect(adoptionPreviewAllowsAttempt({...base,offeringStatus:"suspended"})).toBe(false);
    expect(adoptionPreviewAllowsAttempt({...base,blueprintExecutionRecorded:false})).toBe(false);
    expect(adoptionPreviewAllowsAttempt({...base,evidencePreviewLimited:true})).toBe(false);
  });

  it("fails closed for each absent, expired or incomplete readiness category",()=>{
    for(const missing of nativeAdoptionReviewKinds){
      expect(adoptionPreviewAllowsAttempt({...base,
        readiness:base.readiness.filter(row=>row.kind!==missing)})).toBe(false);
      expect(adoptionPreviewAllowsAttempt({...base,
        readiness:base.readiness.map(row=>row.kind===missing
          ?{...row,recordedReady:false}:row)})).toBe(false);
    }
  });

  it("does not treat a recorded review or Blueprint as verified approval",()=>{
    const component=read("src/components/launch-studio/NativeAdoptionEvidenceChecklist.tsx");
    const server=read("src/modules/programs/native-offering-adoption-review.functions.ts");
    const ui=read("src/components/launch-studio/NativeOfferingAdoptionReviewPanel.tsx");
    expect(component).toContain("<StatusBadge");
    expect(component).toContain("A visible execution or readiness record does not mean approval");
    expect(component).toContain("!state.evidencePreviewLimited&&item.recorded");
    expect(server).toContain("getNativeOfferingAdoptionReviewQueue");
    expect(server).toContain("blueprintExecutionRecorded:!evidenceLimited");
    expect(server).toContain("readiness:reviewStates");
    expect(server).toContain("nativeAdoptionReviewKinds.map");
    expect(server).toContain("for(const kind of nativeAdoptionReviewKinds)");
    expect(server).toContain("inArray(blueprintConfigurationOfferingIntents.offeringVersionId");
    expect(ui).toContain("adoptionPreviewAllowsAttempt(item)");
    expect(ui).toContain("<NativeAdoptionEvidenceChecklist state={item}/>");
    expect(ui).toContain("disabled={!prerequisitesVisible");
    // Authorization remains independent of presentation and must revalidate
    // inside a locked transaction, with real evidence and current grants.
    expect(server).toContain("revalidateReviewer(tx,request,actor)");
    expect(server).toContain("await verifiedEvidence(tx,data.evidenceVersionId)");
    expect(server).toContain("await tx.update(deploymentOfferingAdoptions)");
  });
});
