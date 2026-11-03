import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, scheduleTemplatePeriods, scheduleTemplates, schoolYears, sites } from "@/db/schema";
import { projectPublicSchoolDay } from "@/domain/public-school-day";

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
    gradeRange: programs.gradeRange, programType: programs.type,
  }).from(programs).innerJoin(sites, eq(sites.id, programs.siteId))
    .where(and(eq(sites.id, siteId), eq(programs.id, programId))).limit(1);
  if (!scope || scope.programSiteId !== siteId ||
    scope.siteOrganizationId !== scope.programOrganizationId ||
    !["ready", "active"].includes(scope.programStatus)) {
    return {...projectPublicSchoolDay([], "UTC", now), programScope:null};
  }
  const templates = await executor.select({
    id: scheduleTemplates.id, active: scheduleTemplates.active,
    programId: scheduleTemplates.programId, siteId: scheduleTemplates.siteId,
    effectiveFrom: scheduleTemplates.effectiveFrom,
    effectiveThrough: scheduleTemplates.effectiveThrough,
    metadata: scheduleTemplates.metadata,
    schoolYearStatus: schoolYears.status,
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
    )).limit(30);
  const ids = templates.map(row => row.id);
  const periods = ids.length ? await executor.select({
    scheduleTemplateId: scheduleTemplatePeriods.scheduleTemplateId,
    dayOfWeek: scheduleTemplatePeriods.dayOfWeek,
    startsAtLocal: scheduleTemplatePeriods.startsAtLocal,
    endsAtLocal: scheduleTemplatePeriods.endsAtLocal,
    type: scheduleTemplatePeriods.type,
  }).from(scheduleTemplatePeriods)
    .where(inArray(scheduleTemplatePeriods.scheduleTemplateId, ids)).limit(3000) : [];
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
    };
  }), scope.timezone, now);
  return {
    ...projection,
    // Program attribution and grade span are NOT independently approved
    // marketing claims. Agent A must still check the institutional Program gate.
    programScope:projection.weeklyPatternState === "approved"
      ? {siteId,programId,gradeRange:scope.gradeRange,programType:scope.programType}
      : null,
  };
}
