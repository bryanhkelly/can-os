import { createHash } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, count, desc, eq, gt, ilike, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, canonicalClasses, canonicalClassOfferings,
  canonicalClassOfferingVersions, canonicalClassEnrollments, canonicalPersons,
  learnerCourseAttempts, courseVersions, courses, offeringVersions, offerings,
  programDeployments, deploymentOfferingAdoptions, educationOperations,
  educationOperationSites, classroomDeploymentSites, catalogSites, siteOrganizationRoles,
  educationOperationOrganizationRoles,
  canonicalOfferingCourses, participationAttributions, networkMemberships,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { assertNativeSelfEnrollmentEligible, verifiedAdultOn } from "@/domain/native-class-enrollment";
import { classCreditModeSchema } from "@/domain/unified-class";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const selfInput=z.object({
  classOfferingVersionId:uuid,
  creditMode:classCreditModeSchema,
  adultAttested:z.literal(true),
  consentAccepted:z.literal(true),
  networkMembershipId:z.string().uuid().optional(),
}).strict();
function guard(){
  if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true"){
    throw new AuthorizationError("native Class release not activated");
  }
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function requireLearner(){
  const actor=await getCanonicalCommandContext(getRequest());
  if(!actor.actorPersonId || actor.role!=="learner")
    throw new AuthorizationError("verified canonical learner Person");
  assertCapability(actor,"learning.participate");
  return actor.actorPersonId;
}

/** A live Class is permitted only while publisher/adoption/deployment and
 * its authorized Site are current, regardless of catalog visibility. */
export async function currentClassAuthority(tx:Tx,classId:string,now:Date){
  const [r]=await tx.select({
    classId:canonicalClasses.id,classTitle:canonicalClasses.title,
    classCapacity:canonicalClasses.capacity,
    classState:canonicalClasses.state,
    deploymentId:canonicalClasses.deploymentId,adoptionId:canonicalClasses.adoptionId,
    offeringVersionId:canonicalClasses.offeringVersionId,
    courseVersionId:canonicalClasses.courseVersionId,
    siteId:canonicalClasses.siteId,deliveryMode:canonicalClasses.deliveryMode,
    operatingOrganizationId:canonicalClasses.operatingOrganizationId,
  }).from(canonicalClasses)
    .innerJoin(programDeployments,eq(programDeployments.id,canonicalClasses.deploymentId))
    .innerJoin(educationOperations,eq(educationOperations.id,programDeployments.operationId))
    .innerJoin(deploymentOfferingAdoptions,and(
      eq(deploymentOfferingAdoptions.id,canonicalClasses.adoptionId),
      eq(deploymentOfferingAdoptions.deploymentId,canonicalClasses.deploymentId),
      eq(deploymentOfferingAdoptions.offeringVersionId,canonicalClasses.offeringVersionId),
    ))
    .innerJoin(offeringVersions,and(
      eq(offeringVersions.id,canonicalClasses.offeringVersionId),
      eq(offeringVersions.offeringId,programDeployments.offeringId),
    ))
    .innerJoin(offerings,eq(offerings.id,offeringVersions.offeringId))
    .innerJoin(canonicalOfferingCourses,and(
      eq(canonicalOfferingCourses.offeringVersionId,canonicalClasses.offeringVersionId),
      eq(canonicalOfferingCourses.courseVersionId,canonicalClasses.courseVersionId),
    ))
    .innerJoin(courseVersions,eq(courseVersions.id,canonicalClasses.courseVersionId))
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .where(and(
      eq(canonicalClasses.id,classId),eq(programDeployments.status,"active"),
      eq(educationOperations.status,"active"),eq(offerings.status,"active"),
      eq(offeringVersions.lifecycle,"published"),isNotNull(offeringVersions.publishedAt),
      eq(courseVersions.lifecycle,"published"),isNotNull(courseVersions.publishedAt),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),gt(deploymentOfferingAdoptions.validThrough,now)),
    )).limit(1);
  if(!r || r.classState!=="active")throw new AuthorizationError("currently authorized Class");
  if(!r.siteId)throw new AuthorizationError("active Class must have an authorized Site");
  const [operator]=await tx.select({id:educationOperationOrganizationRoles.id})
    .from(educationOperationOrganizationRoles)
    .innerJoin(programDeployments,eq(programDeployments.operationId,educationOperationOrganizationRoles.operationId))
    .where(and(
      eq(programDeployments.id,r.deploymentId),
      eq(educationOperationOrganizationRoles.organizationId,r.operatingOrganizationId),
      eq(educationOperationOrganizationRoles.roleCode,"operator"),
      eq(educationOperationOrganizationRoles.status,"approved"),
      lte(educationOperationOrganizationRoles.validFrom,now),
      or(isNull(educationOperationOrganizationRoles.validThrough),
        gt(educationOperationOrganizationRoles.validThrough,now)),
    )).limit(1);
  if(!operator)throw new AuthorizationError("current operating organization authority");
  if(r.siteId){
    const [site]=await tx.select({id:catalogSites.id}).from(catalogSites)
      .innerJoin(programDeployments,eq(programDeployments.id,r.deploymentId))
      .innerJoin(siteOrganizationRoles,and(
        eq(siteOrganizationRoles.siteId,catalogSites.id),
        eq(siteOrganizationRoles.organizationId,r.operatingOrganizationId),
        inArray(siteOrganizationRoles.roleCode,["operator","host"]),
        lte(siteOrganizationRoles.validFrom,now),
        or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
      ))
      .innerJoin(educationOperationSites,and(
        eq(educationOperationSites.siteId,catalogSites.id),
        eq(educationOperationSites.operationId,programDeployments.operationId),
        lte(educationOperationSites.validFrom,now),
        or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
      ))
      .where(and(eq(catalogSites.id,r.siteId),eq(catalogSites.status,"active"))).limit(1);
    if(!site)throw new AuthorizationError("active Class Site and Operation relationship");
    if(r.deliveryMode!=="self_paced"){
      const [placement]=await tx.select({id:classroomDeploymentSites.id})
        .from(classroomDeploymentSites).where(and(
          eq(classroomDeploymentSites.deploymentId,r.deploymentId),
          eq(classroomDeploymentSites.siteId,r.siteId),
        )).limit(1);
      if(!placement)throw new AuthorizationError("active deployment Site placement");
    }
  }
  return r;
}

/** The public catalog never discloses unlisted/private Class Offerings. */
export const getNativePublicClassCatalog=createServerFn({method:"GET"})
  .handler(async()=>{
    guard();
    const now=new Date();
    const rows=await db.select({
      classId:canonicalClasses.id,classTitle:canonicalClasses.title,
      courseVersionId:canonicalClasses.courseVersionId,
      deliveryMode:canonicalClasses.deliveryMode,
      siteId:canonicalClasses.siteId,
      classOfferingVersionId:canonicalClassOfferingVersions.id,
      enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
      opensAt:canonicalClassOfferingVersions.opensAt,
      closesAt:canonicalClassOfferingVersions.closesAt,
      capacity:canonicalClassOfferingVersions.capacity,
      allowedCreditModes:canonicalClassOfferingVersions.allowedCreditModes,
      consentText:canonicalClassOfferingVersions.consentText,
    }).from(canonicalClassOfferingVersions)
      .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassOfferingVersions.classId))
      .where(and(
        eq(canonicalClassOfferingVersions.state,"published"),
        eq(canonicalClassOfferingVersions.visibility,"public"),
        eq(canonicalClasses.state,"active"),
        or(isNull(canonicalClassOfferingVersions.opensAt),lte(canonicalClassOfferingVersions.opensAt,now)),
        or(isNull(canonicalClassOfferingVersions.closesAt),gt(canonicalClassOfferingVersions.closesAt,now)),
      )).orderBy(asc(canonicalClasses.title)).limit(100);
    const allowed=[];
    for(const row of rows){
      try{
        const authority=await db.transaction(tx=>currentClassAuthority(tx,row.classId,now));
        // Do not advertise a larger publication limit than the underlying
        // Class can actually seat across assignment and self-registration.
        const limits=[row.capacity,authority.classCapacity]
          .filter((n):n is number=>n!==null);
        allowed.push({...row,capacity:limits.length?Math.min(...limits):null});
      }catch(e){if(!(e instanceof AuthorizationError))throw e;}
    }
    return allowed;
  });

const nativeCatalogPageInput=z.object({
  search:z.string().trim().max(100).default(""),
  classId:uuid.optional(),
  cursor:z.object({title:z.string().min(1).max(200),classId:uuid}).strict().nullable().default(null),
}).strict();

/** Keyset-paginated public discovery: never expose a private/unlisted Class.
 * Authorization is checked on every candidate. A page can be sparse when
 * adoption or Site authority was revoked; the cursor still advances.
 * Server-side search and pagination avoid the legacy first-100 ceiling.
 */
export const getNativePublicClassCatalogPage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>nativeCatalogPageInput.parse(raw))
  .handler(async({data})=>{
    guard();
    const now=new Date();
    const escaped=data.search.replace(/[\\%_]/g,character=>"\\"+character);
    return db.transaction(async tx=>{
      const rows=await tx.select({
        classId:canonicalClasses.id,classTitle:canonicalClasses.title,
        courseVersionId:canonicalClasses.courseVersionId,
        deliveryMode:canonicalClasses.deliveryMode,siteId:canonicalClasses.siteId,
        classOfferingVersionId:canonicalClassOfferingVersions.id,
        enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
        opensAt:canonicalClassOfferingVersions.opensAt,
        closesAt:canonicalClassOfferingVersions.closesAt,
        capacity:canonicalClassOfferingVersions.capacity,
        allowedCreditModes:canonicalClassOfferingVersions.allowedCreditModes,
        consentText:canonicalClassOfferingVersions.consentText,
      }).from(canonicalClassOfferingVersions)
        .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassOfferingVersions.classId))
        .where(and(
          eq(canonicalClassOfferingVersions.state,"published"),
          eq(canonicalClassOfferingVersions.visibility,"public"),
          eq(canonicalClasses.state,"active"),
          data.classId?eq(canonicalClasses.id,data.classId):undefined,
          or(isNull(canonicalClassOfferingVersions.opensAt),lte(canonicalClassOfferingVersions.opensAt,now)),
          or(isNull(canonicalClassOfferingVersions.closesAt),gt(canonicalClassOfferingVersions.closesAt,now)),
          data.search?ilike(canonicalClasses.title,"%"+escaped+"%"):undefined,
          data.cursor?or(
            gt(canonicalClasses.title,data.cursor.title),
            and(eq(canonicalClasses.title,data.cursor.title),
              gt(canonicalClasses.id,data.cursor.classId)),
          ):undefined,
        )).orderBy(asc(canonicalClasses.title),asc(canonicalClasses.id)).limit(25);
      const page=rows.slice(0,24);
      const items=[];
      for(const row of page){
        try{
          const authority=await currentClassAuthority(tx,row.classId,now);
          const limits=[row.capacity,authority.classCapacity]
            .filter((n):n is number=>n!==null);
          items.push({...row,capacity:limits.length?Math.min(...limits):null});
        }catch(error){
          if(!(error instanceof AuthorizationError))throw error;
        }
      }
      const last=page[page.length-1];
      return {items,nextCursor:rows.length>24&&last?
        {title:last.classTitle,classId:last.classId}:null};
    });
  });

/** Transactionally creates one Class Enrollment and one canonical Course Attempt.
 * This entry point is adult self-enrollment only. Guardian, assignment, approval
 * and invitation require their own verified authorization commands. */
export const enrollInNativeClass=createServerFn({method:"POST"})
  .validator((raw:unknown)=>selfInput.parse(raw))
  .handler(async({data})=>{
    guard();const learnerPersonId=await requireLearner();
    return db.transaction(async tx=>{
      const now=new Date();
      const [version]=await tx.select().from(canonicalClassOfferingVersions)
        .where(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId)).limit(1);
      if(!version)throw new AuthorizationError("valid Class Offering version");
      const [instance]=await tx.select({id:canonicalClasses.id}).from(canonicalClasses)
        .where(eq(canonicalClasses.id,version.classId)).for("update").limit(1);
      if(!instance)throw new AuthorizationError("current Class");
      const current=await currentClassAuthority(tx,instance.id,now);
      if(!current.siteId)throw new AuthorizationError("Class enrollment requires a Site");
      const [offering]=await tx.select({id:canonicalClassOfferings.id})
        .from(canonicalClassOfferings).where(and(
          eq(canonicalClassOfferings.id,version.classOfferingId),
          eq(canonicalClassOfferings.classId,instance.id),
        )).limit(1);
      if(!offering)throw new AuthorizationError("Class Offering belongs to this Class");
      const [person]=await tx.select({birthDate:canonicalPersons.birthDate})
        .from(canonicalPersons).where(eq(canonicalPersons.id,learnerPersonId)).limit(1);
      assertNativeSelfEnrollmentEligible({
        classState:current.classState,offeringState:version.state,
        terms:{visibility:version.visibility,enrollmentMethods:version.enrollmentMethods,
          opensAt:version.opensAt,closesAt:version.closesAt},
        adultVerified:verifiedAdultOn(person?.birthDate,now),
        adultAttested:data.adultAttested,consentAccepted:data.consentAccepted,
        consentVersion:version.consentVersion,consentText:version.consentText,
      },now);
      const previous=await tx.select({
        id:canonicalClassEnrollments.id,status:canonicalClassEnrollments.status,
        creditMode:canonicalClassEnrollments.creditMode,
        courseAttemptId:canonicalClassEnrollments.courseAttemptId,
      }).from(canonicalClassEnrollments).where(and(
        eq(canonicalClassEnrollments.classId,instance.id),
        eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId),
      )).orderBy(desc(canonicalClassEnrollments.enrolledAt)).limit(5);
      const existing=previous.find(row=>["pending","active"].includes(row.status));
      if(existing){
        if(existing.creditMode!==data.creditMode || !existing.courseAttemptId)
          throw new AuthorizationError("existing enrollment requires governed modification");
        return {classEnrollmentId:existing.id,courseAttemptId:existing.courseAttemptId,alreadyEnrolled:true};
      }
      if(previous.some(row=>row.status==="completed"))
        throw new AuthorizationError("repeat participation requires approved Class repeat policy");
      const [occupancy]=await tx.select({total:count()}).from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.classId,instance.id),
          inArray(canonicalClassEnrollments.status,["pending","active"])));
      if(!version.allowedCreditModes.includes(data.creditMode))
        throw new AuthorizationError("allowed learner credit/audit participation mode");
      if((current.classCapacity!==null && (occupancy?.total??0)>=current.classCapacity)||
         (version.capacity!==null && (occupancy?.total??0)>=version.capacity))
        throw new AuthorizationError("Class is at capacity");
      const consentSha256=createHash("sha256")
        .update(version.consentVersion!).update("\u0000").update(version.consentText!)
        .digest("hex");
      const [enrollment]=await tx.insert(canonicalClassEnrollments).values({
        classId:instance.id,classOfferingVersionId:version.id,
        learnerPersonId,enrolledByPersonId:learnerPersonId,
        enrollmentMethod:"self",creditMode:data.creditMode,status:"active",
        consentVersion:version.consentVersion,consentSha256,consentedAt:now,
      }).returning({id:canonicalClassEnrollments.id});
      if(!enrollment)throw new Error("Class Enrollment insert failed");
      const [selectedMembership]=data.networkMembershipId
        ?await tx.select({
          id:networkMemberships.id,
          memberOrganizationId:networkMemberships.memberOrganizationId,
        }).from(networkMemberships).where(and(
          eq(networkMemberships.id,data.networkMembershipId),
          eq(networkMemberships.status,"approved"),
          eq(networkMemberships.directoryVisible,true),
          eq(networkMemberships.networkOrganizationId,current.operatingOrganizationId),
          lte(networkMemberships.validFrom,now),
          or(isNull(networkMemberships.validThrough),gt(networkMemberships.validThrough,now)),
        )).limit(1):[];
      if(data.networkMembershipId&&!selectedMembership)
        throw new AuthorizationError("approved directory-visible network affiliate");
      await tx.insert(participationAttributions).values({
        classEnrollmentId:enrollment.id,
        deliverySiteId:current.siteId,reportingSiteId:current.siteId,
        creditedOrganizationId:selectedMembership?.memberOrganizationId??
          current.operatingOrganizationId,
        networkMembershipId:selectedMembership?.id??null,
        attributionBasis:selectedMembership?"self_reported":"provider_default",
        relationshipSnapshot:selectedMembership?{}:{
          kind:"provider_default",classId:instance.id,
          organizationId:current.operatingOrganizationId,siteId:current.siteId},
      });
      const [attempt]=await tx.insert(learnerCourseAttempts).values({
        classEnrollmentId:enrollment.id,enrollmentId:null,noncreditRegistrationId:null,
        deploymentId:current.deploymentId,adoptionId:current.adoptionId,
        offeringVersionId:current.offeringVersionId,
        courseVersionId:current.courseVersionId,sectionId:null,
        attemptNo:1,status:"active",
      }).returning({id:learnerCourseAttempts.id});
      if(!attempt)throw new Error("Course Attempt insert failed");
      await tx.update(canonicalClassEnrollments).set({courseAttemptId:attempt.id})
        .where(eq(canonicalClassEnrollments.id,enrollment.id));
      await tx.insert(auditEvents).values({
        actorPersonId:learnerPersonId,owningOrganizationId:current.operatingOrganizationId,
        eventCode:"class.enrollment.created",entityKind:"class_enrollment",entityId:enrollment.id,
        payload:{classId:instance.id,classOfferingVersionId:version.id,
          courseAttemptId:attempt.id,method:"self",creditMode:data.creditMode,
          consentVersion:version.consentVersion,consentSha256},
      });
      await tx.insert(domainEvents).values({
        eventType:"ClassEnrollmentCreated",aggregateType:"class_enrollment",
        aggregateId:enrollment.id,actorPersonId:learnerPersonId,
        payload:{classId:instance.id,courseAttemptId:attempt.id},
      });
      return {classEnrollmentId:enrollment.id,courseAttemptId:attempt.id,alreadyEnrolled:false};
    });
  });

export const getMyNativeClassEnrollments=createServerFn({method:"GET"})
  .handler(async()=>{
    guard();const learnerPersonId=await requireLearner();
    return db.select({
      classEnrollmentId:canonicalClassEnrollments.id,classId:canonicalClasses.id,
      title:canonicalClasses.title,deliveryMode:canonicalClasses.deliveryMode,
      creditMode:canonicalClassEnrollments.creditMode,
      status:canonicalClassEnrollments.status,
      courseAttemptId:canonicalClassEnrollments.courseAttemptId,
      enrolledAt:canonicalClassEnrollments.enrolledAt,
      siteId:canonicalClasses.siteId,
    }).from(canonicalClassEnrollments)
      .innerJoin(canonicalClasses,eq(canonicalClasses.id,canonicalClassEnrollments.classId))
      .where(eq(canonicalClassEnrollments.learnerPersonId,learnerPersonId))
      .orderBy(desc(canonicalClassEnrollments.enrolledAt)).limit(100);
  });
