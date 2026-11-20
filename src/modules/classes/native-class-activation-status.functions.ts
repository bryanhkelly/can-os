import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { classParticipantDeliveries } from "@/db/schema";
import {
  canonicalClasses, canonicalClassEnrollments, canonicalClassSessions,
  canonicalDeliverySessions, facilitatedClassroomPlans,
} from "@/db/canonical-v301";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { validateClassAuthority } from "./unified-class-authority.server";

const input=z.object({classId:z.string().uuid()}).strict();

/** Operator-only read model. No contact information or alternate enrollment
 * state. Email provider acceptance is NOT recipient/inbox delivery. */
export const getNativeClassActivationStatus=createServerFn({method:"GET"})
  .validator((raw:unknown)=>input.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    const actor=await getCanonicalCommandContext(getRequest());
    if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
      throw new AuthorizationError("Class operator");
    assertCapability(actor,"class.manage");
    const [cls]=await db.select().from(canonicalClasses)
      .where(eq(canonicalClasses.id,data.classId)).limit(1);
    const organizationId=actor.scope.organizationIds?.[0];
    if(!cls||!organizationId||actor.scope.organizationIds?.length!==1||
       cls.operatingOrganizationId!==organizationId||
       (cls.siteId?!actor.scope.siteIds?.includes(cls.siteId):
         cls.createdByPersonId!==actor.actorPersonId))
      throw new AuthorizationError("authorized Class and Site");
    await db.transaction(async tx=>{
      await validateClassAuthority(tx,{actor,organizationId,siteIds:actor.scope.siteIds??[]},{
        deploymentId:cls.deploymentId,adoptionId:cls.adoptionId,
        offeringVersionId:cls.offeringVersionId,courseVersionId:cls.courseVersionId,
        operatingOrganizationId:cls.operatingOrganizationId,siteId:cls.siteId,
        title:cls.title,deliveryMode:cls.deliveryMode,
      });
    });
    const [[enrolled],[scheduled],deliveries]=await Promise.all([
      db.select({total:count()}).from(canonicalClassEnrollments)
        .where(and(eq(canonicalClassEnrollments.classId,cls.id),
          eq(canonicalClassEnrollments.status,"active"))),
      db.select({total:count()}).from(canonicalClassSessions)
        .innerJoin(facilitatedClassroomPlans,
          eq(facilitatedClassroomPlans.id,canonicalClassSessions.classroomPlanId))
        .innerJoin(canonicalDeliverySessions,
          eq(canonicalDeliverySessions.id,canonicalClassSessions.deliverySessionId))
        .where(and(eq(canonicalClassSessions.classId,cls.id),
          eq(facilitatedClassroomPlans.state,"scheduled"),
          gt(canonicalDeliverySessions.startsAt,new Date()))),
      db.select({status:classParticipantDeliveries.status,total:count()})
        .from(classParticipantDeliveries)
        .where(eq(classParticipantDeliveries.classId,cls.id))
        .groupBy(classParticipantDeliveries.status),
    ]);
    const counters={pending:0,processing:0,accepted:0,failed:0,suppressed:0};
    for(const entry of deliveries)counters[entry.status]=entry.total;
    return {
      classId:cls.id,state:cls.state,deliveryMode:cls.deliveryMode,
      enrolled:enrolled?.total??0,upcomingSessions:scheduled?.total??0,
      communications:counters,
      note:"Accepted means the email provider accepted the message, not that it reached the inbox.",
    };
  });
