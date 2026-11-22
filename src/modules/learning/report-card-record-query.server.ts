import type { CommandContext } from "@/domain/command-context";
import { readSectionGradeEvidence } from "@/domain/section-grade-evidence";
import { isPassingGrade } from "@/domain/grade-scale-policy";
import { verifiedSectionCreditUnits } from "@/domain/section-credit-policy";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";

type DbClient = (typeof import("@/db/client"))["db"];
type Schema = typeof import("@/db/schema");

type Viewer = {
  context: CommandContext;
  studentProfileId: string;
  siteIds: string[];
  programIds: string[];
  delegatedPrograms?: Array<{programId:string;siteId:string}>;
  historicalStudentAccess?: boolean;
};

/** Read-only official record projection. Every query also constrains the
 * exact StudentProfile; only eligible authenticated students or guardians
 * may use historical access, and issuance has a separate authorization path.
 */
/** Institutional pairs are query-local, never the account's global school scope. */
export function authorizedRecordSections(s: Schema, viewer: Viewer) {
  // Every call to the grade/withdrawal readers also constrains the exact
  // StudentProfile ID. This flag is never set on issuer/registrar viewers.
  if(viewer.historicalStudentAccess)return sql`true`;
  const local=and(inArray(s.sections.siteId,viewer.siteIds),
    inArray(s.sections.programId,viewer.programIds));
  const delegated=(viewer.delegatedPrograms??[]).map(pair=>and(
    eq(s.sections.siteId,pair.siteId),eq(s.sections.programId,pair.programId),
  ));
  return delegated.length ? or(local,...delegated) : local;
}



/** Finalized section grades with display context, scoped to the viewer's sites. */
export async function finalizedGradeRows(
  db: DbClient,
  s: Schema,
  viewer: Viewer,
  gradingPeriodId?: string,
) {
  const rows = await db
    .select({
      sectionGradeId: s.sectionGrades.id,
      sectionId: s.sectionGrades.sectionId,
      sectionTitle: s.sections.title,
      courseTemplateVersionId:s.courseTemplateVersions.id,
      courseTemplateVersion:s.courseTemplateVersions.version,
      metadata:s.sectionGrades.metadata,
      subject:s.courseTemplates.subject,
      sectionMetadata:s.sections.metadata,
      gradingPeriodId: s.sectionGrades.gradingPeriodId,
      gradingPeriodSequence:s.gradingPeriods.sequence,
      gradingPeriodName: s.gradingPeriods.name,
      termId: s.sectionGrades.termId,
      termName: s.terms.name,
      termSequence: s.terms.sequence,
      schoolYearId: s.schoolYears.id,
      schoolYearName: s.schoolYears.name,
      letterGrade: s.sectionGrades.letterGrade,
      percentage: s.sectionGrades.percentage,
      score: s.sectionGrades.score,
      gradeScaleId: s.sectionGrades.gradeScaleId,
      finalizedAt: s.sectionGrades.finalizedAt,
      gradeUpdatedAt: s.sectionGrades.updatedAt,
      programName: s.programs.name,
      creditIssuingOrganizationId: sql<string>`${s.programs.creditIssuingOrganizationId}`,
      creditIssuingOrganization: s.organizations.name,
    })
    .from(s.sectionGrades)
    .innerJoin(s.sections, eq(s.sections.id, s.sectionGrades.sectionId))
    .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
    .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
    .innerJoin(s.gradingPeriods, eq(s.gradingPeriods.id, s.sectionGrades.gradingPeriodId))
    .innerJoin(s.terms, eq(s.terms.id, s.sectionGrades.termId))
    .innerJoin(s.schoolYears, eq(s.schoolYears.id, s.terms.schoolYearId))
    .innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
    .innerJoin(s.organizations, eq(s.organizations.id, s.programs.creditIssuingOrganizationId))
    .where(
      and(
        eq(s.sectionGrades.studentProfileId, viewer.studentProfileId),
        eq(s.sectionGrades.status, "finalized"),
        authorizedRecordSections(s,viewer),
        gradingPeriodId ? eq(s.sectionGrades.gradingPeriodId, gradingPeriodId) : undefined,
      ),
    )
    .orderBy(
      desc(s.schoolYears.startsOn),
      asc(s.terms.sequence),
      asc(s.gradingPeriods.sequence),
      asc(s.sections.title),
    );
  const periodRows=rows.length?await db.select({termId:s.gradingPeriods.termId,
    sequence:s.gradingPeriods.sequence}).from(s.gradingPeriods)
    .where(inArray(s.gradingPeriods.termId,[...new Set(rows.map(row=>row.termId))])):[];
  const lastPeriod=new Map<string,number>();
  for(const p of periodRows)lastPeriod.set(p.termId,Math.max(lastPeriod.get(p.termId)??0,p.sequence));
  const scaleIds=[...new Set(rows.map(row=>row.gradeScaleId).filter((id):id is string=>Boolean(id)))];
  const scaleRows=scaleIds.length?await db.select({id:s.gradeScales.id,configuration:s.gradeScales.configuration})
    .from(s.gradeScales).where(inArray(s.gradeScales.id,scaleIds)):[];
  const scalesById=new Map(scaleRows.map(scale=>[scale.id,scale.configuration] as const));
  return rows.map((row) => {
    const { sectionMetadata, gradeScaleId, metadata, ...rest } = row;
    const configuration=gradeScaleId?scalesById.get(gradeScaleId):null;
    if(gradeScaleId&&!configuration)throw new Error("Finalized grade scale is unavailable");
    const passes=isPassingGrade(row.letterGrade,configuration);
    const creditUnits=verifiedSectionCreditUnits(sectionMetadata);
    const terminalPeriod=row.gradingPeriodSequence===lastPeriod.get(row.termId);
    return {
      ...rest,
      gradeEvidence:readSectionGradeEvidence(metadata?.gradeEvidence),
      finalizedAt: row.finalizedAt?.toISOString() ?? null,
      creditConfigured:creditUnits!==null,
      terminalPeriod,
      creditsAttempted:terminalPeriod?creditUnits:0,
      creditsEarned:terminalPeriod?(creditUnits===null?null:passes?creditUnits:0):0,
    };
  });
}

