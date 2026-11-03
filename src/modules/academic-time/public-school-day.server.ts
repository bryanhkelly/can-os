import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, scheduleTemplatePeriods, scheduleTemplates, schoolYears, sites } from "@/db/schema";
import { projectPublicSchoolDay } from "@/domain/public-school-day";
import { publicSchoolDaySiteRevision } from "./public-school-day-site-revision.server";

/**
 * Anonymous-safe projection input for Agent A. Caller MUST first check the
 * institutional Site publication gate; this reader alone grants no hosting.
 * Neither section rosters, student calendars nor location details are fetched.
 */
export async function readApprovedPublicSchoolDay(
  siteId: string, programId: string,
  executor: Pick<typeof db, "select"> = db,
  now = new Date(),
) {
  const [scope] = await executor.select({
    timezone: sites.timezone, siteId: sites.id, siteOrganizationId: sites.organizationId,
    programId: programs.id, programSiteId: programs.siteId,
    programOrganizationId: programs.organizationId, programStatus: programs.status,
    programUpdatedAt: programs.updatedAt,siteAddress:sites.address,siteMetadata:sites.metadata,
    gradeRange: programs.gradeRange, programType: programs.type,
  }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
    .where(and(eq(sites.id, siteId), eq(programs.id, programId))).limit(1);
  if (!scope || scope.programSiteId !== siteId ||
    scope.siteOrganizationId !== scope.programOrganizationId ||
    !["ready", "active"].includes(scope.programStatus)) {
    return {...projectPublicSchoolDay([], "UTC", now), programScope:null,
      approvedProgramSchoolDays:[]};
  }
  const templates = await executor.select({
    id: scheduleTemplates.id, active: scheduleTemplates.active,
    templateUpdatedAt:scheduleTemplates.updatedAt,schoolYearId:scheduleTemplates.schoolYearId,
    programId: scheduleTemplates.programId, siteId: scheduleTemplates.siteId,
    effectiveFrom: scheduleTemplates.effectiveFrom,
    effectiveThrough: scheduleTemplates.effectiveThrough,
    metadata: scheduleTemplates.metadata,
    schoolYearStatus: schoolYears.status,
    yearUpdatedAt:schoolYears.updatedAt,schoolYearKey:schoolYears.key,
    schoolYearName:schoolYears.name,
    schoolYearSiteId: schoolYears.siteId,
    schoolYearProgramId: schoolYears.programId,
    schoolYearOrganizationId: schoolYears.organizationId,
    startsOn: schoolYears.startsOn, endsOn: schoolYears.endsOn,
    timezone: schoolYears.timezone,
  }).from(scheduleTemplates)
    .innerJoin(schoolYears, eq(schoolYears.id, scheduleTemplates.schoolYearId))
    .where(and(
      eq(scheduleTemplates.siteId, siteId), eq(scheduleTemplates.programId, programId),
      eq(schoolYears.siteId, siteId), eq(schoolYears.organizationId, scope.programOrganizationId),
      eq(schoolYears.status, "active"),
    )).limit(101);
  // A capped query cannot establish uniqueness when other active templates exist.
  if(templates.length>100) return {...projectPublicSchoolDay([],scope.timezone,now),
    programScope:null,approvedProgramSchoolDays:[]};
  const ids = templates.map(row => row.id);
  const periods = ids.length ? await executor.select({
    scheduleTemplateId: scheduleTemplatePeriods.scheduleTemplateId,
    dayOfWeek: scheduleTemplatePeriods.dayOfWeek,
    sequence:scheduleTemplatePeriods.sequence,label:scheduleTemplatePeriods.label,
    startsAtLocal: scheduleTemplatePeriods.startsAtLocal,
    endsAtLocal: scheduleTemplatePeriods.endsAtLocal,
    type: scheduleTemplatePeriods.type,
  }).from(scheduleTemplatePeriods)
    .where(inArray(scheduleTemplatePeriods.scheduleTemplateId, ids)).limit(3001) : [];
  if(periods.length>3000) return {...projectPublicSchoolDay([],scope.timezone,now),
    programScope:null,approvedProgramSchoolDays:[]};
  const projection = projectPublicSchoolDay(templates.map(row => {
    const approval = row.metadata.publicScheduleApproval;
    const verified = approval && typeof approval === "object" &&
      "status" in approval && approval.status === "approved" &&
      "revision" in approval && typeof approval.revision === "number" &&
      "reviewedByPersonId" in approval && typeof approval.reviewedByPersonId === "string" &&
      "reviewedAt" in approval && typeof approval.reviewedAt === "string" &&
      "signature" in approval && typeof approval.signature === "string"
      ? approval as {status:"approved";revision:number;reviewedByPersonId:string;reviewedAt:string;signature:string}
      : null;
    return {
      schoolYearStatus: row.schoolYearStatus, templateActive: row.active,
      programMatches: row.programId === programId &&
        (!row.schoolYearProgramId || row.schoolYearProgramId === programId),
      siteMatches: row.siteId === siteId && row.schoolYearSiteId === siteId,
      timezoneMatches: row.timezone === scope.timezone,
      startsOn: row.startsOn, endsOn: row.endsOn,
      effectiveFrom: row.effectiveFrom, effectiveThrough: row.effectiveThrough,
      approval: verified, periods: periods.filter(item => item.scheduleTemplateId === row.id),
      reviewScope:{
        siteId,programId,schoolYearId:row.schoolYearId,scheduleTemplateId:row.id,
        siteTimezone:scope.timezone,schoolYearTimezone:row.timezone,
        schoolYearStartsOn:row.startsOn,schoolYearEndsOn:row.endsOn,
        effectiveFrom:row.effectiveFrom,effectiveThrough:row.effectiveThrough,
        schoolYearKey:row.schoolYearKey,schoolYearName:row.schoolYearName,
        gradeRange:scope.gradeRange,programType:scope.programType,
        siteRevision:publicSchoolDaySiteRevision({address:scope.siteAddress,metadata:scope.siteMetadata}),
        programRevision:scope.programUpdatedAt.toISOString(),
        yearRevision:row.yearUpdatedAt.toISOString(),
        templateRevision:row.templateUpdatedAt.toISOString(),
      },
    };
  }), scope.timezone, now);
  const source=projection.approvedPatternSource;
  const approvedProgramSchoolDays=projection.weeklyPatternState==="approved" && source
    ? [{
      siteId,programId,gradeRange:scope.gradeRange,programType:scope.programType,
      schoolYearId:source.scope.schoolYearId,
      schoolYearKey:source.scope.schoolYearKey,
      schoolYearName:source.scope.schoolYearName,
      scheduleTemplateId:source.scope.scheduleTemplateId,
      timezone:scope.timezone,
      schoolYearStartsOn:source.scope.schoolYearStartsOn,
      schoolYearEndsOn:source.scope.schoolYearEndsOn,
      effectiveFrom:source.scope.effectiveFrom,
      effectiveThrough:source.scope.effectiveThrough,
      weeklyPattern:projection.weeklyPattern,
      instructionalIntervals:source.instructionalIntervals,
      scheduleApprovalStatus:"approved" as const,
      scheduleApprovalRevision:source.approval.revision,
      scheduleReviewedAt:source.approval.reviewedAt,
      kind:"standard_weekly_pattern_not_holiday_specific_calendar" as const,
      requiresSiteAndProgramMarketingApproval:true as const,
    }] : [];
  return {
    ...projection,
    // C's schedule approval is NOT a Site or Program public-marketing grant.
    // Agent A must independently enforce both institutional publish gates.
    programScope:source && approvedProgramSchoolDays.length
      ? {siteId,programId,gradeRange:scope.gradeRange,
        programType:scope.programType,schoolYearId:source.scope.schoolYearId}
      : null,
    approvedProgramSchoolDays,
  };
}
