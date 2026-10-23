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
      {id:"sec-A",programId:"A",active:true,versionStatus:"published"},
      {id:"sec-B",programId:"B",active:true,versionStatus:"draft"},
      {id:"sec-A-closed",programId:"A",active:false,versionStatus:"published"},
    ],
    teacherAssignments:[{sectionId:"sec-A",personId:"teacher-A"},{sectionId:"sec-A",personId:"teacher-A-2"}],
    adoptions:[{programId:"A",status:"active"},{programId:"A",status:"revoked"},{programId:"B",status:"active"}],
    applications:[{programId:"A",stage:"accepted"},{programId:"A",stage:"eligibility"},{programId:"B",stage:"application"}],
    enrollments:[
      {programId:"A",kind:"program",status:"active",studentProfileId:"student-1",sectionId:null},
      {programId:"A",kind:"program",status:"active",studentProfileId:"student-1",sectionId:null},
      {programId:"A",kind:"section",status:"active",studentProfileId:"student-1",sectionId:"sec-A"},
      {programId:"B",kind:"program",status:"active",studentProfileId:"student-2",sectionId:null},
      {programId:"B",kind:"section",status:"inactive",studentProfileId:"student-2",sectionId:"sec-B"},
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
  it("keeps all six journey metrics within their program and excludes inactive classes", () => {
    const snapshot=summarizeFullFlowOperations(rows);
    expect(snapshot.programs).toHaveLength(2);
    expect(snapshot.programs[0]?.counts).toMatchObject({
      adoptedCurriculumPacks:1,sections:1,publishedSections:1,
      staffedSections:1,applications:2,acceptedApplications:1,
      activeProgramStudents:1,placedStudents:1,publishedAssessments:1,
      gradedWork:1,submittedWork:1,unresolvedGuardianResponses:1,
    });
    expect(snapshot.programs[1]?.counts).toMatchObject({
      sections:1,publishedSections:0,staffedSections:0,activeProgramStudents:1,
      placedStudents:0,gradedWork:1,unresolvedGuardianResponses:1,
    });
    expect(snapshot.totals.activeProgramStudents).toBe(2);
    expect(snapshot.totals.gradedWork).toBe(2);
    expect(snapshot.totals.unresolvedGuardianResponses).toBe(2);
  });
  it("does not count an orphan Section enrollment as a student's class placement", () => {
    const snapshot=summarizeFullFlowOperations({
      ...rows,
      enrollments:[
        {programId:"A",kind:"program",status:"active",studentProfileId:"student-1",sectionId:null},
        {programId:"A",kind:"section",status:"active",studentProfileId:"different-student",sectionId:"sec-A"},
        {programId:"B",kind:"section",status:"active",studentProfileId:"student-1",sectionId:"sec-B"},
      ],
    });
    expect(snapshot.programs[0]?.counts.activeProgramStudents).toBe(1);
    expect(snapshot.programs[0]?.counts.placedStudents).toBe(0);
    expect(snapshot.programs[1]?.counts.placedStudents).toBe(0);
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
