import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { approvePublicSchoolDay } from "./public-school-day-approval.server";
import { db } from "@/db/client";
import { programs,scheduleTemplatePeriods,scheduleTemplates,schoolYears } from "@/db/schema";
import { and,eq,inArray } from "drizzle-orm";
import { requireSitePublisher } from "@/modules/sites/site-publication.server";
import { publicSchoolDayScheduleSignature } from "@/domain/public-school-day";

/** Explicit institutional review of the already-saved academic timetable. */
export const approveSchoolDayPublicSummary = createServerFn({method:"POST"})
  .validator((value:unknown)=>z.object({
    siteId:z.string().uuid(),programId:z.string().uuid(),
    scheduleTemplateId:z.string().uuid(),
    expectedRevision:z.number().int().nonnegative(),
    reviewed:z.literal(true),
  }).strict().parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    return approvePublicSchoolDay(actor,data);
  });

/** Reviewer view of canonical active templates; no children, rosters or private rooms. */
export const listPublicSchoolDayReviews=createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({
    siteId:z.string().uuid(),programId:z.string().uuid(),
  }).strict().parse(value))
  .handler(async ({data})=>{
    const actor=await getCommandContext(getRequest());
    const site=await requireSitePublisher(actor,data.siteId);
    if(!actor.scope.programIds?.includes(data.programId))
      throw new Error("Program outside publication scope");
    const [program]=await db.select({siteId:programs.siteId,organizationId:programs.organizationId})
      .from(programs).where(eq(programs.id,data.programId)).limit(1);
    if(!program||program.siteId!==site.id||program.organizationId!==site.organizationId)
      throw new Error("Program does not belong to this Site");
    const templates=await db.select({
      id:scheduleTemplates.id,name:scheduleTemplates.name,
      active:scheduleTemplates.active,metadata:scheduleTemplates.metadata,
      yearStatus:schoolYears.status,
    }).from(scheduleTemplates)
      .innerJoin(schoolYears,eq(schoolYears.id,scheduleTemplates.schoolYearId))
      .where(and(eq(scheduleTemplates.siteId,site.id),
        eq(scheduleTemplates.programId,data.programId),
        eq(schoolYears.siteId,site.id),
        eq(schoolYears.organizationId,site.organizationId),
        eq(schoolYears.status,"active"))).limit(30);
    const ids=templates.map(item=>item.id);
    const periods=ids.length?await db.select({
      scheduleTemplateId:scheduleTemplatePeriods.scheduleTemplateId,
      dayOfWeek:scheduleTemplatePeriods.dayOfWeek,
      startsAtLocal:scheduleTemplatePeriods.startsAtLocal,
      endsAtLocal:scheduleTemplatePeriods.endsAtLocal,
      type:scheduleTemplatePeriods.type,
    }).from(scheduleTemplatePeriods)
      .where(inArray(scheduleTemplatePeriods.scheduleTemplateId,ids)).limit(3000):[];
    return templates.map(template=>{
      const source=template.metadata.publicScheduleApproval;
      const approved=source&&typeof source==="object"?source as Record<string,unknown>:{};
      const schedulePeriods=periods.filter(item=>item.scheduleTemplateId===template.id);
      return {
        id:template.id,name:template.name,
        active:template.active,
        periods:schedulePeriods,
        revision:typeof approved.revision==="number"?approved.revision:0,
        currentApproval:approved.status==="approved" &&
          approved.signature===publicSchoolDayScheduleSignature(schedulePeriods),
      };
    });
  });
