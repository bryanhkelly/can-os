/**
 * A read-only projection of actual canonical Program, curriculum, enrollment,
 * classroom and response records. No independently invented "ready" flags.
 */
export type FullFlowRows = {
  programs: Array<{id:string;name:string;status:string;type:string;siteId:string|null;
    academicProviderOrganizationId:string;creditIssuingOrganizationId:string|null}>;
  sections: Array<{id:string;programId:string;active:boolean;versionStatus:string;schoolYearId:string}>;
  teacherAssignments: Array<{sectionId:string;personId:string}>;
  adoptions: Array<{programId:string;status:string}>;
  applications: Array<{programId:string;stage:string}>;
  enrollmentRequirements?: Array<{programId:string;status:string;blocking:boolean}>;
  enrollments: Array<{programId:string|null;kind:string;status:string;
    studentProfileId:string;sectionId:string|null;schoolYearId:string|null}>;
  assessments: Array<{id:string;sectionId:string;status:string}>;
  submissions: Array<{assessmentId:string;status:string;studentProfileId:string}>;
  responses: Array<{programId:string|null;status:string}>;
};

export function summarizeFullFlowOperations(rows: FullFlowRows) {
  const result = rows.programs.map(program => {
    const sections = rows.sections.filter(s => s.programId === program.id && s.active);
    const sectionIds = new Set(sections.map(section => section.id));
    const teachers = new Set(rows.teacherAssignments.filter(t => sectionIds.has(t.sectionId))
      .map(t => t.sectionId));
    // An active enrollment into an unstaffed or unpublished Section must
    // not count as first-student-to-class completion.
    const instructionalYears = new Map(sections.filter(section =>
      section.versionStatus === "published" && teachers.has(section.id))
      .map(section => [section.id,section.schoolYearId] as const));
    const assessments = rows.assessments.filter(a => sectionIds.has(a.sectionId) &&
      (a.status === "published" || a.status === "closed"));
    const assessmentIds = new Set(assessments.map(a => a.id));
    const work = rows.submissions.filter(s => assessmentIds.has(s.assessmentId));
    const enrolled = rows.enrollments.filter(e => e.programId === program.id && e.status === "active");
    const programStudents = new Set(enrolled.filter(e => e.kind === "program").map(e => e.studentProfileId));
    const studentProgramYears = new Set(enrolled.filter(e => e.kind === "program" && e.schoolYearId)
      .map(e => `${e.studentProfileId}:${e.schoolYearId}`));
    // Enrollment into an older or different school year's Section cannot
    // satisfy the current Program enrollment-to-class handoff.
    const placedStudents = new Set(enrolled.filter(e => e.kind === "section" &&
      !!e.sectionId && !!e.schoolYearId &&
      instructionalYears.get(e.sectionId) === e.schoolYearId &&
      studentProgramYears.has(`${e.studentProfileId}:${e.schoolYearId}`))
      .map(e => e.studentProfileId));
    const unresolved = rows.responses.filter(a => a.programId === program.id &&
      ["open","in_progress","waiting"].includes(a.status)).length;
    const applications = rows.applications.filter(a => a.programId === program.id);
    const outstandingRequirements = (rows.enrollmentRequirements ?? []).filter(requirement =>
      requirement.programId === program.id && requirement.blocking && requirement.status !== "complete").length;
    return {
      id: program.id, name: program.name, status: program.status, type: program.type,
      siteId: program.siteId,
      academicProviderOrganizationId: program.academicProviderOrganizationId,
      creditIssuingOrganizationId: program.creditIssuingOrganizationId,
      counts: {
        adoptedCurriculumPacks: rows.adoptions.filter(a => a.programId === program.id && a.status === "active").length,
        sections: sections.length,
        publishedSections: sections.filter(s => s.versionStatus === "published").length,
        staffedSections: teachers.size,
        applications: applications.length,
        incomingApplications: applications.filter(a => ["lead","inquiry","application","eligibility"].includes(a.stage)).length,
        outstandingEnrollmentRequirements: outstandingRequirements,
        acceptedApplications: applications.filter(a => a.stage === "accepted").length,
        activeProgramStudents: programStudents.size,
        placedStudents: placedStudents.size,
        publishedAssessments: assessments.length,
        submittedWork: work.filter(s => s.status === "submitted").length,
        gradedWork: work.filter(s => s.status === "graded").length,
        unresolvedGuardianResponses: unresolved,
      },
    };
  });
  const keys = [
    "adoptedCurriculumPacks", "sections", "publishedSections", "staffedSections",
    "applications", "incomingApplications", "outstandingEnrollmentRequirements", "acceptedApplications",
    "activeProgramStudents", "placedStudents", "publishedAssessments", "submittedWork", "gradedWork",
    "unresolvedGuardianResponses",
  ] as const;
  const totals = Object.fromEntries(keys.map(key => [
    key, result.reduce((sum, item) => sum + item.counts[key], 0),
  ])) as Record<typeof keys[number], number>;
  return { programs: result, totals };
}
