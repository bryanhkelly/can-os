import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassEnrollments, canonicalClassOfferingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { currentClassAuthority } from "./native-class-authority.server";
import { studentSiteScope } from "@/domain/student-site-scope";

/** Student Class discovery is identical for real and synthetic Sites.
 * No special demo enrollment/consent pathway. New student enrollment uses
 * the standard governed Class Offering/approval service, not this GET RPC.
 */
export const getMyStudentClasses=createServerFn({method:"GET"}).handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
  let actor:Awaited<ReturnType<typeof getIdentityContext>>;
  try {actor=await getIdentityContext(getRequest());}
  catch(error){
    if(error instanceof AuthorizationError)return {kind:"other" as const,classes:[]};
    throw error;
  }
  const membership=studentSiteScope(actor);
  if(!membership){
    if(actor.role==="student")throw new AuthorizationError("exact current student Site grant");
    return {kind:"other" as const,classes:[]};
  }

  return db.transaction(async tx=>{
    const scope=and(
      eq(canonicalClasses.siteId,membership.siteId),
      eq(canonicalClasses.operatingOrganizationId,membership.organizationId),
      eq(canonicalClasses.state,"active"),
    );
    const fields={
      classId:canonicalClasses.id,title:canonicalClasses.title,
      deliveryMode:canonicalClasses.deliveryMode,
      courseVersionId:canonicalClasses.courseVersionId,
    };
    // Assigned Classes are not subject to the discovery page cap.
    const assigned=await tx.select(fields).from(canonicalClasses)
      .innerJoin(canonicalClassEnrollments,and(
        eq(canonicalClassEnrollments.classId,canonicalClasses.id),
        eq(canonicalClassEnrollments.learnerPersonId,membership.personId),
        inArray(canonicalClassEnrollments.status,["active","pending"]),
      )).where(scope);
    const discovery=await tx.select(fields).from(canonicalClasses).where(scope)
      .orderBy(asc(canonicalClasses.title),asc(canonicalClasses.id)).limit(100);
    const classes=[...new Map([...assigned,...discovery].map(item=>[item.classId,item])).values()];
    if (!classes.length) return {kind:"student" as const,classes:[]};
    const classIds=classes.map(item=>item.classId);
    // The first query has already scoped this list to the verified Person's
    // Site and operating Organization. Do not expose these rows until the
    // existing currentClassAuthority check has succeeded for each Class.
    // Bulk-read the two independent per-Class lookups to avoid N+1 round trips.
    const enrollmentRows=await tx.select({
      classId:canonicalClassEnrollments.classId,
      id:canonicalClassEnrollments.id,
      status:canonicalClassEnrollments.status,
      creditMode:canonicalClassEnrollments.creditMode,
      courseAttemptId:canonicalClassEnrollments.courseAttemptId,
    }).from(canonicalClassEnrollments).where(and(
      inArray(canonicalClassEnrollments.classId,classIds),
      eq(canonicalClassEnrollments.learnerPersonId,membership.personId),
      inArray(canonicalClassEnrollments.status,["active","pending"]),
    ));
    const offeringRows=await tx.select({
      classId:canonicalClassOfferingVersions.classId,
      enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
    }).from(canonicalClassOfferingVersions).where(and(
      inArray(canonicalClassOfferingVersions.classId,classIds),
      eq(canonicalClassOfferingVersions.state,"published"),
    ));
    const enrollmentsByClass=new Map<string,typeof enrollmentRows>();
    for(const enrollment of enrollmentRows){
      const group=enrollmentsByClass.get(enrollment.classId)??[];
      group.push(enrollment);
      enrollmentsByClass.set(enrollment.classId,group);
    }
    const offeringByClass=new Map<string,(typeof offeringRows)[number]>();
    for(const offering of offeringRows){
      if(!offeringByClass.has(offering.classId))offeringByClass.set(offering.classId,offering);
    }
    const available=[];
    const now=new Date();
    for(const item of classes){
      try{await currentClassAuthority(tx,item.classId,now);}
      catch(error){if(error instanceof AuthorizationError)continue;throw error;}
      const enrollments=enrollmentsByClass.get(item.classId)??[];
      if(enrollments.length>1)throw new AuthorizationError("ambiguous current Class enrollment");
      const offering=offeringByClass.get(item.classId);
      available.push({
        classId:item.classId,title:item.title,deliveryMode:item.deliveryMode,
        enrollmentId:enrollments[0]?.id??null,
        status:enrollments[0]?.status??"not_enrolled",
        courseAttemptId:enrollments[0]?.courseAttemptId??null,
        creditMode:enrollments[0]?.creditMode??null,
        canJoin:offering?.enrollmentMethods.includes("approval")??false,
      });
    }
    available.sort((a,b)=>a.title.localeCompare(b.title));
    return {kind:"student" as const,classes:available};
  });
});
