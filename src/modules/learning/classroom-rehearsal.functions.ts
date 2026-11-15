import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, lte, or, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  classroomOfferingCourses, contentAssets, contentAssetVersions,
  courseLessons, courseVersions, deploymentOfferingAdoptions,
  offeringVersions, trackLessonPresentations, facilitatedRehearsalEvents,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { resolveClassVideo } from "@/domain/class-video";
import { instructionalTrackAssetStorageKey } from "@/domain/instructional-tracks";
import { signPrivateObjectUrl } from "@/platform/storage/r2";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import { authorizedHostDeployment } from "./facilitated-learning.functions";
import { assertFacilitatedInstructionalPreview } from "./student-instructional-tracks.server";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Host = Awaited<ReturnType<typeof requireCanonicalFacilitator>>;
const id=z.string().uuid();
const rehearsalInput=z.object({
  deploymentId:id,courseVersionId:id,siteId:id,
}).strict();
const mediaInput=rehearsalInput.extend({lessonId:id,assetVersionId:id}).strict();
const protectedMediaKey=/^learning\/instructional-track\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function guard(){
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control","private, no-store");
}
async function previewScope(tx:Tx,host:Host,data:z.infer<typeof rehearsalInput>){
  await authorizedHostDeployment(tx,host,data.deploymentId,data.siteId);
  const now=new Date();
  const [adoption]=await tx.select({
    adoptionId:deploymentOfferingAdoptions.id,
    offeringVersionId:deploymentOfferingAdoptions.offeringVersionId,
  }).from(deploymentOfferingAdoptions)
    .innerJoin(offeringVersions,and(
      eq(offeringVersions.id,deploymentOfferingAdoptions.offeringVersionId),
      eq(offeringVersions.lifecycle,"published"),
    ))
    .innerJoin(classroomOfferingCourses,and(
      eq(classroomOfferingCourses.offeringVersionId,offeringVersions.id),
      eq(classroomOfferingCourses.courseVersionId,data.courseVersionId),
    ))
    .innerJoin(courseVersions,and(
      eq(courseVersions.id,classroomOfferingCourses.courseVersionId),
      eq(courseVersions.lifecycle,"published"),
    ))
    .where(and(
      eq(deploymentOfferingAdoptions.deploymentId,data.deploymentId),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),
        gt(deploymentOfferingAdoptions.validThrough,now)),
    )).limit(1);
  if(!adoption)throw new AuthorizationError("approved published course at host Site");
  return {deploymentId:data.deploymentId,courseVersionId:data.courseVersionId,
    adoptionId:adoption.adoptionId,offeringVersionId:adoption.offeringVersionId};
}
async function validatePreview(tx:Tx,host:Host,data:z.infer<typeof mediaInput>){
  const scope=await previewScope(tx,host,data);
  const [candidate]=await tx.select({trackVersionId:trackLessonPresentations.trackVersionId})
    .from(trackLessonPresentations).innerJoin(courseLessons,and(
      eq(courseLessons.id,trackLessonPresentations.courseLessonId),
      eq(courseLessons.courseVersionId,data.courseVersionId),
    ))
    .where(and(
      eq(trackLessonPresentations.courseVersionId,data.courseVersionId),
      eq(trackLessonPresentations.courseLessonId,data.lessonId),
      eq(trackLessonPresentations.assetVersionId,data.assetVersionId),
    )).limit(1);
  if(!candidate)throw new AuthorizationError("authorized course presentation");
  await assertFacilitatedInstructionalPreview(tx,scope,candidate.trackVersionId,
    data.lessonId,data.assetVersionId);
}
export const getClassroomRehearsalMedia=createServerFn({method:"GET"})
  .validator((v:unknown)=>rehearsalInput.parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      const scope=await previewScope(tx,host,data);
      const candidates=await tx.select({
        lessonId:courseLessons.id,lessonTitle:courseLessons.title,
        assetVersionId:trackLessonPresentations.assetVersionId,
        trackVersionId:trackLessonPresentations.trackVersionId,
      }).from(trackLessonPresentations).innerJoin(courseLessons,and(
        eq(courseLessons.id,trackLessonPresentations.courseLessonId),
        eq(courseLessons.courseVersionId,data.courseVersionId),
      )).where(eq(trackLessonPresentations.courseVersionId,data.courseVersionId))
        .orderBy(asc(courseLessons.lessonOrder)).limit(25);
      const approved:typeof candidates=[];
      for(const v of candidates){
        try{
          await assertFacilitatedInstructionalPreview(tx,scope,
            v.trackVersionId,v.lessonId,v.assetVersionId);
          approved.push(v);
        }catch(e){
          if(!(e instanceof AuthorizationError)&&!(e instanceof DomainError))throw e;
        }
      }
      return {media:approved,
        note:"Rehearsal is private preview only. No learner room, attendance, credit or completion exists."};
    });
  });
export const getClassroomRehearsalMediaAccess=createServerFn({method:"POST"})
  .validator((v:unknown)=>mediaInput.parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      await validatePreview(tx,host,data);
      const [asset]=await tx.select({
        storageReference:contentAssetVersions.storageReference,
        externalUrl:contentAssets.externalUrl,
      }).from(contentAssetVersions)
        .innerJoin(contentAssets,eq(contentAssets.id,contentAssetVersions.assetId))
        .where(and(eq(contentAssetVersions.id,data.assetVersionId),
          eq(contentAssetVersions.lifecycle,"published"))).limit(1);
      if(!asset)throw new AuthorizationError("approved rehearsal media");
      const key=instructionalTrackAssetStorageKey(data.assetVersionId);
      if(asset.storageReference===key&&protectedMediaKey.test(key)){
        return {downloadUrl:signPrivateObjectUrl({
          method:"GET",key,keyPattern:protectedMediaKey,expiresSeconds:30,
        }),expiresInSeconds:30};
      }
      if(!asset.externalUrl||resolveClassVideo(asset.externalUrl)?.kind!=="embed")
        throw new AuthorizationError("approved and allowlisted rehearsal video");
      return {downloadUrl:asset.externalUrl,expiresInSeconds:0};
    });
  });
export const recordClassroomRehearsalPlayback=createServerFn({method:"POST"})
  .validator((v:unknown)=>mediaInput.extend({
    requestId:id,kind:z.enum(["opened","played","paused","ended"]),
  }).strict().parse(v))
  .handler(async({data})=>{
    guard();
    const host=await requireCanonicalFacilitator();
    return db.transaction(async tx=>{
      await validatePreview(tx,host,data);
      const [saved]=await tx.insert(facilitatedRehearsalEvents).values({
        deploymentId:data.deploymentId,courseVersionId:data.courseVersionId,
        siteId:data.siteId,facilitatorPersonId:host.actor.actorPersonId!,
        requestId:data.requestId,kind:data.kind,lessonId:data.lessonId,
        assetVersionId:data.assetVersionId,
      }).onConflictDoNothing().returning({id:facilitatedRehearsalEvents.id});
      if (!saved) {
        const [prior] = await tx.select().from(facilitatedRehearsalEvents).where(and(
          eq(facilitatedRehearsalEvents.siteId, data.siteId),
          eq(facilitatedRehearsalEvents.facilitatorPersonId, host.actor.actorPersonId!),
          eq(facilitatedRehearsalEvents.requestId, data.requestId),
        )).limit(1);
        if (!prior || prior.deploymentId !== data.deploymentId ||
            prior.courseVersionId !== data.courseVersionId ||
            prior.lessonId !== data.lessonId || prior.assetVersionId !== data.assetVersionId ||
            prior.kind !== data.kind)
          throw new Error("Conflicting rehearsal observation retry");
      }
      return {saved:!!saved,duplicate:!saved,rehearsalOnly:true};
    });
  });
