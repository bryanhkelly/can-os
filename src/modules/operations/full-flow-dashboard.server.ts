import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions, applications, assessments, courseTemplateVersions, curriculumAdoptions,
  enrollments, programs, sections, sectionTeachers, submissions,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { gradeResponseActionType } from "@/domain/grade-response-policy";
import { summarizeFullFlowOperations } from "@/domain/full-flow-operational-snapshot";

/**
 * The school operational dashboard is a live join/projection of the very same
 * records created by launch, curriculum, admissions and classroom commands.
 * Both site AND program membership are required, with tenant ownership
 * checked in SQL. The projection returns aggregate counts, not student PII.
 */
export async function readFullFlowOperations(actor: AccessContext) {
  if (actor.role !== "registrar" || !actor.actorPersonId)
    throw new AuthorizationError("authorized school operations membership");
  assertCapability(actor, "program.launch.start");
  const orgIds = actor.scope.organizationIds ?? [];
  const siteIds = actor.scope.siteIds ?? [];
  const programIds = actor.scope.programIds ?? [];
  const empty = summarizeFullFlowOperations({
    programs: [], sections: [], teacherAssignments: [], adoptions: [],
    applications: [], enrollments: [], assessments: [], submissions: [], responses: [],
  });
  if (!orgIds.length || !siteIds.length || !programIds.length)
    return { asOf: new Date().toISOString(), ...empty };

  const visible = await db.select({
    id: programs.id, name: programs.name, type: programs.type,
    status: programs.status, siteId: programs.siteId,
    academicProviderOrganizationId: programs.academicProviderOrganizationId,
    creditIssuingOrganizationId: programs.creditIssuingOrganizationId,
  }).from(programs).where(and(
    inArray(programs.organizationId, orgIds),
    inArray(programs.siteId, siteIds),
    inArray(programs.id, programIds),
  ));
  if (!visible.length) return { asOf: new Date().toISOString(), ...empty };
  const selected = visible.map(p => p.id);
  const [sectionsRows, adoptions, applicationsRows, enrollmentRows, responses] = await Promise.all([
    db.select({
      id: sections.id, programId: sections.programId, active: sections.active,
      versionStatus: courseTemplateVersions.status,
    }).from(sections).innerJoin(courseTemplateVersions,
      eq(courseTemplateVersions.id, sections.courseTemplateVersionId))
      .where(and(inArray(sections.programId, selected),inArray(sections.siteId, siteIds))),
    db.select({programId: curriculumAdoptions.programId, status: curriculumAdoptions.status})
      .from(curriculumAdoptions).where(inArray(curriculumAdoptions.programId, selected)),
    db.select({programId: applications.programId, stage: applications.stage})
      .from(applications).where(inArray(applications.programId, selected)),
    db.select({
      programId: enrollments.programId, kind: enrollments.kind,
      status: enrollments.status, studentProfileId: enrollments.studentProfileId,
      sectionId: enrollments.sectionId,
    }).from(enrollments).where(inArray(enrollments.programId, selected)),
    db.select({ programId: actions.programId, status: actions.status })
      .from(actions).where(and(
        eq(actions.type, gradeResponseActionType),
        inArray(actions.programId, selected),
        inArray(actions.siteId, siteIds),
      )),
  ]);
  const sectionIds = sectionsRows.map(s => s.id);
  const [teacherAssignments, assessmentsRows] = sectionIds.length ? await Promise.all([
    db.select({sectionId: sectionTeachers.sectionId, personId: sectionTeachers.personId})
      .from(sectionTeachers).where(inArray(sectionTeachers.sectionId, sectionIds)),
    db.select({id: assessments.id, sectionId: assessments.sectionId, status: assessments.status})
      .from(assessments).where(inArray(assessments.sectionId, sectionIds)),
  ]) : [[], []];
  const assessmentIds = assessmentsRows.map(a => a.id);
  const submissionRows = assessmentIds.length ? await db.select({
    assessmentId: submissions.assessmentId, status: submissions.status,
    studentProfileId: submissions.studentProfileId,
  }).from(submissions).where(inArray(submissions.assessmentId, assessmentIds)) : [];
  return {
    asOf: new Date().toISOString(),
    ...summarizeFullFlowOperations({
      programs: visible, sections: sectionsRows, teacherAssignments, adoptions,
      applications: applicationsRows, enrollments: enrollmentRows,
      assessments: assessmentsRows, submissions: submissionRows, responses,
    }),
  };
}
