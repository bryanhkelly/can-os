import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  canonicalClasses, canonicalClassEnrollments, canonicalClassOfferingVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { currentClassAuthority } from "./native-class-authority.server";

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
  if(actor.role!=="student" || !actor.actorPersonId ||
     !actor.grantSiteId || actor.scope.siteIds?.length!==1 ||
     actor.scope.siteIds[0]!==actor.grantSiteId ||
     actor.scope.organizationIds?.length!==1 ||
     !actor.capabilities.has("student:read"))
    return {kind:"other" as const,classes:[]};

  return db.transaction(async tx=>{
    const classes=await tx.select({
      classId:canonicalClasses.id,title:canonicalClasses.title,
      deliveryMode:canonicalClasses.deliveryMode,
      courseVersionId:canonicalClasses.courseVersionId,
    }).from(canonicalClasses).where(and(
      eq(canonicalClasses.siteId,actor.grantSiteId!),
      eq(canonicalClasses.operatingOrganizationId,actor.scope.organizationIds![0]!),
      eq(canonicalClasses.state,"active"),
    )).limit(100);
    const available=[];
    for(const item of classes){
      try{await currentClassAuthority(tx,item.classId,new Date());}
      catch(error){if(error instanceof AuthorizationError)continue;throw error;}
      const enrollments=await tx.select({
        id:canonicalClassEnrollments.id,
        status:canonicalClassEnrollments.status,
        courseAttemptId:canonicalClassEnrollments.courseAttemptId,
      }).from(canonicalClassEnrollments).where(and(
        eq(canonicalClassEnrollments.classId,item.classId),
        eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId!),
        inArray(canonicalClassEnrollments.status,["active","pending"]),
      )).limit(2);
      if(enrollments.length>1)throw new AuthorizationError("ambiguous current Class enrollment");
      const offering=await tx.select({
        id:canonicalClassOfferingVersions.id,
        enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
      }).from(canonicalClassOfferingVersions).where(and(
          eq(canonicalClassOfferingVersions.classId,item.classId),
          eq(canonicalClassOfferingVersions.state,"published"),
        )).limit(1);
      available.push({
        classId:item.classId,title:item.title,deliveryMode:item.deliveryMode,
        enrollmentId:enrollments[0]?.id??null,
        status:enrollments[0]?.status??"not_enrolled",
        courseAttemptId:enrollments[0]?.courseAttemptId??null,
        canJoin:offering.some(version=>version.enrollmentMethods.includes("approval")),
      });
    }
    available.sort((a,b)=>a.title.localeCompare(b.title));
    return {kind:"student" as const,classes:available};
  });
});
