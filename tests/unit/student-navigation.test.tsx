import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudentExperience } from "@/components/student/StudentExperience";
import { LiveQuickWins } from "@/components/student/LiveQuickWins";
import { Route } from "@/routes/student.assignments";
import { Route as ExperiencesRoute } from "@/routes/student.experiences";

const state = vi.hoisted(() => ({
  search: {} as Record<string, unknown>,
  assignments: [
    { assessmentId: "upcoming", title: "Upcoming essay", course: "English", status: "assigned", timeliness: "on_time", dueAt: null },
    { assessmentId: "missing", title: "Missing essay", course: "English", status: "assigned", timeliness: "missing", dueAt: null },
    { assessmentId: "submitted", title: "Submitted essay", course: "English", status: "submitted", timeliness: "late", dueAt: null },
    { assessmentId: "graded", title: "Graded essay", course: "English", status: "graded", timeliness: "on_time", dueAt: null },
    { assessmentId: "returned", title: "Returned essay", course: "English", status: "returned", timeliness: "late", dueAt: null },
  ].map(item=>({...item,responseText:`Saved draft for ${item.title}`,assessmentStatus:"published",
    metadata:{rubric:""},attempts:[],pointsPossible:100})),
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
    expect(html).toMatch(/<a href="\/student\/courses"[^>]*><p[^>]*>Classes<\/p>/);
    expect(html).toMatch(/<a href="\/student\/assignments"[^>]*><p[^>]*>Upcoming assignments<\/p>/);
    expect(html).toMatch(/<a href="\/student\/assignments\?filter=missing"[^>]*><p[^>]*>Missing work<\/p>/);
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
});
