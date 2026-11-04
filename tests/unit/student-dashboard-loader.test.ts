import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadStudentToday } from "@/components/home/StudentHome";
import { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { getAssignments } from "@/modules/student-experience/assignments.functions";
import { getQuickWinActions } from "@/modules/actions/student-actions.functions";
import { getClassWorkspace } from "@/modules/learning/class-workspace.functions";
import { getStudentReportCard } from "@/modules/learning/report-cards.functions";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { AuthorizationError } from "@/domain/command-context";

vi.mock("@/modules/student-experience/student-today.functions",()=>({getMyStudentToday:vi.fn()}));
vi.mock("@/modules/student-experience/assignments.functions",()=>({getAssignments:vi.fn()}));
vi.mock("@/modules/actions/student-actions.functions",()=>({getQuickWinActions:vi.fn()}));
vi.mock("@/modules/learning/class-workspace.functions",()=>({getClassWorkspace:vi.fn()}));
vi.mock("@/modules/learning/report-cards.functions",()=>({getStudentReportCard:vi.fn()}));
vi.mock("@/modules/student-experience/school-experiences.functions",()=>({getSchoolExperiences:vi.fn()}));
vi.mock("@tanstack/react-router",()=>({createFileRoute:()=> (options:object)=>({options}),Link:()=>null}));

beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(getMyStudentToday).mockResolvedValue({
    student:{studentProfileId:"student",personId:"person",firstName:"Jordan",preferredName:null,gradeLevel:"9"},
    generatedAt:new Date("2030-11-05T15:00:00Z"),sections:[{sectionId:"enrolled",sectionTitle:"English",timezone:"America/New_York"}],
    coursework:[],events:[],openActions:[],recoveryCandidates:[],firstWeek:[],
  });
  vi.mocked(getAssignments).mockResolvedValue({connected:true,assignments:[{
    assessmentId:"essay",sectionId:"enrolled",title:"Essay",course:"English",dueAt:"2030-11-06T17:00:00Z",
    status:"assigned",timeliness:"on_time",assessmentStatus:"published",canEdit:true,responseText:"private draft",
  }]});
  vi.mocked(getQuickWinActions).mockResolvedValue({connected:true,actions:[]});
  vi.mocked(getStudentReportCard).mockResolvedValue({grades:[{
    sectionGradeId:"grade",sectionTitle:"English",schoolYearName:"2030-31",gradingPeriodName:"Quarter one",
    letterGrade:"A",percentage:"95",sectionMetadata:{privateNotes:"must not project"},
  }]});
  vi.mocked(getSchoolExperiences).mockResolvedValue({connected:true,events:[],notices:[],conferenceNotes:[{body:"not for dashboard"}]});
  vi.mocked(getClassWorkspace).mockResolvedValue({
    section:{title:"English"},curriculumAccess:{available:true},teacherGuides:{private:"must not project"},
    content:{modules:[{lessons:[
      {id:"empty",title:"Empty shell",body:"",resources:[]},
      {id:"done",title:"Completed lesson",body:"Read and practise.",resources:[]},
      {id:"next",title:"Next lesson",body:"Compare arguments.",resources:[],estimatedMinutes:20},
    ]}]},progress:[{lessonId:"done",completedAt:"2030-11-04T15:00:00Z"},{lessonId:"retired",completedAt:"2030-11-04T15:00:00Z"}],
  });
});

describe("refined student dashboard composition",()=>{
  it("uses current identity APIs and projects only real instructional progress and released grade fields",async()=>{
    const result=await loadStudentToday();
    expect(getMyStudentToday).toHaveBeenCalledWith();
    expect(getAssignments).toHaveBeenCalledWith();
    expect(getStudentReportCard).toHaveBeenCalledWith({data:{}});
    expect(getClassWorkspace).toHaveBeenCalledWith({data:{sectionId:"enrolled"}});
    expect(result.dashboard.learning).toEqual({ok:true,data:{
      sectionId:"enrolled",title:"English",lesson:{id:"next",title:"Next lesson",estimatedMinutes:20},completed:1,total:2,
    }});
    expect(result.dashboard.assignments.ok&&result.dashboard.assignments.data[0]?.hasDraft).toBe(true);
    const serialized=JSON.stringify(result.dashboard);
    expect(serialized).not.toMatch(/private draft|privateNotes|teacherGuides|conferenceNotes|must not project/);
  });
  it("does not select an unenrolled section suggested by an assignment projection",async()=>{
    vi.mocked(getAssignments).mockResolvedValue({connected:true,assignments:[{
      assessmentId:"essay",sectionId:"outside",title:"Essay",course:"English",dueAt:null,
      status:"assigned",timeliness:"on_time",assessmentStatus:"published",canEdit:true,responseText:"",
    }]});
    await loadStudentToday();
    expect(getClassWorkspace).toHaveBeenCalledWith({data:{sectionId:"enrolled"}});
  });
  it("keeps the authorized day visible when optional readers are disconnected or denied",async()=>{
    vi.mocked(getAssignments).mockResolvedValue({connected:false,assignments:[]});
    vi.mocked(getQuickWinActions).mockResolvedValue({connected:false,actions:[]});
    vi.mocked(getStudentReportCard).mockRejectedValue(new AuthorizationError("released grade access"));
    const result=await loadStudentToday();
    expect(result.today.student.personId).toBe("person");
    expect(result.dashboard.assignments).toMatchObject({ok:false,kind:"unavailable"});
    expect(result.dashboard.grades).toMatchObject({ok:false,kind:"authorization"});
    expect(result.dashboard.community.ok).toBe(true);
    expect(result.dashboard.learning.ok).toBe(true);
    expect(result.success).toBeNull();
    expect(result.support).toBeNull();
  });
  it("does not invent a lesson or progress when the published release is unavailable",async()=>{
    vi.mocked(getClassWorkspace).mockResolvedValue({curriculumAccess:{available:false},content:null});
    const result=await loadStudentToday();
    expect(result.dashboard.learning).toMatchObject({ok:false,kind:"unavailable"});
    expect(result.dashboard.assignments.ok).toBe(true);
  });
  it("never calls optional readers when the canonical student day is denied",async()=>{
    vi.mocked(getMyStudentToday).mockRejectedValue(new AuthorizationError("student access"));
    await expect(loadStudentToday()).rejects.toBeInstanceOf(AuthorizationError);
    expect(getAssignments).not.toHaveBeenCalled();
    expect(getClassWorkspace).not.toHaveBeenCalled();
  });
});
