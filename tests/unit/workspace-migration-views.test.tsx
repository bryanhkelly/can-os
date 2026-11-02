import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as Courses } from "@/routes/student.courses";
import { FamilyHomeView } from "@/routes/guardian.index";
import { Route as GuardianAttendance } from "@/routes/guardian.attendance";
import { Student360View } from "@/routes/staff.students.$personId";
import { LaunchPortfolio } from "@/components/operations/LaunchPortfolio";
import { WorkspaceShell } from "@/components/workspace";
import { getCourseRegistration } from "@/modules/learning/course-registration.functions";
import { getAssignments } from "@/modules/student-experience/assignments.functions";

const state = vi.hoisted(() => ({ search: {} as Record<string, unknown>, data: null as unknown }));
// Static presentation tests never open a database connection.
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => state.search, useLoaderData: () => state.data }),
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ to, search, params, children, ...props }: {
    to: string; search?: Record<string, string | undefined>; params?: Record<string, string>; children: ReactNode;
  }) => {
    const path = to.replace(/\$([^/]+)/g, (_, key: string) => params?.[key] ?? key);
    const query = new URLSearchParams(Object.entries(search ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
    return <a href={path + (query ? "?" + query : "")} {...props}>{children}</a>;
  },
}));
vi.mock("@/modules/learning/course-registration.functions", () => ({
  getCourseRegistration: vi.fn(), requestCourseChange: vi.fn(), decideCourseChange: vi.fn(),
}));
vi.mock("@/modules/student-experience/assignments.functions", () => ({ getAssignments: vi.fn() }));
vi.mock("@/modules/family/family-home.functions", () => ({ getFamilyHome: vi.fn(), getGuardianNeedsYou: vi.fn() }));
vi.mock("@/modules/profiles/directory.functions", () => ({ getStudent360: vi.fn() }));
vi.mock("@/modules/attendance/onsite-attendance-workflow.functions", () => ({
  listGuardianEffectiveAbsences: vi.fn(), submitEffectiveAttendanceExcuse: vi.fn(),
}));
vi.mock("@/modules/learning/submission-attachments.functions", () => ({
  createExcuseAttachmentUpload: vi.fn(), attachDocumentToExcuse: vi.fn(), listExcuseAttachmentCounts: vi.fn(),
}));
vi.mock("@/components/operations/GuardianPickupPanel", () => ({ GuardianPickupPanel: () => null }));

const section = {
  id: "english", title: "English Literature", code: "ENG", subject: "English", description: "Read and discuss.",
  credits: 1, mode: "hybrid", enrollmentId: "enrollment", enrollmentStatus: "active" as const, withdrawalNotation: null,
  policy: { capacity: 20, prerequisites: [], addDropEndsOn: "2099-01-01", withdrawalEndsOn: "2099-02-01", guardianApprovalRequired: false, meetingKey: null },
};
const registration = { connected: true, viewerRole: "student" as const, sections: [section], requests: [] };
function courses(data: unknown) {
  state.data = { ok: true, data };
  const Page = Courses.options.component;
  if (typeof Page !== "function") throw new Error("Missing classes component");
  return renderToStaticMarkup(<Page/>);
}
beforeEach(() => { state.search = {}; state.data = null; vi.clearAllMocks(); });

describe("shared workspace presentation", () => {
  it("renders one main landmark with breadcrumbs, actions and a contextual rail", () => {
    const html = renderToStaticMarkup(<WorkspaceShell width="wide" eyebrow="Learning" title="Class"
      breadcrumbs={<a href="/student/courses">My classes</a>} actions={<a href="/messages">Inbox</a>}
      rail={<p>Authorized class connections</p>}><p>Classwork</p></WorkspaceShell>);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain("Breadcrumb");
    expect(html).toContain("max-w-7xl");
    expect(html).toContain("<aside");
    expect(html).toContain('href="/student/courses"');
  });
});

describe("enrolled learning workspace", () => {
  it("defaults to enrolled classes, with a separate explicit catalog entry", () => {
    const html = courses({ ...registration, sections: [section, { ...section, id: "available", title: "Available Chemistry", enrollmentStatus: null }], classwork: [] });
    expect(html).toContain("English Literature");
    expect(html).not.toContain("Available Chemistry");
    expect(html).not.toContain("Request class");
    expect(html).toContain('href="/student/courses?view=catalog"');
    expect(html).toContain('href="/student/courses?section=english"');
  });
  it("retains real registration controls only in the catalog", () => {
    state.search = { view: "catalog" };
    const html = courses({ ...registration, sections: [{ ...section, enrollmentStatus: null }], classwork: [] });
    expect(html).toContain("Course catalog");
    expect(html).toContain("Request class");
  });
  it("keeps class tabs and connected pages tied to the exact section", () => {
    state.search = { section: "english", tab: "grades" };
    const html = courses({ ...registration, classwork: [
      { assessmentId: "essay", sectionId: "english", title: "English essay", status: "graded", timeliness: "on_time", dueAt: null, score: "0", pointsPossible: "10", feedbackText: "Please revise." },
      { assessmentId: "algebra", sectionId: "math", title: "Unrelated algebra", status: "graded", score: "8" },
    ] });
    expect(html).toContain("0 / 10");
    expect(html).toContain("Please revise.");
    expect(html).not.toContain("Unrelated algebra");
    expect(html).toContain("not a finalized course grade");
    expect(html).toContain('href="/student/assignments?section=english&amp;assessment=essay"');
    expect(html).toContain('href="/student/discussions?section=english"');
    expect(html).toContain('href="/calendar?section=english"');
    expect(html).toContain('href="/student/courses?section=english&amp;tab=grades" aria-current="page"');
  });
  const load = Courses.options.loader as (input: { deps: { section?: string } }) => Promise<{
    ok: boolean; data?: { classwork: { sectionId: string }[] };
  }>;
  it.each([undefined, "unavailable"])("does not request student work without an enrolled section (%s)", async sectionId => {
    vi.mocked(getCourseRegistration).mockResolvedValue(registration);
    await load({ deps: { section: sectionId } });
    expect(getAssignments).not.toHaveBeenCalled();
  });
  it("does not request student work for a registrar", async () => {
    vi.mocked(getCourseRegistration).mockResolvedValue({ ...registration, viewerRole: "registrar" });
    await load({ deps: { section: "english" } });
    expect(getAssignments).not.toHaveBeenCalled();
  });
  it("loads and filters classwork for an actively enrolled section", async () => {
    vi.mocked(getCourseRegistration).mockResolvedValue(registration);
    const assignment = {
      assessmentId: "essay", sectionId: "english", title: "English essay", instructions: null,
      dueAt: null, pointsPossible: "10", submissionId: null, status: null, timeliness: null,
      submittedAt: null, gradedAt: null, score: null, course: "English", attemptNumber: null,
      metadata: { rubric: "", criteria: [], synthetic: false }, assessmentStatus: "published" as const,
      attempts: [], rubricResult: null, responseText: "", feedbackText: "", response: undefined, feedback: undefined,
    };
    vi.mocked(getAssignments).mockResolvedValue({ connected: true, assignments: [
      assignment, { ...assignment, assessmentId: "math", sectionId: "math" },
    ] });
    const result = await load({ deps: { section: "english" } });
    expect(result.ok).toBe(true);
    expect(result.data?.classwork.map(item => item.sectionId)).toEqual(["english"]);
    expect(getAssignments).toHaveBeenCalledOnce();
  });
});

describe("family and student profiles", () => {
  it("shows concrete reasons and preserves each child's person ID in every academic link", () => {
    const children: ComponentProps<typeof FamilyHomeView>["children"] = [{
      studentPersonId: "child-person", studentProfileId: "child-profile", displayName: "Jordan", lastName: "Sample",
      sectionCount: 2, awaitingSections: false, missingCount: 3, unexcusedAbsences: 0, nextDueAt: null, status: "needs_attention",
      workToReview:[],workNeedsAttentionCount:0,
    }];
    const html = renderToStaticMarkup(<FamilyHomeView children={children} needs={[]} loading={false} error=""/>);
    expect(html).toContain("3 overdue assignment(s) need follow-through.");
    expect(html).toContain('href="/guardian/academics?student=child-person"');
    expect(html).toContain('href="/guardian/attendance?student=child-person"');
    expect(html).toContain('href="/guardian/report-cards?student=child-person"');
    expect(html).not.toContain("student=child-profile");
  });
  it("filters the family home by the selected child and retains action context", () => {
    const children: ComponentProps<typeof FamilyHomeView>["children"] = [
      { studentPersonId: "child-person", studentProfileId: "child-profile", displayName: "Jordan", lastName: "Sample",
        sectionCount: 2, awaitingSections: false, missingCount: 3, unexcusedAbsences: 0, nextDueAt: null, status: "needs_attention",
        workToReview: [], workNeedsAttentionCount: 0 },
      { studentPersonId: "other-person", studentProfileId: "other-profile", displayName: "Casey", lastName: "Sample",
        sectionCount: 1, awaitingSections: false, missingCount: 0, unexcusedAbsences: 0, nextDueAt: null, status: "on_track",
        workToReview: [], workNeedsAttentionCount: 0 },
    ];
    const html = renderToStaticMarkup(<FamilyHomeView children={children} needs={[]} loading={false} error=""
      student="child-person" action="consent-1"/>);
    expect(html).toContain("Showing Jordan’s school information.");
    expect(html).toContain('href="/guardian?action=consent-1"');
    expect(html).toContain('href="/guardian/academics?student=child-person"');
    expect(html).not.toContain("Casey Sample");
    expect(html).toContain("focus-visible:outline-2");
  });
  it("preserves child and attendance search parameters in the guardian attendance contract", () => {
    const validate = GuardianAttendance.options.validateSearch;
    expect(typeof validate).toBe("function");
    if (typeof validate !== "function") throw new Error("Missing attendance search validator");
    expect(validate({ student: "child-person", attendance: "attendance-event" }))
      .toEqual({ student: "child-person", attendance: "attendance-event" });
    expect(validate({ student: 4, attendance: null })).toEqual({ student: undefined, attendance: undefined });
  });
  it("keeps the selected child context visible during attendance loading", () => {
    state.search = { student: "child-person", attendance: "attendance-event" };
    const Page = GuardianAttendance.options.component;
    if (typeof Page !== "function") throw new Error("Missing guardian attendance component");
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Showing the selected child.");
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading attendance…");
  });
  const consentNeed: ComponentProps<typeof FamilyHomeView>["needs"][number] = {
    id: "consent-1", kind: "action", type: "study_group_consent", title: "Study group permission: Reading circle",
    detail: "Review a student's group request.", href: "/guardian?action=consent-1",
    priority: "normal", dueAt: null, createdAt: "2030-01-01T00:00:00.000Z",
  };
  it("clears the selected action without losing the selected child", () => {
    const html = renderToStaticMarkup(<FamilyHomeView
      children={[{
        studentPersonId: "child-person", studentProfileId: "child-profile", displayName: "Jordan", lastName: "Sample",
        sectionCount: 1, awaitingSections: false, missingCount: 0, unexcusedAbsences: 0, nextDueAt: null, status: "on_track",
        workToReview: [], workNeedsAttentionCount: 0,
      }]}
      needs={[{ ...consentNeed, studentPersonId: "child-person" }]}
      loading={false} error="" action="consent-1" student="child-person"
    />);
    expect(html).toContain("View all needs for this child");
    expect(html).toContain('href="/guardian?student=child-person"');
  });
  it("links a selected action to its owning workspace instead of dead-ending", () => {
    const html = renderToStaticMarkup(<FamilyHomeView children={[]} needs={[consentNeed]} loading={false} error="" action="consent-1"/>);
    expect(html).toContain('href="/guardian/group-permissions?action=consent-1"');
    expect(html).toContain("Review permission");
  });
  it("keeps unknown family actions out of the staff-only action detail route", () => {
    const html = renderToStaticMarkup(<FamilyHomeView children={[]} loading={false} error="" action="other-1"
      needs={[{ ...consentNeed, id: "other-1", type: "unknown_follow_up", href: "/guardian?action=other-1" }]}/>);
    expect(html).toContain('href="/guardian?action=other-1"');
    expect(html).not.toContain('href="/actions/other-1"');
  });
  const profile: ComponentProps<typeof Student360View>["profile"] = {
    viewerRole: "registrar",
    identity: { personId: "student-person", name: "Jordan Sample", gradeLevel: "9" }, guardians: [],
    sections: [{ sectionId: "english", title: "English", teacherNames: ["Avery Sample"] }],
    academics: { openMissingWorkCount: 0, sections: [{ sectionId: "english", title: "English", letterGrade: "F", percentage: "0", finalizedAt: "2030-01-01" }] },
    attendance: { absenceCount: 0, tardyCount: 0, recentEvents: [] }, openActions: [], insights: [], supportReferrals: [],
  };
  it("keeps profile tabs URL-backed and renders zero finalized grades", () => {
    const html = renderToStaticMarkup(<Student360View profile={profile} tab="academics"/>);
    expect(html).toContain('href="/staff/students/student-person?tab=academics" aria-current="page"');
    expect(html).toContain("Finalized grade: F · 0%");
    expect(html).toContain("Avery Sample");
    expect(html).not.toContain("No finalized grade yet");
    expect(html).not.toContain('aria-label="Support referrals"');
  });
  it("renders explicit empty relationships rather than synthetic contacts", () => {
    const html = renderToStaticMarkup(<Student360View profile={profile} tab="relationships"/>);
    expect(html).toContain("No guardians on record.");
    expect(html).not.toContain("Finalized grade:");
  });
  it.each(["teacher","specialist","counselor","registrar"] as const)("opens the exact support records available to %s",viewerRole=>{
    const html=renderToStaticMarkup(<Student360View tab="support" profile={{
      ...profile,viewerRole,
      openActions:[
        {id:"intervention",type:"academic_intervention",title:"Academic follow-up",status:"open",priority:"high",dueAt:null},
        {id:"referral",type:"support_referral",title:"Learning referral",status:"open",priority:"normal",dueAt:null},
        {id:"office",type:"office_follow_up",title:"Office follow-up",status:"open",priority:"normal",dueAt:null},
      ],
      supportReferrals:[{id:"referral",title:"Learning referral",stage:"submitted",category:"academic",createdAt:"2030-01-01"}],
      insights:[{id:"signal",title:"Missing work signal",type:"missing_work",createdAt:"2030-01-01"}],
    }}/>);
    expect(html).toContain('href="/actions/intervention"');
    expect(html).toContain('href="/operations/insights?insight=signal"');
    expect(html.includes('href="/support?referral=referral"')).toBe(viewerRole!=="registrar");
    expect(html.includes('href="/actions/office"')).toBe(viewerRole==="registrar");
    expect(html).not.toContain('href="/actions/referral"');
  });
});

describe("launch portfolio", () => {
  const launch: ComponentProps<typeof LaunchPortfolio>["launches"][number] = {
    id: "program", name: "New Academy", slug: "new-academy", type: "academy", status: "launching",
    organizationId: "organization", siteId: "school", createdAt: "2030-01-01", journey: { id: "journey", status: "in_progress" },
    requirements: [{ id: "req", key: "staffing", title: "Assign teachers", status: "pending", blocking: true }],
  };
  it("shows real blockers and exact program/site destinations", () => {
    const html = renderToStaticMarkup(<LaunchPortfolio launches={[launch]} sites={[]} siteId="school"/>);
    expect(html).toContain("0 of 1 recorded requirements complete");
    expect(html).toContain("Assign teachers");
    expect(html).toContain('href="/operations/launch/program?siteId=school"');
    expect(html).toContain('href="/operations/launch?siteId=school&amp;programId=program"');
    expect(html).toContain("Requirement status does not authorize opening");
    expect(html).not.toContain("0%)");
    expect(html).toContain("Review academic setup");
  });
  it("reports unavailable scope without showing a different program", () => {
    const html = renderToStaticMarkup(<LaunchPortfolio launches={[launch]} sites={[]} programId="unavailable"/>);
    expect(html).toContain("This launch is unavailable");
    expect(html).not.toContain("New Academy");
  });
});
