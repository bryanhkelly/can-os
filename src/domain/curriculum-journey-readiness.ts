/**
 * Read-only operational evidence, not an end-to-end test result.
 * Counts come from real scoped tables and are never treated as academic credit.
 */
export type JourneyClassEvidence = {
 id:string;title:string;code:string;courseVersionId:string;
 publishedLessonCount:number;teacherCount:number;studentCount:number;
 assignedAssessmentCount:number;submittedAttemptCount:number;gradedAttemptCount:number;
};
export type JourneyEvidence = {
 installedPacks:number;adoptedPacks:number;adoptedCourseVersions:number;
 classes:JourneyClassEvidence[];
};
export function summarizeCurriculumJourney(evidence:JourneyEvidence){
 const classes=evidence.classes;
 return {
  packsInstalled:evidence.installedPacks,
  packsAdopted:evidence.adoptedPacks,
  courseVersionsAvailable:evidence.adoptedCourseVersions,
  classesUsingAdoptedCourses:classes.length,
  classesWithLessons:classes.filter(c=>c.publishedLessonCount>0).length,
  classesWithTeachers:classes.filter(c=>c.teacherCount>0).length,
  classesWithStudents:classes.filter(c=>c.studentCount>0).length,
  classesWithAssignments:classes.filter(c=>c.assignedAssessmentCount>0).length,
  studentSubmissions:classes.reduce((n,c)=>n+c.submittedAttemptCount,0),
  gradedSubmissions:classes.reduce((n,c)=>n+c.gradedAttemptCount,0),
 };
}
