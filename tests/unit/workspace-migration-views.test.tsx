import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as Courses } from "@/routes/student.courses";
import { FamilyHomeView } from "@/routes/guardian.index";
import { Student360View } from "@/routes/staff.students.$personId";
import { LaunchPortfolio } from "@/components/operations/LaunchPortfolio";
import { WorkspaceShell } from "@/components/workspace";
import { getCourseRegistration } from "@/modules/learning/course-registration.functions";
import { getAssignments } from "@/modules/student-experience/assignments.functions";

const state = vi.hoisted(() => ({ search: {} as Record<string, unknown>, data: null as unknown }));
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
    }];
    const html = renderToStaticMarkup(<FamilyHomeView children={children} needs={[]} loading={false} error=""/>);
    expect(html).toContain("3 assignment(s) need follow-through.");
    expect(html).toContain('href="/guardian/academics?student=child-person"');
    expect(html).toContain('href="/guardian/attendance?student=child-person"');
    expect(html).toContain('href="/guardian/report-cards?student=child-person"');
    expect(html).not.toContain("student=child-profile");
  });
  const profile: ComponentProps<typeof Student360View>["profile"] = {
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
});

describe("launch portfolio", () => {
  const launch: ComponentProps<typeof LaunchPortfolio>["launches"][number] = {
    id: "program", name: "New Academy", slug: "new-academy", type: "academy", status: "launching",
    organizationId: "organization", siteId: "school", createdAt: "2030-01-01", journey: { id: "journey", status: "in_progress" },
    requirements: [{ id: "req", key: "staffing", title: "Assign teachers", status: "pending", blocking: true }],
  };
  it("shows real blockers and exact program/site destinations", () => {
    const html = renderToStaticMarkup(<LaunchPortfolio launches={[launch]} sites={[]} siteId="school"/>);
    expect(html).toContain("0 / 1 complete (0%)");
    expect(html).toContain("Assign teachers");
    expect(html).toContain('href="/operations/launch/program?siteId=school"');
    expect(html).toContain('href="/operations/launch?siteId=school&amp;programId=program"');
  });
  it("reports unavailable scope without showing a different program", () => {
    const html = renderToStaticMarkup(<LaunchPortfolio launches={[launch]} sites={[]} programId="unavailable"/>);
    expect(html).toContain("This launch is unavailable");
    expect(html).not.toContain("New Academy");
  });
});
