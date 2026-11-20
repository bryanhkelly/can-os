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
    expect(service).toContain("manifest.manifestHash!==await currentReleaseSnapshotHash");
    expect(service).toContain("manifest.createdByPersonId===actor.actorPersonId");
    expect(service).toContain("requireApprovedSnapshot(tx,manifest,bundle)");
  });
  it("publishes Courses without bypassing the database's real-asset manifest gate",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    const coursePublish=service.split("export const publishNativeOfferingCourses=")[1]
      ?.split("export const publishNativeOfferingVersion=")[0];
    expect(coursePublish).toBeDefined();
    expect(coursePublish).toContain('lifecycle:"published"');
    expect(coursePublish).not.toContain('set({manifestStatus:"approved"})');
    expect(service).toContain("separately approved asset-bearing publication manifest");
    expect(service).toContain("requireAuditedReleasePolicy");
    expect(service).toContain("assertNativeOfferingDistributionReady");
    expect(service).toContain("assertNativeReleaseAssetEvidence");
  });
  it("binds publisher-owned immutable assets, rights proofs and exact review snapshot",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    const evidence=source("src/modules/learning/native-offering-release-evidence.server.ts");
    expect(service).toContain("prepareNativeReleaseAssetItems");
    expect(service).toContain("nativeReleaseSnapshotHash(bundle.hash,policies,items)");
    expect(service).toContain("currentReleaseSnapshotHash");
    expect(service).toContain("contentPublicationManifestItems");
    expect(service).toContain("approveNativeOfferingAssetManifest");
    expect(service).toContain('manifestStatus:"approved"');
    expect(evidence).toContain("assertInstructionalTrackAssetsEligible(tx,ids)");
    expect(evidence).toContain("contentAssets.ownerOrganizationId,organizationId");
    expect(evidence).toContain("contentWithdrawals.effectiveAt,at");
    expect(evidence).toContain("rightsEvidenceVersionId");
    expect(evidence).toContain("latest.reviewerPersonId===manuscriptAuthorPersonId");
    expect(evidence).toContain("rightsAuthorizedIds.has(id)");
    expect(evidence).toContain("currentRights");
    expect(evidence).toContain("row.contentHash!==items[i]?.contentHash");
  });
  it("requires explicit independently reviewed full release policy and actual track coverage",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    const evidence=source("src/modules/learning/native-offering-release-evidence.server.ts");
    expect(service).toContain("getNativeOfferingReleasePolicyReview");
    expect(service).toContain("saveNativeOfferingReleasePolicy");
    expect(service).toContain("expectedPolicyRevision");
    expect(service).toContain("requireAuditedReleasePolicy");
    expect(service).toContain('eq(auditEvents.eventCode,"NativeOfferingReleasePolicyReviewed")');
    expect(service).toContain("event.payload.manuscriptHash===bundle.hash");
    expect(service).toContain("event.actorPersonId!==authorPersonId");
    expect(service).toContain("policyRevision(previous)!==data.expectedPolicyRevision");
    expect(service).toContain('NativeOfferingReleasePolicyReviewed');
    expect(service).toContain('requireVerifiedEvidence(tx,data.reviewEvidenceVersionId,"academic")');
    expect(evidence).toContain("requireCompleteReleasePolicies");
    expect(evidence).toContain("nativeReleasePolicySchema.safeParse(row)");
    expect(evidence).toContain("trackDistributionAuthorizations.status");
    expect(evidence).toContain('eq(instructionalTrackVersions.trackKind,"primary")');
    expect(evidence).toContain("byTrack.get(id)?.has(lesson.id)");
    expect(evidence).toContain("Withdrawn primary tracks");
    expect(service).not.toContain("minimum_approved_primary_tracks>0 OR complete_lesson_coverage_required");
  });
  it("separates manuscript publication from asset-manifest and Offering approval",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    const courseBlock=service.split("export const publishNativeOfferingCourses=")[1]
      ?.split("export const approveNativeOfferingAssetManifest=")[0]??"";
    const assetBlock=service.split("export const approveNativeOfferingAssetManifest=")[1]
      ?.split("export const publishNativeOfferingVersion=")[0]??"";
    expect(courseBlock).toContain('lifecycle:"published"');
    expect(courseBlock).not.toContain('manifestStatus:"approved"');
    expect(assetBlock).toContain("readNativeReleaseManifestItems");
    expect(assetBlock).toContain("requireApprovedSnapshot");
    expect(assetBlock).toContain("assertNativeReleaseAssetEvidence");
    expect(assetBlock).toContain('manifestStatus:"approved"');
  });
  it("exposes the existing 6.1 author and reviewer workflows with policy and asset gates",()=>{
    const creator=source("src/components/learning/NativeCourseDraftEditor.tsx");
    const reviewer=source("src/components/learning/NativeOfferingReleaseReviewPanel.tsx");
    const policy=source("src/components/learning/NativeOfferingReleasePolicyEditor.tsx");
    expect(creator).toContain("assetUses");
    expect(creator).toContain("sameSelection");
    expect(creator).toContain("manifest.assetUses");
    expect(creator).toContain("releasePoliciesComplete");
    expect(creator).toContain("submitNativeOfferingRelease");
    expect(reviewer).toContain("Inspect exact submitted Course material");
    expect(reviewer).toContain("Pinned publisher asset versions");
    expect(reviewer).toContain("approveNativeOfferingAssetManifest");
    expect(reviewer).toContain("item.status!==\"approved\"");
    expect(policy).toContain("saveNativeOfferingReleasePolicy");
    expect(policy).toContain("reviewEvidenceVersionId");
    expect(policy).toContain("expectedPolicyRevision");
  });

  it("rejects asset-backed submission downgrades even when the client bypasses its guard",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    const submit=service.split("export const submitNativeOfferingRelease=")[1]
      ?.split("export const getNativeOfferingReleasePolicyReview=")[0]??"";
    expect(submit).toContain("if(previous&&!items.length&&");
    expect(submit).toContain("readNativeReleaseManifestItems(tx,previous.id)");
    expect(submit).toContain("An asset-backed release cannot be downgraded");
    expect(submit).toContain("manifestHash===snapshotHash");
  });
  it("prevents active reviewers from approving Courses they previously edited",()=>{
    const service=source("src/modules/learning/native-offering-release.functions.ts");
    expect(service).toContain('import { auditEvents as platformAuditEvents } from "@/db/schema"');
    expect(service).toContain('"curriculum.native_draft_lesson.save"');
    expect(service).toContain('eq(platformAuditEvents.resourceType,"course_lesson")');
    expect(service).toContain("inArray(platformAuditEvents.resourceId,lessonIds)");
    expect(service).toContain("reviewerPersonIds.has(change.actorPersonId)");
    expect(service).toContain("requireIndependentNativeCourseReview(tx,bundle,");
    expect(service).toContain("await requireApprovedSnapshot(tx,manifest,bundle)");
  });
  it("uses reusable 6.1 release checkpoints and reliable mutation/refresh feedback",()=>{
    const author=source("src/components/learning/NativeCourseDraftEditor.tsx");
    const reviewer=source("src/components/learning/NativeOfferingReleaseReviewPanel.tsx");
    const policy=source("src/components/learning/NativeOfferingReleasePolicyEditor.tsx");
    const component=source("src/components/learning/NativeOfferingReleaseCheckpoints.tsx");
    const creatorHome=source("src/components/learning/ProviderInstructionHome.tsx");
    const reviewerHome=source("src/components/learning/ProviderInstructionReviews.tsx");
    for(const sourceCode of [author,reviewer,policy]){
      expect(sourceCode).toContain("useMutationFeedback");
      expect(sourceCode).toContain("<MutationFeedback");
    }
    expect(author).toContain("<NativeOfferingReleaseCheckpoints");
    expect(reviewer).toContain("<NativeOfferingReleaseCheckpoints");
    expect(component).toContain("projectNativeReleaseCheckpoints");
    expect(component).toContain("<StatusBadge");
    expect(component).toContain("Class enrollment");
    expect(creatorHome).toContain("<EmptyState");
    expect(reviewerHome).toContain("<EmptyState");
    expect(reviewerHome).toContain("<StatusBadge");
  });

  it("requires independent canonical Blueprint and current readiness before adoption",()=>{
    const service=source("src/modules/programs/native-offering-adoption-review.functions.ts");
    expect(service).toContain('actor.role!=="blueprint_reviewer"');
    expect(service).toContain('assertCapability(actor,"blueprint.review")');
    expect(service).toContain("revalidateReviewer(tx,request,actor)");
    expect(service).toContain('eq(blueprintExecutionBatches.executionStatus,"executed")');
    expect(service).toContain('latestReview.decision!=="approved"');
    expect(service).toContain('eq(sharedAuditEvents.resourceId,configuration.id)');
    expect(service).toContain("for(const kind of nativeAdoptionReviewKinds)");
    expect(service).toContain('approvalStatus:"approved"');
    expect(service).not.toContain('status:"active"');
  });
  it("fails closed on main-only reviewer appointment and Person cutover evidence",()=>{
    const probe=source("scripts/acceptance/check-main-native-course-release.mjs");
    expect(probe).toContain("CAN_MAIN_NATIVE_RELEASE_CHECK");
    expect(probe).toContain('const MAIN="br-restless-sea-ar9ooo55"');
    expect(probe).toContain("Refusing any database other than the verified CAN OS Neon main.");
    expect(probe).toContain("legacy_provider_person_fks");
    expect(probe).toContain("independentReviewerAvailable");
    expect(probe).toContain("DATA_PREFLIGHT_ONLY");
    expect(probe).not.toContain("INSERT INTO");
    expect(probe).not.toContain("ALTER TABLE");
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
