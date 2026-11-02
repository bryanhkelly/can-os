import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentExperience } from "@/components/student/StudentExperience";
import { LiveQuickWins } from "@/components/student/LiveQuickWins";
import { Route } from "@/routes/student.assignments";
import { Route as ExperiencesRoute } from "@/routes/student.experiences";
import { getQuickWinActions } from "@/modules/actions/student-actions.functions";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";

const state = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  assignments: [
    { assessmentId: "upcoming", title: "Upcoming essay", course: "English", status: "assigned", timeliness: "on_time", dueAt: null },
    { assessmentId: "missing", title: "Missing essay", course: "English", status: "assigned", timeliness: "missing", dueAt: null },
    { assessmentId: "submitted", title: "Submitted essay", course: "English", status: "submitted", timeliness: "late", dueAt: null },
    { assessmentId: "graded", title: "Graded essay", course: "English", status: "graded", timeliness: "on_time", dueAt: null },
    { assessmentId: "returned", title: "Returned essay", course: "English", status: "returned", timeliness: "late", dueAt: null },
  ].map(item=>({...item,responseText:`Saved draft for ${item.title}`,assessmentStatus:"published",
    metadata:{rubric:"",maxAttempts:null,criteria:[]},attempts:[],pointsPossible:100,
    workAvailability:{actionable:true,reason:null},canEdit:true,attemptNumber:1})),
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("@tanstack/react-router")>(),
  Link: ({ to, search, children, ...props }: {
    to: string; search?: Record<string, string>; children: ReactNode;
  }) => <a href={to + (search ? "?" + new URLSearchParams(Object.entries(search).filter(([,value])=>value!==undefined)).toString() : "")} {...props}>{children}</a>,
  createFileRoute: () => (options: object) => ({
    options,
    useSearch: () => state.search,
    useLoaderData: () => ({ ok: true, data: { connected: true, assignments: state.assignments } }),
  }),
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/modules/student-experience/assignments.functions", () => ({
  getAssignments: vi.fn(), saveAssignmentResponse: vi.fn(), saveAssignmentDraft: vi.fn(),
}));
vi.mock("@/modules/learning/submission-annotations.functions",()=>({getSubmissionAnnotations:vi.fn(),addSubmissionAnnotation:vi.fn()}));
vi.mock("@/modules/learning/class-communication.functions",()=>({startAssignmentConversation:vi.fn()}));
vi.mock("@/modules/learning/submission-attachments.functions", () => ({
  createSubmissionAttachmentUpload: vi.fn(), attachDocumentToSubmission: vi.fn(),
  listSubmissionAttachments: vi.fn(), getSubmissionAttachmentDownload: vi.fn(),
}));
vi.mock("@/modules/actions/student-actions.functions", () => ({
  getQuickWinActions: vi.fn(), finishQuickWinAction: vi.fn(), requestQuickWinHelp: vi.fn(),
}));
vi.mock("@/components/student/LiveSchoolExperiences", () => ({
  LiveSchoolExperiences: () => null,
}));
vi.mock("@/modules/student-experience/school-experiences.functions", () => ({
  getSchoolExperiences: vi.fn(),
}));

describe("Student Today summary navigation", () => {
  it("renders all three summary cards as links to implemented destinations", () => {
    const html = renderToStaticMarkup(<StudentExperience liveData={{
      student: { studentProfileId: "student", personId: "person", firstName: "Jordan", preferredName: null, gradeLevel: "9" },
      generatedAt: new Date(), dayStartUtc: new Date(), dayEndUtc: new Date(),
      sections: [], coursework: [], events: [], openActions: [], recoveryCandidates: [],
    }} />);
    expect(html).toMatch(/<a href="\/student\/courses"[^>]*>[\s\S]*?Classes<\/p>/);
    expect(html).toMatch(/<a href="\/student\/assignments"[^>]*>[\s\S]*?Upcoming assignments<\/p>/);
    expect(html).toMatch(/<a href="\/student\/assignments\?filter=missing"[^>]*><p[^>]*>Missing work<\/p>/);
    expect(html).toContain('href="/student/experiences"');
    expect(html).toContain("School &amp; community");
  });

  it("distinguishes coursework states and keeps keyboard focus visible", () => {
    const html = renderToStaticMarkup(<StudentExperience liveData={{
      student: { studentProfileId: "student", personId: "person", firstName: "Jordan", preferredName: null, gradeLevel: "9" },
      generatedAt: new Date(), dayStartUtc: new Date(), dayEndUtc: new Date(),
      sections: [], events: [], openActions: [], recoveryCandidates: [],
      coursework: [
        { assessmentId: "missing", assessmentTitle: "Synthetic missing work", status: "assigned", timeliness: "missing", dueAt: null, instructions: null },
        { assessmentId: "late", assessmentTitle: "Synthetic late work", status: "assigned", timeliness: "late", dueAt: null, instructions: null },
        { assessmentId: "returned", assessmentTitle: "Synthetic revision", status: "returned", timeliness: "late", dueAt: null, instructions: null },
      ],
    }} />);
    expect(html).toContain("Missing");
    expect(html).toContain(">Late</span>");
    expect(html).toContain("Revision requested");
    expect(html).toContain("focus-visible:outline-2");
    expect(html).toContain("No scheduled events today.");
  });

  it("shows student-owned support tasks exactly once in Student Today without staff case data", () => {
    const html = renderToStaticMarkup(<StudentExperience
      liveData={{
        student: { studentProfileId: "student", personId: "person",
          firstName: "Jordan", preferredName: null, gradeLevel: "9" },
        generatedAt: new Date(), dayStartUtc: new Date(), dayEndUtc: new Date(),
        sections: [], coursework: [], events: [], recoveryCandidates: [],
        openActions: [{
          id: "support-task", title: "Meet your academic tutor",
          description: "Your owned action", dueAt: null, priority: "normal",
          subjectType: "student_profile", subjectId: "student",
        }],
      }}
      support={{
        tasks: [{
          id: "support-task", title: "Meet your academic tutor",
          type: "student_support", status: "open", dueAt: null,
          destination: "action", destinationId: "support-task",
        }],
        total: 1, truncated: false,
      }}
    />);
    expect(html.match(/Meet your academic tutor/g)).toHaveLength(1);
    expect(html).toContain('href="/student/experiences?action=support-task"');
    expect(html).toContain("No additional open actions outside your learning support list.");
    expect(html).not.toContain("Private counselor");
    expect(html).not.toContain("safeguarding");
  });

  it("opens assessment actions in the assignment and other actions individually", () => {
    const html = renderToStaticMarkup(<StudentExperience liveData={{
      student: { studentProfileId: "student", personId: "person", firstName: "Jordan", preferredName: null, gradeLevel: "9" },
      generatedAt: new Date(), dayStartUtc: new Date(), dayEndUtc: new Date(),
      sections: [], coursework: [], events: [], recoveryCandidates: [],
      openActions: [
        {id:"revision",title:"Revise English essay",description:"Read feedback",dueAt:null,priority:"high",subjectType:"assessment",subjectId:"returned"},
        {id:"help",title:"Check in with mentor",description:null,dueAt:null,priority:"normal",subjectType:"student_profile",subjectId:"student"},
      ],
    }} />);
    expect(html).toContain('href="/student/assignments?assessment=returned"');
    expect(html).toContain('href="/student/experiences?action=help"');
    expect(html).not.toContain('href="/student/experiences?action=revision"');
  });

  it("hands an enrolled student into actual first-week lesson and submission work", () => {
    const html = renderToStaticMarkup(<StudentExperience liveData={{
      student: { studentProfileId: "student", personId: "person", firstName: "Jordan", preferredName: null, gradeLevel: "9" },
      generatedAt: new Date(), dayStartUtc: new Date(), dayEndUtc: new Date(),
      sections: [{ sectionId: "section-1", sectionTitle: "Biology", siteId: "site", programId: "program", schoolYearId: "year" }],
      firstWeek: [{ sectionId: "section-1", ready: true, blockers: [], activeStudentCount: 1,
        firstWeek: { lesson: { id: "investigate", title: "Investigate cells" }, assessment: { id: "assessment-1", title: "Cell observations" } } }],
      coursework: [], events: [], openActions: [], recoveryCandidates: [],
    }} />);
    expect(html).toContain("Start first-week work");
    expect(html).toContain('href="/student/assignments?section=section-1&amp;assessment=assessment-1"');
    expect(html).toContain('href="/classes?section=section-1&amp;tab=lessons&amp;lesson=investigate"');
    expect(html).toContain("Investigate cells");
    expect(html).toContain("Cell observations");
  });

  it("does not offer a false start when an enrolled class has no submittable assessment", () => {
    const html = renderToStaticMarkup(<StudentExperience liveData={{
      student: { studentProfileId: "student", personId: "person", firstName: "Jordan", preferredName: null, gradeLevel: "9" },
      generatedAt: new Date(), dayStartUtc: new Date(), dayEndUtc: new Date(),
      sections: [{ sectionId: "section-1", sectionTitle: "Biology", siteId: "site", programId: "program", schoolYearId: "year" }],
      firstWeek: [{ sectionId: "section-1", ready: false, activeStudentCount: 1,
        blockers: [{ key: "missing_assessment", message: "Publish an assessment with student instructions so learners can submit real work." }],
        firstWeek: { lesson: { id: "investigate", title: "Investigate cells" }, assessment: null } }],
      coursework: [], events: [], openActions: [], recoveryCandidates: [],
    }} />);
    expect(html).not.toContain("Start first-week work");
    expect(html).toContain("View my classes");
    expect(html).toContain("Publish an assessment with student instructions");
    expect(html).not.toContain('assessment=undefined');
  });
});

describe("assignment navigation filters", () => {
  beforeEach(() => { state.search = {}; });

  function renderAssignments() {
    const Page = Route.options.component!;
    return renderToStaticMarkup(<Page />);
  }

  it.each([
    [undefined, ["Upcoming essay", "Missing essay", "Submitted essay", "Graded essay", "Returned essay"]],
    ["all", ["Upcoming essay", "Missing essay", "Submitted essay", "Graded essay", "Returned essay"]],
    ["todo", ["Upcoming essay", "Missing essay", "Returned essay"]],
    ["missing", ["Missing essay"]],
    ["submitted", ["Submitted essay"]],
    ["feedback", ["Graded essay", "Returned essay"]],
  ])("renders the assignments requested by filter=%s", (filter, titles) => {
    state.search = { filter };
    const html = renderAssignments();
    for (const item of state.assignments) {
      expect(html.includes(item.title)).toBe(titles.includes(item.title));
    }
    if (filter) expect(html).toContain(`href="/student/assignments?filter=${filter}" aria-current="page"`);
  });

  it("keeps missing work empty when no assignments are marked missing", () => {
    state.search = { filter: "missing" };
    const assignment = state.assignments[1];
    const previous = assignment.timeliness;
    assignment.timeliness = "late";
    try {
      expect(renderAssignments()).toContain("No assignments in this view.");
    } finally {
      assignment.timeliness = previous;
    }
  });

  it("validates filters and preserves assessment deep links", () => {
    const validate = Route.options.validateSearch;
    expect(typeof validate).toBe("function");
    if (typeof validate !== "function") throw new Error("Missing search validator");
    expect(validate({ filter: "missing", assessment: "essay" })).toEqual({ filter: "missing", assessment: "essay" });
    expect(validate({ filter: "invalid", assessment: 42 })).toEqual({ filter: undefined, assessment: undefined });
  });

  it("opens the requested returned assignment with its saved response on first render", () => {
    state.search={assessment:"returned"};
    const html=renderAssignments();
    expect(html).toMatch(/aria-label="Assignment details"[\s\S]*>Returned essay<\/h2>/);
    expect(html).toContain("Saved draft for Returned essay</textarea>");
    expect(html).toContain('href="/student/assignments?filter=all&amp;assessment=returned" aria-current="page"');
  });

  it("does not silently substitute another assignment for an unavailable deep link", () => {
    state.search={assessment:"not-visible"};
    const html=renderAssignments();
    expect(html).toContain("This assignment is unavailable in the current view.");
    expect(html).toContain("Select an assignment");
    expect(html).not.toContain("<textarea");
  });

  it("does not select a requested assignment outside the current filter", () => {
    state.search={assessment:"returned",filter:"missing"};
    const html=renderAssignments();
    expect(html).toContain("This assignment is unavailable in the current view.");
    expect(html).not.toContain("<textarea");
  });

  it("initializes the default selection with its saved draft", () => {
    expect(renderAssignments()).toContain("Saved draft for Upcoming essay</textarea>");
  });
});

describe("individual student actions",()=>{
  const actions=[
    {id:"revision",title:"Revise English essay",description:"Read feedback",status:"open" as const,priority:"high",dueAt:null,metadata:{},type:"student_recovery",subjectType:"assessment",subjectId:"returned"},
    {id:"help",title:"Check in with mentor",description:null,status:"open" as const,priority:"normal",dueAt:null,metadata:{},type:"student_support"},
  ];
  it("preserves the action identifier in the experiences route",()=>{
    const validate=ExperiencesRoute.options.validateSearch;
    if(typeof validate!=="function")throw new Error("Missing action search validator");
    expect(validate({action:"help"})).toEqual({action:"help"});
    expect(validate({action:42})).toEqual({action:undefined});
  });
  it("links saved-action titles and review controls to their exact destinations",()=>{
    const html=renderToStaticMarkup(<LiveQuickWins connected actions={actions}/>);
    expect(html).toContain('href="/student/assignments?assessment=returned" class="hover:underline">Revise English essay</a>');
    expect(html).toContain('href="/student/experiences?action=help" class="hover:underline">Check in with mentor</a>');
    expect(html).toContain('href="/student/experiences?action=help" class="text-xs font-semibold underline">Review action</a>');
  });
  it("shows only the requested action and links to its assignment",()=>{
    const html=renderToStaticMarkup(<LiveQuickWins connected actions={actions} actionId="revision"/>);
    expect(html).toContain("Revise English essay");
    expect(html).not.toContain("Check in with mentor");
    expect(html).toContain('href="/student/assignments?assessment=returned"');
    expect(html).toContain("View all saved actions");
  });
  it("reports an unavailable action without displaying unrelated actions",()=>{
    const html=renderToStaticMarkup(<LiveQuickWins connected actions={actions} actionId="unavailable"/>);
    expect(html).toContain("This action is unavailable in your current student workspace.");
    expect(html).not.toContain("Revise English essay");
    expect(html).not.toContain("Check in with mentor");
  });
  it.each(["open","in_progress","waiting","resolved","cancelled"] as const)("keeps %s work in its actual state",status=>{
    const html=renderToStaticMarkup(<LiveQuickWins connected actions={[{...actions[1]!,status}]}/>);
    expect(html.includes(">Completed</span>")).toBe(status==="resolved");
    if(status!=="resolved")expect(html).toContain(`>${status.replaceAll("_"," ")}</span>`);
    expect(html.includes(">Mark complete</button>")).toBe(status==="open");
    expect(html).toContain(["open","in_progress","waiting"].includes(status)
      ?"1 saved action need attention":"0 saved actions need attention");
  });
  it.each(["student_recovery","student_support","student_support_request","conference_follow_up"])("retains completion for supported open %s actions",type=>{
    const html=renderToStaticMarkup(<LiveQuickWins connected actions={[{...actions[1]!,type}]}/>);
    expect(html).toContain(">Mark complete</button>");
  });
  it.each(["academic_intervention","support_referral","field_trip_consent"])("does not offer generic completion for %s",type=>{
    const html=renderToStaticMarkup(<LiveQuickWins connected actions={[{...actions[1]!,type}]}/>);
    expect(html).not.toContain(">Mark complete</button>");
    expect(html).toContain("Managed in its owning workflow.");
    expect(html).not.toContain(">Completed</span>");
  });
  it("disables completion when the database connection is unavailable",()=>{
    const html=renderToStaticMarkup(<LiveQuickWins connected={false} actions={[actions[1]!]}/>);
    expect(html).toMatch(/<button disabled=""[^>]*>Mark complete<\/button>/);
  });
});

describe("student Action detail loader",()=>{
  const load=ExperiencesRoute.options.loader as (input:{deps:{action?:string}})=>Promise<{
    ok:boolean;data?:{quickWins:unknown;school:unknown};
  }>;
  beforeEach(()=>vi.clearAllMocks());
  it("requests the exact Action without loading unrelated school experiences",async()=>{
    vi.mocked(getQuickWinActions).mockResolvedValue({connected:true,actions:[]});
    const action="00000000-0000-4000-8000-000000000001";
    const result=await load({deps:{action}});
    expect(getQuickWinActions).toHaveBeenCalledWith({data:{actionId:action}});
    expect(getSchoolExperiences).not.toHaveBeenCalled();
    expect(result).toEqual({ok:true,data:{quickWins:{connected:true,actions:[]},school:null}});
  });
  it("retains the combined directory when there is no selection",async()=>{
    vi.mocked(getQuickWinActions).mockResolvedValue({connected:true,actions:[]});
    await load({deps:{}});
    expect(getQuickWinActions).toHaveBeenCalledWith({data:{actionId:undefined}});
    expect(getSchoolExperiences).toHaveBeenCalledOnce();
  });
});
