import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

const source=(path:string)=>readFileSync(path,"utf8");

describe("native Course review and separate Offering adoption governance",()=>{
  it("uses exact publisher Course identities and current appointed author/reviewer capability",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    expect(service).toContain("canonicalOfferingCourses");
    expect(service).toContain("assertTrackProvider(tx,actor");
    expect(service).toContain('"instructional_track.author"');
    expect(service).toContain('"instructional_track.review"');
    expect(service).toContain('"instructional_track.publish"');
    expect(service).toContain("contentManifestReviewDecisions");
    expect(service).toContain("manifest.manifestHash!==bundle.hash");
    expect(service).toContain("manifest.createdByPersonId===actor.actorPersonId");
    expect(service).toContain("requireApprovedSnapshot(tx,manifest)");
  });
  it("publishes Courses without bypassing the database's real-asset manifest gate",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    const coursePublish=service.split("export const publishNativeOfferingCourses=")[1]
      ?.split("export const publishNativeOfferingVersion=")[0];
    expect(coursePublish).toBeDefined();
    expect(coursePublish).toContain('lifecycle:"published"');
    expect(coursePublish).not.toContain('set({manifestStatus:"approved"})');
    expect(service).toContain("separately approved asset-bearing publication manifest");
    expect(service).toContain("explicitly reviewed Offering release policy");
    expect(service).toContain("education_v30.offering_release_requirements");
  });
  it("requires independent canonical Blueprint and current readiness before adoption",()=>{
    const service=source("src/modules/programs/native-offering-adoption-review.functions.ts");
    expect(service).toContain('actor.role!=="blueprint_reviewer"');
    expect(service).toContain('assertCapability(actor,"blueprint.review")');
    expect(service).toContain("revalidateReviewer(tx,request,actor)");
    expect(service).toContain('eq(blueprintExecutionBatches.executionStatus,"executed")');
    expect(service).toContain('latestReview.decision!=="approved"');
    expect(service).toContain('eq(auditEvents.entityId,configuration.id)');
    expect(service).toContain('["operating","registration","delivery"]');
    expect(service).toContain('approvalStatus:"approved"');
    expect(service).not.toContain('status:"active"');
  });
  it("renders author, publisher reviewer, and local adoption reviewer separately",()=>{
    const editor=source("src/components/learning/NativeCourseDraftEditor.tsx");
    const publisher=source("src/components/learning/ProviderInstructionReviews.tsx");
    const local=source("src/routes/canonical.blueprints.tsx");
    expect(editor).toContain("submitNativeOfferingRelease");
    expect(publisher).toContain("<NativeOfferingReleaseReviewPanel/>");
    expect(local).toContain("<NativeOfferingAdoptionReviewPanel/>");
  });
});
