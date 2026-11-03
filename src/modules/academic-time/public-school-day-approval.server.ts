import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, programs, scheduleTemplates, scheduleTemplatePeriods, schoolYears, sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { publicSchoolDayScheduleSignature, isIndependentPublicScheduleReviewer } from "@/domain/public-school-day";
import { writeAudit } from "@/platform/mutation";
import { requireSitePublisher } from "@/modules/sites/site-publication.server";
import { publicSchoolDaySiteRevision } from "./public-school-day-site-revision.server";
import { competingActiveSchoolDaySchedules } from "@/domain/public-school-day";

/**
 * Explicit institutional marketing review of canonical timetable.
 * Not an authorization to open or evidence of safeguarding/attendance compliance.
 * Schedule changes automatically invalidate the content signature.
 */
export async function approvePublicSchoolDay(actor: AccessContext, input: {
  siteId: string; programId: string; scheduleTemplateId: string;
  expectedRevision: number; reviewed: true;
}) {
  if (!input.reviewed || !actor.actorPersonId)
    throw new Error("Institutional schedule review required");
  return db.transaction(async tx => {
    const site = await requireSitePublisher(actor, input.siteId, tx);
    if (!actor.scope.programIds?.includes(input.programId))
      throw new Error("Program not in authorized publication scope");
    // Serialize against the authoritative Site address/timezone editor.
    const [siteRecord]=await tx.select({
      timezone:sites.timezone,address:sites.address,metadata:sites.metadata,
    }).from(sites).where(eq(sites.id,site.id)).for("update").limit(1);
    if(!siteRecord)throw new Error("Approved schedule Site is unavailable");
    const [schedule] = await tx.select({
      id:scheduleTemplates.id, active:scheduleTemplates.active,
      templateUpdatedAt:scheduleTemplates.updatedAt,
      siteId:scheduleTemplates.siteId, programId:scheduleTemplates.programId,
      schoolYearId:scheduleTemplates.schoolYearId,
      effectiveFrom:scheduleTemplates.effectiveFrom,
      effectiveThrough:scheduleTemplates.effectiveThrough,
      metadata:scheduleTemplates.metadata,
      yearStatus:schoolYears.status, yearSiteId:schoolYears.siteId,
      yearProgramId:schoolYears.programId, yearOrgId:schoolYears.organizationId,
      yearTimezone:schoolYears.timezone,yearUpdatedAt:schoolYears.updatedAt,
      yearKey:schoolYears.key,yearName:schoolYears.name,
      startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn,
      programSiteId:programs.siteId, programOrgId:programs.organizationId,
      programStatus:programs.status,programUpdatedAt:programs.updatedAt,
      programType:programs.type,gradeRange:programs.gradeRange,
    }).from(scheduleTemplates)
      .innerJoin(schoolYears,eq(schoolYears.id,scheduleTemplates.schoolYearId))
      .innerJoin(programs,eq(programs.id,scheduleTemplates.programId))
      .where(and(eq(scheduleTemplates.id,input.scheduleTemplateId),
        eq(scheduleTemplates.siteId,site.id),
        eq(scheduleTemplates.programId,input.programId))).for("update",{of:scheduleTemplates}).limit(1);
    if (!schedule || !schedule.active || schedule.yearStatus !== "active" ||
      schedule.yearSiteId !== site.id ||
      (schedule.yearProgramId && schedule.yearProgramId !== input.programId) ||
      schedule.yearOrgId !== site.organizationId ||
      schedule.yearTimezone!==siteRecord.timezone ||
      schedule.programSiteId !== site.id || schedule.programOrgId !== site.organizationId ||
      !["ready","active"].includes(schedule.programStatus))
      throw new Error("Only the matching active academic schedule may be approved");
    const old = schedule.metadata.publicScheduleApproval;
    const oldRevision = old && typeof old === "object" &&
      "revision" in old && typeof old.revision === "number" ? old.revision : 0;
    if (oldRevision !== input.expectedRevision)
      throw new Error("Schedule approval changed. Refresh before reviewing.");
    // Independent authorization: the person who last authored or edited the
    // timetable must not approve their own schedule for parents.
    const [authoring]=await tx.select({
      actorPersonId:auditEvents.actorPersonId,
      action:auditEvents.action,
    }).from(auditEvents).where(and(
      eq(auditEvents.resourceType,"schedule_template"),
      eq(auditEvents.resourceId,schedule.id),
      inArray(auditEvents.action,["schedule_template.create","schedule.periods.replace"]),
    )).orderBy(desc(auditEvents.occurredAt)).limit(1);
    if(!isIndependentPublicScheduleReviewer(actor.actorPersonId,
      authoring?.actorPersonId??null))
      throw new Error("Independent academic schedule reviewer required; last schedule editor cannot approve their own timetable");
    const overlapping=await tx.select({
      id:scheduleTemplates.id,active:scheduleTemplates.active,
      startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn,
      effectiveFrom:scheduleTemplates.effectiveFrom,
      effectiveThrough:scheduleTemplates.effectiveThrough,
      schoolYearStatus:schoolYears.status,
      programId:scheduleTemplates.programId,siteId:scheduleTemplates.siteId,
      schoolYearSiteId:schoolYears.siteId,
      schoolYearProgramId:schoolYears.programId,
    }).from(scheduleTemplates)
      .innerJoin(schoolYears,eq(schoolYears.id,scheduleTemplates.schoolYearId))
      .where(and(eq(scheduleTemplates.programId,input.programId),
        eq(scheduleTemplates.siteId,site.id),eq(scheduleTemplates.active,true),
        eq(schoolYears.status,"active"))).limit(101);
    if(overlapping.length>100 || competingActiveSchoolDaySchedules(overlapping.map(item=>({
      ...item,templateActive:item.active,programMatches:item.programId===input.programId &&
        (!item.schoolYearProgramId||item.schoolYearProgramId===input.programId),
      siteMatches:item.siteId===site.id && item.schoolYearSiteId===site.id,
    })),{
      schoolYearStartsOn:schedule.startsOn,
      schoolYearEndsOn:schedule.endsOn,
      effectiveFrom:schedule.effectiveFrom,
      effectiveThrough:schedule.effectiveThrough,
    }))
      throw new Error("Another active Program timetable overlaps the selected effective dates; resolve it before public approval");
    const periods = await tx.select({
      dayOfWeek:scheduleTemplatePeriods.dayOfWeek,
      sequence:scheduleTemplatePeriods.sequence,
      label:scheduleTemplatePeriods.label,
      startsAtLocal:scheduleTemplatePeriods.startsAtLocal,
      endsAtLocal:scheduleTemplatePeriods.endsAtLocal,
      type:scheduleTemplatePeriods.type,
    }).from(scheduleTemplatePeriods)
      .where(eq(scheduleTemplatePeriods.scheduleTemplateId,schedule.id));
    if (!periods.some(item=>item.type==="instruction" &&
      item.dayOfWeek>=0 && item.dayOfWeek<=6 &&
      item.startsAtLocal<item.endsAtLocal))
      throw new Error("Add valid instructional periods before publishing");
    const approvalTime=new Date();
    const approvalScope={
      siteId:site.id,programId:input.programId,
      schoolYearId:schedule.schoolYearId,scheduleTemplateId:schedule.id,
      siteTimezone:siteRecord.timezone,schoolYearTimezone:schedule.yearTimezone,
      schoolYearStartsOn:schedule.startsOn,schoolYearEndsOn:schedule.endsOn,
      effectiveFrom:schedule.effectiveFrom,effectiveThrough:schedule.effectiveThrough,
      schoolYearKey:schedule.yearKey,schoolYearName:schedule.yearName,
      gradeRange:schedule.gradeRange,programType:schedule.programType,
      siteRevision:publicSchoolDaySiteRevision(siteRecord),
      programRevision:schedule.programUpdatedAt.toISOString(),
      yearRevision:schedule.yearUpdatedAt.toISOString(),
      templateRevision:approvalTime.toISOString(),
    };
    const approval={
      status:"approved" as const,revision:oldRevision+1,
      reviewedByPersonId:actor.actorPersonId,
      reviewedAt:approvalTime.toISOString(),
      signature:publicSchoolDayScheduleSignature(periods,approvalScope),
    };
    await tx.update(scheduleTemplates).set({
      metadata:{...schedule.metadata,publicScheduleApproval:approval},
      updatedAt:approvalTime,
    }).where(eq(scheduleTemplates.id,schedule.id));
    await writeAudit(tx,actor,{
      action:"academic_schedule.public_review",
      entityType:"schedule_template",entityId:schedule.id,
      scope:{organizationId:site.organizationId,siteId:site.id,programId:input.programId},
      before:{revision:oldRevision},
      after:{revision:approval.revision,periodCount:periods.length,reviewed:true,
        schoolYearId:schedule.schoolYearId,signatureVersion:2},
    });
    return {scheduleTemplateId:schedule.id,revision:approval.revision};
  });
}
