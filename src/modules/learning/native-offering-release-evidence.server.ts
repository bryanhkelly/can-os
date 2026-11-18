import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, gt, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalOfferingCourses, contentAssets, contentAssetVersions,
  contentPublicationManifestItems, contentWithdrawals, courseLessons,
  courseVersions, instructionalTrackVersions, offeringReleaseRequirements,
  trackDistributionAuthorizations, trackLessonPresentations,
} from "@/db/canonical-v301";
import { DomainError } from "@/domain/errors";
import { assertInstructionalTrackAssetsEligible } from
  "@/modules/learning/instructional-track-authoring.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const invalid=(message:string):never=>{throw new DomainError("VALIDATION_FAILED",message);};
export const nativeReleaseAssetSchema=z.object({
  assetVersionId:uuid,
  usageKind:z.enum(["required_instruction","supporting","accessibility","assessment"]),
}).strict();
export const nativeReleasePolicySchema=z.object({
  courseVersionId:uuid,
  minimumApprovedPrimaryTracks:z.number().int().min(0).max(10),
  completeLessonCoverageRequired:z.boolean(),
  independentAcademicReviewRequired:z.literal(true),
  rightsClearanceRequired:z.literal(true),
  accessibilityReviewRequired:z.literal(true),
}).strict();
export type NativeReleaseAsset=z.infer<typeof nativeReleaseAssetSchema>;
export type NativeReleasePolicy={
  courseVersionId:string;
  minimumApprovedPrimaryTracks:number;
  completeLessonCoverageRequired:boolean;
  independentAcademicReviewRequired:boolean;
  rightsClearanceRequired:boolean;
  accessibilityReviewRequired:boolean;
};
export type AssetEvidenceRow={
  assetVersionId:string,usageKind:NativeReleaseAsset["usageKind"],
  contentHash:string,rightsEvidenceVersionId:string|null,
};

function digest(input:unknown):string{
  const string=JSON.stringify(input,(_key,value:unknown)=>
    value&&typeof value==="object"&&!Array.isArray(value)
      ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)))
      :value);
  return createHash("sha256").update(string??"").digest("hex");
}
function orderedAssets(items:readonly AssetEvidenceRow[]):AssetEvidenceRow[]{
  return [...items].sort((a,b)=>
    (a.assetVersionId+":"+a.usageKind).localeCompare(b.assetVersionId+":"+b.usageKind));
}
export async function readNativeReleasePolicies(tx:Tx,offeringVersionId:string){
  return tx.select({
    courseVersionId:offeringReleaseRequirements.courseVersionId,
    minimumApprovedPrimaryTracks:offeringReleaseRequirements.minimumApprovedPrimaryTracks,
    completeLessonCoverageRequired:offeringReleaseRequirements.completeLessonCoverageRequired,
    independentAcademicReviewRequired:offeringReleaseRequirements.independentAcademicReviewRequired,
    rightsClearanceRequired:offeringReleaseRequirements.rightsClearanceRequired,
    accessibilityReviewRequired:offeringReleaseRequirements.accessibilityReviewRequired,
  }).from(offeringReleaseRequirements)
    .where(eq(offeringReleaseRequirements.offeringVersionId,offeringVersionId))
    .orderBy(asc(offeringReleaseRequirements.courseVersionId)).limit(51);
}
export function policyRevision(rows:readonly NativeReleasePolicy[]){
  return digest(rows.map(({courseVersionId,minimumApprovedPrimaryTracks,
    completeLessonCoverageRequired,independentAcademicReviewRequired,
    rightsClearanceRequired,accessibilityReviewRequired})=>({
      courseVersionId,minimumApprovedPrimaryTracks,completeLessonCoverageRequired,
      independentAcademicReviewRequired,rightsClearanceRequired,accessibilityReviewRequired,
    })).sort((a,b)=>a.courseVersionId.localeCompare(b.courseVersionId)));
}
export function requireCompleteReleasePolicies(
  rows:readonly NativeReleasePolicy[],
  expectedCourseIds:readonly string[],
):void{
  if(!expectedCourseIds.length||rows.length!==expectedCourseIds.length||
    new Set(rows.map(row=>row.courseVersionId)).size!==rows.length||
    rows.some(row=>!expectedCourseIds.includes(row.courseVersionId)))
    invalid("Declare an explicit release policy for every Course in this Offering.");
  for(const row of rows){
    if(!nativeReleasePolicySchema.safeParse(row).success)
      invalid("Every native release policy must retain independent academic, rights and accessibility review.");
    if(row.completeLessonCoverageRequired&&row.minimumApprovedPrimaryTracks<1)
      invalid("Complete recorded lesson coverage requires at least one approved primary track.");
  }
}
export async function readNativeReleaseManifestItems(tx:Tx,manifestId:string):Promise<AssetEvidenceRow[]>{
  const rows=await tx.select({
    assetVersionId:contentPublicationManifestItems.contentAssetVersionId,
    usageKind:contentPublicationManifestItems.usageKind,
    contentHash:contentPublicationManifestItems.contentHash,
    rightsEvidenceVersionId:contentPublicationManifestItems.rightsEvidenceVersionId,
  }).from(contentPublicationManifestItems)
    .where(eq(contentPublicationManifestItems.manifestId,manifestId))
    .orderBy(asc(contentPublicationManifestItems.contentAssetVersionId),
      asc(contentPublicationManifestItems.usageKind)).limit(51);
  if(rows.length>50)invalid("A publication manifest cannot exceed 50 reviewed asset uses.");
  return orderedAssets(rows);
}

/** Snapshot signatures include the reviewed manuscript, every policy, and
 * every immutable asset/version hash. A later policy edit or manifest-item
 * edit invalidates the exact-version review rather than silently inheriting it.
 * Manuscript-only submissions remain independent of media production. */
export function nativeReleaseSnapshotHash(
  manuscriptHash:string,policies:readonly NativeReleasePolicy[],
  items:readonly AssetEvidenceRow[],
):string{
  if(!items.length)return manuscriptHash;
  return digest({
    manuscriptHash,
    policies:[...policies].sort((a,b)=>a.courseVersionId.localeCompare(b.courseVersionId)),
    assets:orderedAssets(items),
  });
}

export async function currentReleaseSnapshotHash(
  tx:Tx,offeringVersionId:string,manuscriptHash:string,manifestId:string,
){
  const items=await readNativeReleaseManifestItems(tx,manifestId);
  if(!items.length)return manuscriptHash;
  const policies=await readNativeReleasePolicies(tx,offeringVersionId);
  return nativeReleaseSnapshotHash(manuscriptHash,policies,items);
}

/** Reuses the same verified immutable-asset checks as recorded instructor
 * publication. A publisher cannot borrow another organization's content
 * merely by knowing its UUID or bypass a revoked license. */
export async function prepareNativeReleaseAssetItems(
  tx:Tx,organizationId:string,requested:readonly NativeReleaseAsset[],
):Promise<AssetEvidenceRow[]>{
  if(!requested.length||requested.length>50||
    new Set(requested.map(item=>item.assetVersionId+":"+item.usageKind)).size!==requested.length)
    invalid("Select 1 to 50 distinct asset/version usages for the Offering.");
  const ids=[...new Set(requested.map(item=>item.assetVersionId))];
  const owned=await tx.select({
    id:contentAssetVersions.id,
  }).from(contentAssetVersions)
    .innerJoin(contentAssets,eq(contentAssets.id,contentAssetVersions.assetId))
    .where(and(inArray(contentAssetVersions.id,ids),
      eq(contentAssets.ownerOrganizationId,organizationId))).limit(51);
  if(owned.length!==ids.length)
    invalid("Every published release asset must belong to the Course publisher.");
  const at=new Date();
  const revoked=await tx.select({id:contentWithdrawals.assetVersionId})
    .from(contentWithdrawals)
    .where(and(inArray(contentWithdrawals.assetVersionId,ids),
      lte(contentWithdrawals.effectiveAt,at))).limit(1);
  if(revoked.length)
    invalid("A selected publisher asset has been withdrawn.");
  const validated=await assertInstructionalTrackAssetsEligible(tx,ids);
  return orderedAssets(requested.map(item=>{
    const verified=validated.get(item.assetVersionId);
    if(!verified)invalid("Every asset needs current independent academic, rights and accessibility approval.");
    return {
      assetVersionId:item.assetVersionId,usageKind:item.usageKind,
      contentHash:verified.sha256,
      rightsEvidenceVersionId:verified.rightsEvidenceVersionId,
    };
  }));
}

export async function assertNativeReleaseAssetEvidence(
  tx:Tx,organizationId:string,items:readonly AssetEvidenceRow[],
):Promise<void>{
  if(!items.length)invalid("Offering publication requires real, independently approved immutable assets.");
  const validated=await prepareNativeReleaseAssetItems(tx,organizationId,
    items.map(({assetVersionId,usageKind})=>({assetVersionId,usageKind})));
  if(validated.length!==items.length||validated.some((row,i)=>
    row.assetVersionId!==items[i]?.assetVersionId||
    row.usageKind!==items[i]?.usageKind||
    row.contentHash!==items[i]?.contentHash||
    row.rightsEvidenceVersionId!==items[i]?.rightsEvidenceVersionId))
    invalid("Asset rights, fingerprints or verified review evidence changed. Create a new release manifest.");
}

/** Executed before Offering release, supplementing the DB trigger.
 * Requirements may demand one or more distributed published primary tracks
 * and complete lesson coverage; we never reinterpret missing as zero. */
export async function assertNativeOfferingDistributionReady(
  tx:Tx,offeringVersionId:string,offeringId:string,
  policies:readonly NativeReleasePolicy[],
):Promise<void>{
  const expected=await tx.select({
    courseVersionId:canonicalOfferingCourses.courseVersionId,
    required:canonicalOfferingCourses.isRequired,
  }).from(canonicalOfferingCourses)
    .where(eq(canonicalOfferingCourses.offeringVersionId,offeringVersionId))
    .limit(51);
  if(expected.length>50)invalid("Offering composition is beyond review limits.");
  requireCompleteReleasePolicies(policies,expected.map(row=>row.courseVersionId));
  const now=new Date();
  for(const policy of policies){
    if(!policy.minimumApprovedPrimaryTracks&&!policy.completeLessonCoverageRequired)
      continue;
    const versions=await tx.select({
      id:instructionalTrackVersions.id,
    }).from(instructionalTrackVersions)
      .innerJoin(trackDistributionAuthorizations,and(
        eq(trackDistributionAuthorizations.trackVersionId,instructionalTrackVersions.id),
        eq(trackDistributionAuthorizations.approvedOfferingId,offeringId),
        eq(trackDistributionAuthorizations.status,"approved"),
        lte(trackDistributionAuthorizations.validFrom,now),
        or(isNull(trackDistributionAuthorizations.validThrough),
          gt(trackDistributionAuthorizations.validThrough,now)),
      ))
      .where(and(
        eq(instructionalTrackVersions.courseVersionId,policy.courseVersionId),
        eq(instructionalTrackVersions.trackKind,"primary"),
        eq(instructionalTrackVersions.lifecycle,"published"),
      )).limit(51);
    if(versions.length>50)invalid("Too many approved primary tracks to verify safely.");
    const unique=[...new Set(versions.map(row=>row.id))];
    if(unique.length<policy.minimumApprovedPrimaryTracks)
      invalid("This Course requires more published, approved primary recorded-instruction tracks.");
    const withdrawn=unique.length?await tx.select({
      trackVersionId:contentWithdrawals.trackVersionId,
    }).from(contentWithdrawals)
      .where(and(inArray(contentWithdrawals.trackVersionId,unique),
        lte(contentWithdrawals.effectiveAt,now))):[];
    const withdrawnIds=new Set(withdrawn.map(row=>row.trackVersionId));
    const available=unique.filter(id=>!withdrawnIds.has(id));
    if(available.length<policy.minimumApprovedPrimaryTracks)
      invalid("Withdrawn primary tracks cannot satisfy Offering release requirements.");
    if(policy.completeLessonCoverageRequired){
      const lessons=await tx.select({id:courseLessons.id}).from(courseLessons)
        .where(eq(courseLessons.courseVersionId,policy.courseVersionId)).limit(2001);
      if(!lessons.length||lessons.length>2000)
        invalid("The complete Course lesson inventory is unavailable for coverage verification.");
      const covered=await tx.select({
        trackVersionId:trackLessonPresentations.trackVersionId,
        lessonId:trackLessonPresentations.courseLessonId,
      }).from(trackLessonPresentations)
        .where(and(inArray(trackLessonPresentations.trackVersionId,available),
          eq(trackLessonPresentations.presentationKind,"primary")))
        .limit(10001);
      if(covered.length>10000)invalid("Primary recorded-instruction coverage exceeds the verification limit.");
      const byTrack=new Map<string,Set<string>>();
      for(const row of covered){
        if(!byTrack.has(row.trackVersionId))byTrack.set(row.trackVersionId,new Set());
        byTrack.get(row.trackVersionId)!.add(row.lessonId);
      }
      if(!available.some(id=>lessons.every(lesson=>byTrack.get(id)?.has(lesson.id))))
        invalid("A released primary recorded track must cover every native Course lesson.");
    }
  }
}
