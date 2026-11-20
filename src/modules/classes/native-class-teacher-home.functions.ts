import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { canonicalClasses, canonicalClassStaffAssignments } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { currentClassAuthority } from "./native-class-authority.server";

/** Only the exact verified CAN Site teacher and an approved, unexpired
 * per-Class teaching appointment can see a Class in their teaching index.
 * No room control, independent grader authority or learner enrollment
 * identity is inferred from this index. */
export const getMyNativeTeachingClasses=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    let actor:Awaited<ReturnType<typeof getIdentityContext>>;
    try{actor=await getIdentityContext(getRequest());}
    catch(error){
      if(error instanceof AuthorizationError)
        return {kind:"other" as const,classes:[]};
      throw error;
    }
    if(actor.role!=="teacher" || !actor.actorPersonId ||
       !!actor.sessionAccountId || !actor.grantSiteId ||
       actor.scope.siteIds?.length!==1 ||
       actor.scope.siteIds[0]!==actor.grantSiteId ||
       actor.scope.organizationIds?.length!==1 ||
       !actor.capabilities.has("teacher:read"))
      return {kind:"other" as const,classes:[]};
    const siteId=actor.grantSiteId;
    const organizationId=actor.scope.organizationIds[0]!;
    return db.transaction(async tx=>{
      const now=new Date();
      const rows=await tx.select({
        id:canonicalClasses.id,
        title:canonicalClasses.title,
        deliveryMode:canonicalClasses.deliveryMode,
        state:canonicalClasses.state,
      }).from(canonicalClassStaffAssignments)
        .innerJoin(canonicalClasses,and(
          eq(canonicalClasses.id,canonicalClassStaffAssignments.classId),
          eq(canonicalClasses.siteId,siteId),
          eq(canonicalClasses.operatingOrganizationId,organizationId),
          eq(canonicalClasses.state,"active"),
        ))
        .where(and(
          eq(canonicalClassStaffAssignments.personId,actor.actorPersonId!),
          eq(canonicalClassStaffAssignments.roleCode,"teacher"),
          eq(canonicalClassStaffAssignments.state,"approved"),
          lte(canonicalClassStaffAssignments.beginsAt,now),
          or(isNull(canonicalClassStaffAssignments.endsAt),
             gt(canonicalClassStaffAssignments.endsAt,now)),
        )).orderBy(asc(canonicalClasses.title)).limit(101);
      if(rows.length>100)throw new AuthorizationError("teacher Class directory requires pagination");
      const classes=[];
      for(const row of rows){
        try{await currentClassAuthority(tx,row.id,now);}
        catch(error){
          if(error instanceof AuthorizationError)continue;
          throw error;
        }
        classes.push({classId:row.id,title:row.title,deliveryMode:row.deliveryMode});
      }
      return {kind:"teacher" as const,classes};
    });
  });
