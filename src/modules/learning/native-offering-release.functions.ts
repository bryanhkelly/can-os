import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  canonicalOfferingCourses, contentManifestReviewDecisions,
  contentPublicationManifests, courseLessons, courses, courseUnits, courseVersions,
  evidenceDocuments, evidenceDocumentVersions, offeringVersions, offerings,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { isVerifiedEvidenceCurrent } from "@/domain/instructional-tracks";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertTrackProvider, type TrackProviderCapability } from
  "@/modules/learning/instructional-track-access.server";
import { writeCanonicalAudit, emitCanonicalDomainEvent } from
  "@/platform/canonical-mutation.server";

const uuid = z.string().uuid();
const releaseInput = z.object({ offeringVersionId: uuid }).strict();
const decisionInput = releaseInput.extend({
  manifestId: uuid, expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewKind: z.enum(["academic","rights","accessibility","coverage","safety"]),
  decision: z.enum(["approved","rejected"]),
  evidenceVersionId: uuid.nullable(),
  rationale: z.string().trim().min(10).max(2000),
}).strict();
const publishInput = releaseInput.extend({
  manifestId: uuid, expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
const kinds = decisionInput.shape.reviewKind.options;
const noStore = () => setResponseHeader("Cache-Control","private, no-store");
const invalid = (message:string):never => { throw new DomainError("VALIDATION_FAILED",message); };
const conflict = (message:string):never => { throw new DomainError("CONFLICT",message); };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = Awaited<ReturnType<typeof getCommandContext>>;

function stableHash(input:unknown):string {
  const canonical=JSON.stringify(input,(_key,value:unknown) =>
    value && typeof value==="object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)))
      : value);
  return createHash("sha256").update(canonical??"").digest("hex");
}

/** Immutable snapshot includes every constituent Course, its syllabus,
 * unit/lesson content, ordering, and the publisher's Offering definition.
 * Published-at timestamps are excluded so Course publication cannot itself
 * invalidate the approved content hash. */
async function loadBundle(tx:Tx,offeringVersionId:string,lock:boolean) {
  const query=tx.select().from(offeringVersions)
    .where(eq(offeringVersions.id,offeringVersionId));
  const [version]=await (lock?query.for("update"):query).limit(1);
  if(!version)throw new AuthorizationError("publisher Offering version");
  const [offering]=await tx.select().from(offerings)
    .where(eq(offerings.id,version.offeringId)).limit(1);
  if(!offering||offering.status!=="active")
    throw new AuthorizationError("active publisher Offering");
  const rows=await tx.select({
    courseVersionId:courseVersions.id,courseId:courses.id,
    publisherOrganizationId:courses.publisherOrganizationId,
    courseTitle:courses.title,courseCode:courses.courseCode,
    lifecycle:courseVersions.lifecycle,syllabus:courseVersions.syllabus,
    isRequired:canonicalOfferingCourses.isRequired,
    sequenceNo:canonicalOfferingCourses.sequenceNo,
  }).from(canonicalOfferingCourses)
    .innerJoin(courseVersions,eq(courseVersions.id,canonicalOfferingCourses.courseVersionId))
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .where(eq(canonicalOfferingCourses.offeringVersionId,offeringVersionId))
    .orderBy(asc(canonicalOfferingCourses.sequenceNo),asc(courseVersions.id))
    .limit(52);
  if(!rows.length||rows.length>50||new Set(rows.map(row=>row.courseVersionId)).size!==rows.length)
    invalid("The native Offering must contain 1 to 50 distinct Course versions.");
  if(rows.some(row=>row.publisherOrganizationId!==offering.publisherOrganizationId))
    throw new AuthorizationError("all Courses must belong to the Offering publisher");
  // Lock each Course version in deterministic order. The lesson editor locks
  // the same version before modifying content, preventing release/edit races.
  if(lock)for(const row of [...rows].sort((a,b)=>a.courseVersionId.localeCompare(b.courseVersionId))){
    await tx.select({id:courseVersions.id}).from(courseVersions)
      .where(eq(courseVersions.id,row.courseVersionId)).for("update");
  }
  const ids=rows.map(row=>row.courseVersionId);
  const [units,lessons]=await Promise.all([
    tx.select({
      id:courseUnits.id,courseVersionId:courseUnits.courseVersionId,
      unitKey:courseUnits.unitKey,title:courseUnits.title,
      sequenceNo:courseUnits.sequenceNo,content:courseUnits.content,
    }).from(courseUnits).where(inArray(courseUnits.courseVersionId,ids))
      .orderBy(asc(courseUnits.courseVersionId),asc(courseUnits.sequenceNo))
      .limit(1001),
    tx.select({
      id:courseLessons.id,courseVersionId:courseLessons.courseVersionId,
      courseUnitId:courseLessons.courseUnitId,lessonKey:courseLessons.lessonKey,
      title:courseLessons.title,lessonOrder:courseLessons.lessonOrder,
      content:courseLessons.content,
    }).from(courseLessons).where(inArray(courseLessons.courseVersionId,ids))
      .orderBy(asc(courseLessons.courseVersionId),asc(courseLessons.courseUnitId),
        asc(courseLessons.lessonOrder)).limit(2001),
  ]);
  if(units.length>1000||lessons.length>2000)
    invalid("The Course composition exceeds the review snapshot limit.");
  const unitIds=new Set(units.map(unit=>unit.id));
  for(const row of rows){
    if(!units.some(unit=>unit.courseVersionId===row.courseVersionId)||
      !lessons.some(lesson=>lesson.courseVersionId===row.courseVersionId))
      invalid("Every Course needs at least one unit and one lesson before review.");
  }
  if(lessons.some(lesson=>!unitIds.has(lesson.courseUnitId)))
    invalid("Course lesson/unit membership is inconsistent.");
  const hash=stableHash({
    nativeOfferingVersionId:version.id,offeringId:offering.id,
    publisherOrganizationId:offering.publisherOrganizationId,
    productDefinition:version.productDefinition,
    courses:rows.map(row=>({
      ...row,
      units:units.filter(unit=>unit.courseVersionId===row.courseVersionId)
        .map(unit=>({
          ...unit,lessons:lessons.filter(lesson=>lesson.courseUnitId===unit.id),
        })),
    }).map(({lifecycle,...rest})=>rest)), // Lifecycle changes do not alter content.
  });
  return {offering,version,courses:rows,hash,unitCount:units.length,lessonCount:lessons.length};
}

async function requireAppointments(tx:Tx,actor:Actor,
  bundle:Awaited<ReturnType<typeof loadBundle>>,capability:TrackProviderCapability){
  for(const row of bundle.courses)
    await assertTrackProvider(tx,actor,{
      organizationId:bundle.offering.publisherOrganizationId,
      courseId:row.courseId,capability,
    });
}

async function currentManifest(tx:Tx,offeringVersionId:string){
  const [manifest]=await tx.select().from(contentPublicationManifests)
    .where(eq(contentPublicationManifests.offeringVersionId,offeringVersionId))
    .orderBy(desc(contentPublicationManifests.createdAt),
      desc(contentPublicationManifests.id)).limit(1);
  return manifest??null;
}
async function exactManifest(tx:Tx,input:z.infer<typeof publishInput>,
  bundle:Awaited<ReturnType<typeof loadBundle>>){
  const manifest=await currentManifest(tx,input.offeringVersionId);
  if(!manifest||manifest.id!==input.manifestId||
    manifest.manifestHash!==input.expectedHash||
    manifest.manifestHash!==bundle.hash||
    manifest.ownerOrganizationId!==bundle.offering.publisherOrganizationId)
    conflict("The exact submitted native content snapshot changed. Submit and review again.");
  return manifest;
}
async function currentReviews(tx:Tx,manifestId:string){
  const reviews=await tx.select().from(contentManifestReviewDecisions)
    .where(eq(contentManifestReviewDecisions.manifestId,manifestId))
    .orderBy(desc(contentManifestReviewDecisions.decisionOrder)).limit(201);
  if(reviews.length>200)invalid("Review history is too large to verify safely.");
  return kinds.map(kind=>({
    kind,decision:reviews.find(row=>row.reviewKind===kind)??null,
  }));
}
async function requireVerifiedEvidence(tx:Tx,evidenceVersionId:string,kind:string){
  const [evidence]=await tx.select({
    kindCode:evidenceDocuments.kindCode,
    verifiedAt:evidenceDocumentVersions.verifiedAt,
    verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,
    validFrom:evidenceDocumentVersions.validFrom,
    validThrough:evidenceDocumentVersions.validThrough,
  }).from(evidenceDocumentVersions)
    .innerJoin(evidenceDocuments,eq(evidenceDocuments.id,evidenceDocumentVersions.documentId))
    .where(eq(evidenceDocumentVersions.id,evidenceVersionId)).limit(1);
  if(!evidence||!isVerifiedEvidenceCurrent({...evidence,at:new Date()})||
    (kind==="rights"&&evidence.kindCode!=="rights"))
    invalid("Each approval needs current independently verified evidence; rights need rights evidence.");
}
async function requireApprovedSnapshot(tx:Tx,manifest:
  typeof contentPublicationManifests.$inferSelect){
  const reviews=await currentReviews(tx,manifest.id);
  for(const review of reviews){
    const row=review.decision;
    if(!row||row.decision!=="approved"||
      row.reviewerPersonId===manifest.createdByPersonId||!row.evidenceVersionId)
      invalid("All five latest decisions must independently approve the exact manifest.");
    await requireVerifiedEvidence(tx,row.evidenceVersionId,review.kind);
  }
  return reviews;
}
async function log(tx:Tx,actor:Actor,organizationId:string,
  versionId:string,eventCode:string,details:Record<string,unknown>){
  await writeCanonicalAudit(tx,{
    actorPersonId:actor.actorPersonId,
    owningOrganizationId:organizationId,
    eventCode,entityKind:"offering_version",entityId:versionId,
    payload:details,
  });
  await emitCanonicalDomainEvent(tx,{
    eventType:eventCode,aggregateType:"offering_version",aggregateId:versionId,
    actorPersonId:actor.actorPersonId,payload:details,
  });
}

/** Creator preflight. It reveals neither another operator's adoption nor
 * evidence or reviewer identities outside the publisher Course appointment. */
export const getNativeOfferingReleaseOverview=createServerFn({method:"GET"})
  .validator((raw:unknown)=>releaseInput.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const bundle=await loadBundle(tx,data.offeringVersionId,false);
      await requireAppointments(tx,actor,bundle,"instructional_track.author");
      const manifest=await currentManifest(tx,data.offeringVersionId);
      return {
        offeringVersionId:bundle.version.id,offeringTitle:bundle.offering.title,
        lifecycle:bundle.version.lifecycle,
        courseCount:bundle.courses.length,lessonCount:bundle.lessonCount,
        manuscriptHash:bundle.hash,
        manifest:manifest?{
          id:manifest.id,hash:manifest.manifestHash,
          status:manifest.manifestStatus,
          current:manifest.manifestHash===bundle.hash,
        }:null,
      };
    });
  });

/** Submission creates an existing native content manifest. No new Course,
 * approval role, publisher, or local authorization is created. */
export const submitNativeOfferingRelease=createServerFn({method:"POST"})
  .validator((raw:unknown)=>releaseInput.extend({
    expectedHash:z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const bundle=await loadBundle(tx,data.offeringVersionId,true);
      await requireAppointments(tx,actor,bundle,"instructional_track.author");
      if(bundle.version.lifecycle!=="draft"||bundle.hash!==data.expectedHash)
        conflict("Only an unchanged draft Offering may be submitted.");
      const previous=await currentManifest(tx,data.offeringVersionId);
      if(previous?.manifestHash===bundle.hash)
        return {manifestId:previous.id,manifestHash:bundle.hash,created:false};
      const [manifest]=await tx.insert(contentPublicationManifests).values({
        ownerOrganizationId:bundle.offering.publisherOrganizationId,
        offeringVersionId:bundle.version.id,manifestHash:bundle.hash,
        createdByPersonId:actor.actorPersonId!,
      }).returning({id:contentPublicationManifests.id});
      if(!manifest)throw new DomainError("UNEXPECTED","Submission did not create a manifest.");
      await log(tx,actor,bundle.offering.publisherOrganizationId,bundle.version.id,
        "NativeOfferingReviewSubmitted",{manifestId:manifest.id,manifestHash:bundle.hash,
          courseVersionIds:bundle.courses.map(row=>row.courseVersionId)});
      return {manifestId:manifest.id,manifestHash:bundle.hash,created:true};
    });
  });

/** Only a current Course-appointed publisher reviewer sees submitted items.
 * Publisher Organization membership alone is never enough. */
export const getNativeOfferingReleaseReviewQueue=createServerFn({method:"GET"})
  .handler(async()=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    if(!actor.actorPersonId||actor.role!=="academic_content_reviewer"||
      !actor.scope.organizationIds?.length)throw new AuthorizationError("publisher reviewer");
    return db.transaction(async tx=>{
      const rows=await tx.select({
        id:contentPublicationManifests.id,
        offeringVersionId:contentPublicationManifests.offeringVersionId,
        manifestHash:contentPublicationManifests.manifestHash,
        manifestStatus:contentPublicationManifests.manifestStatus,
        createdByPersonId:contentPublicationManifests.createdByPersonId,
      }).from(contentPublicationManifests)
        .where(inArray(contentPublicationManifests.ownerOrganizationId,
          actor.scope.organizationIds))
        .orderBy(desc(contentPublicationManifests.createdAt))
        .limit(61);
      const items=[];
      for(const row of rows.slice(0,60)){
        if(!row.offeringVersionId||row.createdByPersonId===actor.actorPersonId)continue;
        try{
          const bundle=await loadBundle(tx,row.offeringVersionId,false);
          await requireAppointments(tx,actor,bundle,"instructional_track.review");
          const latest=await currentManifest(tx,row.offeringVersionId);
          if(latest?.id!==row.id)continue;
          items.push({
            id:row.id,offeringVersionId:row.offeringVersionId,
            offeringTitle:bundle.offering.title,manifestHash:row.manifestHash,
            status:row.manifestStatus,current:row.manifestHash===bundle.hash,
            courseCount:bundle.courses.length,
            allCoursesPublished:bundle.courses.every(c=>c.lifecycle==="published"),
            offeringPublished:bundle.version.lifecycle==="published",
            reviews:(await currentReviews(tx,row.id)).map(item=>({
              kind:item.kind,decision:item.decision?.decision??"not_reviewed",
            })),
          });
        }catch(error){if(!(error instanceof AuthorizationError))throw error;}
      }
      return {limited:rows.length>60,items};
    });
  });

export const decideNativeOfferingRelease=createServerFn({method:"POST"})
  .validator((raw:unknown)=>decisionInput.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const bundle=await loadBundle(tx,data.offeringVersionId,true);
      await requireAppointments(tx,actor,bundle,"instructional_track.review");
      const manifest=await exactManifest(tx,data,bundle);
      if(bundle.version.lifecycle!=="draft"||manifest.manifestStatus!=="draft"||
        manifest.createdByPersonId===actor.actorPersonId)
        throw new AuthorizationError("independent review of submitted draft");
      if(data.decision==="approved"){
        if(!data.evidenceVersionId)
          invalid("Approvals require current independently verified evidence.");
        await requireVerifiedEvidence(tx,data.evidenceVersionId,data.reviewKind);
      }
      await tx.insert(contentManifestReviewDecisions).values({
        manifestId:manifest.id,reviewKind:data.reviewKind,
        reviewerPersonId:actor.actorPersonId!,decision:data.decision,
        evidenceVersionId:data.evidenceVersionId,
      });
      await log(tx,actor,bundle.offering.publisherOrganizationId,bundle.version.id,
        "NativeOfferingReviewed",{manifestId:manifest.id,manifestHash:manifest.manifestHash,
          reviewKind:data.reviewKind,decision:data.decision,
          rationale:data.rationale,evidenceVersionId:data.evidenceVersionId});
      return {manifestId:manifest.id,reviewKind:data.reviewKind,decision:data.decision};
    });
  });

/** Review of the exact submitted Course composition is independent of
 * local adoption. Course publication deliberately precedes Offering release:
 * recorded-instructor tracks may only be created against published Courses. */
export const publishNativeOfferingCourses=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishInput.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const bundle=await loadBundle(tx,data.offeringVersionId,true);
      await requireAppointments(tx,actor,bundle,"instructional_track.publish");
      const manifest=await exactManifest(tx,data,bundle);
      if(manifest.createdByPersonId===actor.actorPersonId)
        throw new AuthorizationError("independent Course publication");
      if(bundle.version.lifecycle!=="draft")
        conflict("The Offering has already been published.");
      await requireApprovedSnapshot(tx,manifest);
      // A manuscript review can publish native Course versions before any
      // recorded media exists. The existing database manifest-approval trigger
      // explicitly rejects empty asset manifests. Never upgrade that manifest
      // here: the separately governed Offering media release must supply real
      // approved asset items and satisfy Offering release requirements.
      const published=[];
      for(const row of bundle.courses){
        if(row.lifecycle==="published")continue;
        const [result]=await tx.update(courseVersions)
          .set({lifecycle:"published",publishedAt:new Date()})
          .where(and(eq(courseVersions.id,row.courseVersionId),
            eq(courseVersions.lifecycle,"draft"))).returning({id:courseVersions.id});
        if(!result)conflict("Course version changed before publication.");
        published.push(result.id);
      }
      await log(tx,actor,bundle.offering.publisherOrganizationId,bundle.version.id,
        "NativeCoursesPublished",{manifestId:manifest.id,
          manifestHash:manifest.manifestHash,courseVersionIds:published});
      return {manifestId:manifest.id,publishedCourseVersionIds:published};
    });
  });

/** Offering release checks a separately approved immutable manifest and
 * published constituent Courses. Local adoption remains an independent
 * governed operation, never an implicit side effect of publication. */
export const publishNativeOfferingVersion=createServerFn({method:"POST"})
  .validator((raw:unknown)=>publishInput.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getCommandContext(getRequest());
    return db.transaction(async tx=>{
      const bundle=await loadBundle(tx,data.offeringVersionId,true);
      await requireAppointments(tx,actor,bundle,"instructional_track.publish");
      const manifest=await exactManifest(tx,data,bundle);
      if(manifest.createdByPersonId===actor.actorPersonId)
        throw new AuthorizationError("independent Offering publication");
      if(manifest.manifestStatus!=="approved")
        invalid("The Offering needs a separately approved asset-bearing publication manifest. Native Course manuscript review alone cannot release the Offering.");
      if(bundle.courses.some(row=>row.lifecycle!=="published"))
        invalid("Publish all independently reviewed native Courses before the Offering.");
      await requireApprovedSnapshot(tx,manifest);
      // Mirror the database release gate for an actionable error, never
      // create or silently relax publisher-defined release requirements.
      const missing=await tx.execute(sql`
        SELECT oc.course_version_id
        FROM education_v30.offering_courses oc
        LEFT JOIN education_v30.offering_release_requirements r
          ON r.offering_version_id=oc.offering_version_id
         AND r.course_version_id=oc.course_version_id
        WHERE oc.offering_version_id=${data.offeringVersionId}::uuid
          AND oc.is_required AND r.id IS NULL
        LIMIT 1
      `);
      if(missing.rows.length)
        invalid("Every required Course needs an explicitly reviewed Offering release policy before publication.");
      const extra=await tx.execute(sql`
        SELECT course_version_id FROM education_v30.offering_release_requirements
        WHERE offering_version_id=${data.offeringVersionId}::uuid
          AND (minimum_approved_primary_tracks>0 OR complete_lesson_coverage_required)
        LIMIT 1
      `);
      if(extra.rows.length)
        invalid("This Offering requires separately verified recorded-teacher coverage before publication.");
      if(bundle.version.lifecycle==="published")
        return {offeringVersionId:bundle.version.id,alreadyPublished:true};
      const [published]=await tx.update(offeringVersions)
        .set({lifecycle:"published",publishedAt:new Date()})
        .where(and(eq(offeringVersions.id,bundle.version.id),
          eq(offeringVersions.lifecycle,"draft"))).returning({id:offeringVersions.id});
      if(!published)conflict("Offering version changed before publication.");
      await log(tx,actor,bundle.offering.publisherOrganizationId,bundle.version.id,
        "NativeOfferingPublished",{manifestId:manifest.id,
          manifestHash:manifest.manifestHash,
          courseVersionIds:bundle.courses.map(row=>row.courseVersionId)});
      return {offeringVersionId:published.id,alreadyPublished:false};
    });
  });
