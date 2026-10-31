import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accountPersonGrants, actions, applications, assessments, courseTemplateVersions, curriculumAdoptions,
  enrollments, journeyRequirements, journeys, people, programs, sections, sectionTeachers, submissions, terms,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { gradeResponseActionType } from "@/domain/grade-response-policy";
import { summarizeFullFlowOperations } from "@/domain/full-flow-operational-snapshot";
import { staffedPublishedSectionIds } from "@/modules/enrollment/instructional-section-readiness.server";

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
  const [sectionsRows, adoptions, applicationsRows, enrollmentRequirements, enrollmentRows, responses] = await Promise.all([
    db.select({
      id: sections.id, programId: sections.programId, active: sections.active,
      versionStatus: courseTemplateVersions.status,schoolYearId:terms.schoolYearId,
    }).from(sections).innerJoin(courseTemplateVersions,
      eq(courseTemplateVersions.id, sections.courseTemplateVersionId))
      .innerJoin(terms,eq(terms.id,sections.termId))
      .where(and(inArray(sections.programId, selected),inArray(sections.siteId, siteIds))),
    db.select({programId: curriculumAdoptions.programId, status: curriculumAdoptions.status})
      .from(curriculumAdoptions).where(inArray(curriculumAdoptions.programId, selected)),
    db.select({programId: applications.programId, stage: applications.stage})
      .from(applications).where(inArray(applications.programId, selected)),
    // The same application Journey requirements used by family readiness.
    // Only student-free status counts enter the broad operational projection.
    db.select({programId:applications.programId,status:journeyRequirements.status,
      blocking:journeyRequirements.blocking})
      .from(journeyRequirements)
      .innerJoin(journeys,eq(journeys.id,journeyRequirements.journeyId))
      .innerJoin(applications,and(eq(applications.id,journeys.participantId),
        eq(journeys.participantType,"application")))
      .where(inArray(applications.programId,selected)),
    db.select({
      programId: enrollments.programId, kind: enrollments.kind,
      status: enrollments.status, studentProfileId: enrollments.studentProfileId,
      sectionId: enrollments.sectionId,schoolYearId:enrollments.schoolYearId,
    }).from(enrollments).where(inArray(enrollments.programId, selected)),
    db.select({ programId: actions.programId, status: actions.status })
      .from(actions).where(and(
        eq(actions.type, gradeResponseActionType),
        inArray(actions.programId, selected),
        inArray(actions.siteId, siteIds),
      )),
  ]);
  const sectionIds = sectionsRows.map(s => s.id);
  const [candidateTeachers, assessmentsRows] = sectionIds.length ? await Promise.all([
    // An assignment row alone is not active staffing. Its teacher must be
    // an active Person with an active school/CAN teaching grant. This matches
    // the transactional Section allocation guard, not a launch draft.
    db.select({sectionId: sectionTeachers.sectionId, personId: sectionTeachers.personId})
      .from(sectionTeachers)
      .innerJoin(people,eq(people.id,sectionTeachers.personId))
      .innerJoin(sections,eq(sections.id,sectionTeachers.sectionId))
      .innerJoin(programs,eq(programs.id,sections.programId))
      .innerJoin(accountPersonGrants,and(
        eq(accountPersonGrants.personId,sectionTeachers.personId),
        eq(accountPersonGrants.active,true),eq(accountPersonGrants.role,"teacher"),
        or(eq(accountPersonGrants.organizationId,programs.organizationId),
           eq(accountPersonGrants.organizationId,programs.academicProviderOrganizationId)),
        or(isNull(accountPersonGrants.siteId),eq(accountPersonGrants.siteId,sections.siteId)),
      ))
      .where(and(inArray(sectionTeachers.sectionId, sectionIds),eq(people.active,true))),
    db.select({id: assessments.id, sectionId: assessments.sectionId, status: assessments.status})
      .from(assessments).where(inArray(assessments.sectionId, sectionIds)),
  ]) : [[], []];
  const readySections=await staffedPublishedSectionIds(sectionIds,db);
  // A live role grant without current CAN/church academic agreement, or a
  // draft course, cannot prove real instructional capacity on this dashboard.
  const teacherAssignments=candidateTeachers.filter(row=>readySections.has(row.sectionId));
  const assessmentIds = assessmentsRows.map(a => a.id);
  const submissionRows = assessmentIds.length ? await db.select({
    assessmentId: submissions.assessmentId, status: submissions.status,
    studentProfileId: submissions.studentProfileId,
  }).from(submissions).where(inArray(submissions.assessmentId, assessmentIds)) : [];
  return {
    asOf: new Date().toISOString(),
    ...summarizeFullFlowOperations({
      programs: visible, sections: sectionsRows, teacherAssignments, adoptions,
      applications: applicationsRows, enrollmentRequirements, enrollments: enrollmentRows,
      assessments: assessmentsRows, submissions: submissionRows, responses,
    }),
  };
}
