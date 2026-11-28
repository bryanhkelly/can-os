import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { canonicalClasses, canonicalClassStaffAssignments } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { getIdentityContext } from "@/modules/identity/command-context.server";
import { nativeClassWorkRows,nativeOverdueWorkPredicate } from "./native-class-work-query.server";
import { currentClassAuthority } from "./native-class-authority.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

async function currentTeacher(){
    let actor:Awaited<ReturnType<typeof getIdentityContext>>;
    try{actor=await getIdentityContext(getRequest());}
    catch(error){
      if(error instanceof AuthorizationError)
        return null;
      throw error;
    }
    if(actor.role!=="teacher" || !actor.actorPersonId ||
       !!actor.sessionAccountId || !actor.grantSiteId ||
       actor.scope.siteIds?.length!==1 ||
       actor.scope.siteIds[0]!==actor.grantSiteId ||
       actor.scope.organizationIds?.length!==1 ||
       !actor.capabilities.has("teacher:read"))
      return null;
    // Reuse the canonical session boundary, including its mixed-cookie denial.
    // A recognized teacher with a conflicting session must not silently fall
    // back to a legacy dashboard or gain a second role.
    await getCanonicalCommandContext(getRequest());
    return actor;
}

async function readTeachingClasses(tx:Tx,actor:NonNullable<Awaited<ReturnType<typeof currentTeacher>>>){
    const siteId=actor.grantSiteId!;
    const organizationId=actor.scope.organizationIds![0]!;
    const now=new Date();
      const rows=await tx.selectDistinct({
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
        )).orderBy(asc(canonicalClasses.title),asc(canonicalClasses.id)).limit(101);
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
      return classes;
}

/** One scoped directory for Class navigation and Teacher Today. */
export const getMyNativeTeachingClasses=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await currentTeacher();
    if(!actor)return {kind:"other" as const,classes:[]};
    return db.transaction(async tx=>({
      kind:"teacher" as const,classes:await readTeachingClasses(tx,actor),
    }));
  });

/** Current native Class work only. Missing work follows the same official
 * assignment and active Course Attempt joins as the learner homework reader.
 * Submitted work is a review count, not an official grading obligation. */
export const getNativeTeacherToday=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    setResponseHeader("Referrer-Policy","no-referrer");
    const actor=await currentTeacher();
    if(!actor)return {kind:"other" as const,classes:[]};
    return db.transaction(async tx=>{
      const classes=await readTeachingClasses(tx,actor);
      if(!classes.length)return {kind:"teacher" as const,classes:[]};
      const ids=sql.join(classes.map(item=>sql`${item.classId}::uuid`),sql`, `);
      const result=await tx.execute(sql`
        WITH class_work AS (
          ${nativeClassWorkRows(classes.map(item=>item.classId))}
        ), rosters AS (
          SELECT class_id,count(*)::int AS enrollment_count
          FROM public.class_enrollments
          WHERE class_id IN (${ids}) AND status='active'
          GROUP BY class_id
        ), work AS (
          SELECT class_id,
            count(*) FILTER (WHERE submission_status='submitted')::int AS review_count,
            count(*) FILTER (WHERE ${nativeOverdueWorkPredicate})::int AS overdue_count
          FROM class_work GROUP BY class_id
        )
        SELECT r.class_id,r.enrollment_count,
          coalesce(w.review_count,0) AS review_count,coalesce(w.overdue_count,0) AS overdue_count
        FROM rosters r LEFT JOIN work w ON w.class_id=r.class_id
      `);
      const byClass=new Map((result.rows as Array<{
        class_id:string;enrollment_count:number;review_count:number;overdue_count:number;
      }>).map(row=>[row.class_id,row]));
      return {kind:"teacher" as const,classes:classes.map(item=>{
        const counts=byClass.get(item.classId);
        return {...item,enrollmentCount:Number(counts?.enrollment_count??0),
          reviewCount:Number(counts?.review_count??0),overdueCount:Number(counts?.overdue_count??0)};
      })};
    });
  });
