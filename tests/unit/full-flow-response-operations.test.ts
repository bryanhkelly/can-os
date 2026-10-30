import { describe, expect, it } from "vitest";
import { gradeResponseActionType, gradeResponseRequestedMessage,
  isGuardianGradeResponseAction } from "@/domain/grade-response-policy";
import { summarizeFullFlowOperations, type FullFlowRows } from "@/domain/full-flow-operational-snapshot";

describe("FullFlow guardian response policy", () => {
  it("never confuses another guardian or grade with this response", () => {
    const row = {type:gradeResponseActionType,subjectType:"student_profile",
      metadata:{submissionId:"sub-1",requestedByGuardianPersonId:"guardian-1"}};
    expect(isGuardianGradeResponseAction(row,"guardian-1","sub-1")).toBe(true);
    expect(isGuardianGradeResponseAction(row,"guardian-2","sub-1")).toBe(false);
    expect(isGuardianGradeResponseAction(row,"guardian-1","sub-2")).toBe(false);
    expect(isGuardianGradeResponseAction({...row,type:"academic_intervention"},"guardian-1","sub-1")).toBe(false);
  });
  it("requires a meaningful bounded question", () => {
    expect(gradeResponseRequestedMessage("  Please review the grade.  ")).toBe("Please review the grade.");
    expect(() => gradeResponseRequestedMessage("too short")).toThrow();
    expect(() => gradeResponseRequestedMessage("x".repeat(1001))).toThrow();
  });
});

describe("FullFlow operational record projection", () => {
  const p=(id:string)=>({
    id,name:id,status:"active",type:"high_school_extension",siteId:id+"-site",
    academicProviderOrganizationId:id+"-school",creditIssuingOrganizationId:id+"-school",
  });
  const rows:FullFlowRows={
    programs:[p("A"),p("B")],
    sections:[
      {id:"sec-A",schoolYearId:"year-A",programId:"A",active:true,versionStatus:"published"},
      {id:"sec-B",schoolYearId:"year-B",programId:"B",active:true,versionStatus:"draft"},
      {id:"sec-A-closed",schoolYearId:"year-A",programId:"A",active:false,versionStatus:"published"},
    ],
    teacherAssignments:[{sectionId:"sec-A",personId:"teacher-A"},{sectionId:"sec-A",personId:"teacher-A-2"}],
    adoptions:[{programId:"A",status:"active"},{programId:"A",status:"revoked"},{programId:"B",status:"active"}],
    applications:[{programId:"A",stage:"accepted"},{programId:"A",stage:"eligibility"},{programId:"B",stage:"application"}],
    enrollmentRequirements:[
      {programId:"A",status:"needs_you",blocking:true},
      {programId:"A",status:"complete",blocking:true},
      {programId:"A",status:"needs_you",blocking:false},
      {programId:"B",status:"needs_can",blocking:true},
    ],
    enrollments:[
      {programId:"A",kind:"program",status:"active",studentProfileId:"student-1",sectionId:null,schoolYearId:"year-A"},
      {programId:"A",kind:"program",status:"active",studentProfileId:"student-1",sectionId:null,schoolYearId:"year-A"},
      {programId:"A",kind:"section",status:"active",studentProfileId:"student-1",sectionId:"sec-A",schoolYearId:"year-A"},
      {programId:"B",kind:"program",status:"active",studentProfileId:"student-2",sectionId:null,schoolYearId:"year-B"},
      {programId:"B",kind:"section",status:"inactive",studentProfileId:"student-2",sectionId:"sec-B",schoolYearId:"year-B"},
    ],
    assessments:[{id:"assessment-A",sectionId:"sec-A",status:"published"},
      {id:"assessment-B",sectionId:"sec-B",status:"published"},
      {id:"assessment-closed",sectionId:"sec-A-closed",status:"published"}],
    submissions:[
      {assessmentId:"assessment-A",studentProfileId:"student-1",status:"graded"},
      {assessmentId:"assessment-A",studentProfileId:"student-1",status:"submitted"},
      {assessmentId:"assessment-B",studentProfileId:"student-2",status:"graded"},
      {assessmentId:"assessment-closed",studentProfileId:"student-1",status:"graded"},
    ],
    responses:[{programId:"A",status:"open"},{programId:"A",status:"resolved"},
      {programId:"B",status:"waiting"}],
  };
  it("keeps journey metrics within their program and excludes inactive classes", () => {
    const snapshot=summarizeFullFlowOperations(rows);
    expect(snapshot.programs).toHaveLength(2);
    expect(snapshot.programs[0]?.counts).toMatchObject({
      adoptedCurriculumPacks:1,sections:1,publishedSections:1,
      staffedSections:1,applications:2,incomingApplications:1,outstandingEnrollmentRequirements:1,
      acceptedApplications:1,activeProgramStudents:1,placedStudents:1,publishedAssessments:1,
      gradedWork:1,submittedWork:1,unresolvedGuardianResponses:1,
    });
    expect(snapshot.programs[1]?.counts).toMatchObject({
      sections:1,publishedSections:0,staffedSections:0,activeProgramStudents:1,
      incomingApplications:1,outstandingEnrollmentRequirements:1,
      placedStudents:0,gradedWork:1,unresolvedGuardianResponses:1,
    });
    expect(snapshot.totals.activeProgramStudents).toBe(2);
    expect(snapshot.totals.incomingApplications).toBe(2);
    expect(snapshot.totals.outstandingEnrollmentRequirements).toBe(2);
    expect(snapshot.totals.gradedWork).toBe(2);
    expect(snapshot.totals.unresolvedGuardianResponses).toBe(2);
  });
  it("counts only incoming admissions stages and incomplete blocking Journey requirements",()=>{
    const snapshot=summarizeFullFlowOperations({...rows,
      applications:["lead","inquiry","application","eligibility","accepted","rejected","withdrawn","enrolled"]
        .map(stage=>({programId:"A",stage})),
      enrollmentRequirements:[
        {programId:"A",status:"needs_you",blocking:true},
        {programId:"A",status:"needs_can",blocking:true},
        {programId:"A",status:"complete",blocking:true},
        {programId:"A",status:"needs_you",blocking:false},
      ],
    });
    expect(snapshot.programs[0]?.counts.incomingApplications).toBe(4);
    expect(snapshot.programs[0]?.counts.outstandingEnrollmentRequirements).toBe(2);
    expect(snapshot.programs[1]?.counts.incomingApplications).toBe(0);
    expect(snapshot.programs[1]?.counts.outstandingEnrollmentRequirements).toBe(0);
  });
  it("does not count an orphan Section enrollment as a student's class placement", () => {
    const snapshot=summarizeFullFlowOperations({
      ...rows,
      enrollments:[
        {programId:"A",kind:"program",status:"active",studentProfileId:"student-1",sectionId:null,schoolYearId:"year-A"},
        {programId:"A",kind:"section",status:"active",studentProfileId:"different-student",sectionId:"sec-A",schoolYearId:"year-A"},
        {programId:"B",kind:"section",status:"active",studentProfileId:"student-1",sectionId:"sec-B",schoolYearId:"year-B"},
      ],
    });
    expect(snapshot.programs[0]?.counts.activeProgramStudents).toBe(1);
    expect(snapshot.programs[0]?.counts.placedStudents).toBe(0);
    expect(snapshot.programs[1]?.counts.placedStudents).toBe(0);
  });
  it("does not report first student in class when the Section is unstaffed or has draft curriculum",()=>{
    const unstaffed=summarizeFullFlowOperations({...rows,
      teacherAssignments:[],
    });
    expect(unstaffed.programs[0]?.counts.activeProgramStudents).toBe(1);
    expect(unstaffed.programs[0]?.counts.placedStudents).toBe(0);
    const unpublished=summarizeFullFlowOperations({...rows,
      sections:rows.sections.map(row=>row.id==="sec-A"?{...row,versionStatus:"draft"}:row),
    });
    expect(unpublished.programs[0]?.counts.placedStudents).toBe(0);
  });
  it("rejects a class assigned in the wrong school year",()=>{
    const wrong=summarizeFullFlowOperations({...rows,
      enrollments:rows.enrollments.map(enrollment=>
        enrollment.kind==="section" && enrollment.programId==="A"
          ? {...enrollment,schoolYearId:"last-year"} : enrollment),
    });
    expect(wrong.programs[0]?.counts.activeProgramStudents).toBe(1);
    expect(wrong.programs[0]?.counts.placedStudents).toBe(0);
  });
  it("returns zeros rather than inventing readiness for a school with no program", () => {
    const snapshot=summarizeFullFlowOperations({
      ...rows,programs:[],sections:[],teacherAssignments:[],adoptions:[],
      applications:[],enrollments:[],assessments:[],submissions:[],responses:[],
    });
    expect(snapshot.programs).toEqual([]);
    expect(snapshot.totals.gradedWork).toBe(0);
    expect(snapshot.totals.unresolvedGuardianResponses).toBe(0);
  });
});
