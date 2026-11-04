import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as StudentGroups } from "@/routes/student.study-groups";
import { Route as NewStudyGroup } from "@/routes/student.study-groups_.new";
import { Route as SchoolYears } from "@/routes/operations.school-years";
import { Route as NewSchoolYear } from "@/routes/operations.school-years_.new";
import { Route as SchoolYearDetail } from "@/routes/operations.school-years_.$yearId";
import { Route as MySchool } from "@/routes/student.my-school";

const state = vi.hoisted(() => ({ search: {} as Record<string, unknown>, params: {} as Record<string, string>, data: null as unknown }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/hooks/useWorkspaceMutation", () => ({ useWorkspaceMutation: () => ({ isSubmitting: false, submit: vi.fn(), retryRefresh: vi.fn() }) }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({ options, useSearch: () => state.search, useParams: () => state.params, useLoaderData: () => state.data }),
  Link: ({ to, params, search, children, activeOptions: _activeOptions, activeProps: _activeProps, ...props }: { to: string; params?: Record<string, string>; search?: Record<string, string | undefined>; activeOptions?: unknown; activeProps?: unknown; children: ReactNode }) => {
    const query = new URLSearchParams(Object.entries(search ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString();
    const path = to.replace(/\$(\w+)/g, (_, name: string) => params?.[name] ?? `$${name}`);
    return <a href={path + (query ? "?" + query : "")} {...props}>{children}</a>;
  },
  useRouter: () => ({ invalidate: vi.fn() }),
  useNavigate: () => vi.fn(),
  useBlocker: vi.fn(),
  useSearch: () => ({}),
}));
vi.mock("@/components/shell/WorkspaceSession", () => ({
  useWorkspaceSession: () => ({ session: { authenticated: true, sites: [{ id: "valor", name: "Valor Christian Academy" }] } }),
}));
vi.mock("@/modules/study-groups/canonical-workspace.functions", () => ({ getStudyGroupAvailability: vi.fn() }));
vi.mock("@/modules/study-groups/canonical-membership.functions", () => ({
  requestCanonicalGroupMembership: vi.fn(), leaveCanonicalGroup: vi.fn(), createStudentStudyGroup: vi.fn(),
}));
vi.mock("@/modules/study-groups/study-group-queries.functions", () => ({
  listStudyGroups: vi.fn(), getStudyGroupDetail: vi.fn(), listStudentStudyGroupSections: vi.fn(),
  listStudentStudyGroupClassmates: vi.fn(() => new Promise(() => {})), hasStudentStudyGroupGuardian: vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-moderation.functions", () => ({ createCanonicalGroupPost: vi.fn(), reportCanonicalGroupPost: vi.fn() }));
vi.mock("@/modules/study-groups/canonical-sessions.functions", () => ({ rsvpCanonicalGroupSession: vi.fn() }));
vi.mock("@/modules/academic-time/school-year-studio.functions", () => ({
  getSchoolYearStudio: vi.fn(), createStudioGradeScale: vi.fn(), createStudioYear: vi.fn(), activateStudioYear: vi.fn(),
  addStudioCalendar: vi.fn(), addStudioCalendarDay: vi.fn(), addStudioGradingPeriod: vi.fn(), addStudioTerm: vi.fn(), addStudioSchedule: vi.fn(),
  populateStudioInstructionalDays: vi.fn(), prepareStudioYear: vi.fn(), removeStudioCalendarDay: vi.fn(), replaceStudioSchedulePeriods: vi.fn(),
}));
vi.mock("@/modules/student-experience/school-experiences.functions", () => ({
  getSchoolExperiences: vi.fn(), bookOfficeHour: vi.fn(), cancelOfficeHour: vi.fn(), rescheduleOfficeHour: vi.fn(),
}));
vi.mock("@/modules/communication/notification-center.functions", () => ({ readNotification: vi.fn() }));
vi.mock("@/modules/learning/guardian-academic-queries.functions", () => ({ getGuardianStudents: vi.fn() }));

function render(route: { options: { component?: unknown } }) {
  const Page = route.options.component;
  if (typeof Page !== "function") throw new Error("Missing page component");
  return renderToStaticMarkup(<Page />);
}
const successful = (data: unknown) => { state.data = { ok: true, data }; };
const createActions = (html: string) => html.match(/data-create-action=""/g)?.length ?? 0;

const groupsData = (overrides: object = {}) => ({
  enabled: true, writesEnabled: true, membershipEnabled: true, creationEnabled: true, contentEnabled: true,
  groups: [{ id: "group", title: "Algebra circle", kind: "course", capacity: 20, membership: null, description: "Practice" }],
  sections: [{ id: "section", title: "Algebra I" }], hasEnrollmentGuardian: true, ...overrides,
});
const studio = {
  sites: [{ id: "valor", name: "Valor", organizationId: "org", organizationName: "Valor", timezone: "America/Denver" }],
  programs: [{ id: "program", name: "Upper school", siteId: "valor" }],
  gradeScales: [{ id: "scale", name: "Standard A–F", organizationId: "org" }],
  years: [{ id: "year", name: "2026–2027", key: "2026-27", status: "draft", siteId: "valor", organizationId: "org", programId: null,
    startsOn: "2026-08-17", endsOn: "2027-06-04", timezone: "America/Denver",
    terms: [{ id: "term", name: "Fall semester", startsOn: "2026-08-17", endsOn: "2026-12-18", periods: [{ id: "gp", name: "Quarter 1", termId: "term" }] }],
    calendars: [{ id: "cal", name: "2026–2027 calendar", days: [
      ...Array.from({ length: 30 }, (_, index) => ({ id: `d${index}`, academicCalendarId: "cal", calendarDate: `2026-${index < 15 ? "09" : "10"}-${String(index % 15 + 1).padStart(2, "0")}`, type: "instructional", title: null, instructionalMinutes: 390 })),
      { id: "h1", academicCalendarId: "cal", calendarDate: "2026-11-26", type: "holiday", title: "Thanksgiving", instructionalMinutes: 0 },
    ] }],
    schedules: [] }],
};

beforeEach(() => { state.search = {}; state.params = {}; state.data = null; });

describe("study groups: directory and dedicated create page", () => {
  it("leads with the directory and one blue create entry point, without an embedded form", () => {
    successful(groupsData());
    const html = render(StudentGroups);
    expect(createActions(html)).toBe(1);
    expect(html).toContain('href="/student/study-groups/new"');
    expect(html).toContain("Create study group");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Invite classmates");
    expect(html).toContain("Algebra circle");
  });

  it("omits the create entry point when the student cannot create a group", () => {
    successful(groupsData({ hasEnrollmentGuardian: false }));
    expect(createActions(render(StudentGroups))).toBe(0);
    successful(groupsData({ creationEnabled: false }));
    expect(createActions(render(StudentGroups))).toBe(0);
  });

  it("renders grouped fields with Create and Cancel back to the directory", () => {
    successful({ available: true, sections: [{ id: "section", title: "Algebra I" }], hasEnrollmentGuardian: true });
    const html = render(NewStudyGroup);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Create study group</h1>");
    expect(html).toContain("<form");
    expect(html.match(/data-form-section=""/g)).toHaveLength(2);
    expect(html).toContain("Group name");
    expect(html).toMatch(/<div data-form-actions=""[^>]*><button type="submit"[^>]*>Create study group<\/button><a href="\/student\/study-groups"[^>]*>Cancel<\/a>/);
    expect(html).toContain('href="/student/study-groups"');
  });

  it("explains why creation is unavailable instead of showing a form", () => {
    successful({ available: true, sections: [{ id: "section", title: "Algebra I" }], hasEnrollmentGuardian: false });
    const html = render(NewStudyGroup);
    expect(html).not.toContain("<form");
    expect(html).toContain("A linked guardian is required");
    successful({ available: false, sections: [], hasEnrollmentGuardian: null });
    expect(render(NewStudyGroup)).toContain("Creating study groups is unavailable right now.");
  });
});

describe("school years: saved years first and dedicated create page", () => {
  it("lists saved years with one scoped create entry point and no embedded form", () => {
    state.search = { siteId: "valor", programId: "program" };
    successful(studio);
    const html = render(SchoolYears);
    expect(createActions(html)).toBe(1);
    expect(html).toContain('href="/operations/school-years/new?siteId=valor&amp;programId=program"');
    expect(html).toContain('id="school-year-year"');
    expect(html).toContain("Saved school years");
    expect(html).not.toContain("Year key");
    expect(html).not.toContain("School-year planning steps");
  });

  it("renders the create form with Cancel returning to the same scope", () => {
    state.search = { siteId: "valor", programId: "program" };
    successful(studio);
    const html = render(NewSchoolYear);
    expect(html).toContain("Create school year</h1>");
    expect(html.match(/data-form-section=""/g)).toHaveLength(3);
    for (const label of ["Site", "Year name", "Year key", "Starts", "Ends", "Grading scale"]) expect(html).toContain(label);
    expect(html).toMatch(/data-form-actions=""[^>]*><button type="submit"[^>]*>Create school year<\/button><a href="\/operations\/school-years\?siteId=valor&amp;programId=program"[^>]*>Cancel<\/a>/);
    expect(createActions(html)).toBe(0);
  });
});

describe("school year record: one workspace with sections", () => {
  const record = (tab?: string) => {
    state.params = { yearId: "year" };
    state.search = { siteId: "valor", ...(tab ? { tab } : {}) };
    successful(studio);
    return render(SchoolYearDetail);
  };

  it("lists each year as a bounded summary that opens its record", () => {
    state.search = { siteId: "valor" };
    successful(studio);
    const html = render(SchoolYears);
    expect(html).toContain('href="/operations/school-years/year?siteId=valor"');
    expect(html).toContain("1 term · 1 grading period · 30 instructional days · 0 schedules");
    expect(html).not.toContain("Term name");
    expect(html).not.toContain("2026-09-01");
    expect(html).not.toContain("Activate year");
  });

  it("leads with identity, status, section navigation and a summary", () => {
    const html = record();
    expect(html).toContain("2026–2027</h1>");
    expect(html).toContain("Draft");
    expect(html).toContain('aria-label="School year sections"');
    expect(html).toMatch(/<a href="\/operations\/school-years\/year\?siteId=valor" aria-current="page">Overview<\/a>/);
    expect(html).toContain('href="/operations/school-years?siteId=valor"');
    expect(html).toContain("Activate year");
    expect(html).toContain("30 days");
    expect(html).toContain("Prepare your academic year");
    expect(html).not.toContain("Term name");
    expect(html).not.toContain("2026-09-01");
  });

  it("keeps terms editing on the Terms section", () => {
    const html = record("terms");
    expect(html).toContain("Fall semester");
    expect(html).toContain("Quarter 1");
    expect(html).toContain("Term name");
    expect(html).not.toContain("Prepare your academic year");
  });

  it("summarises instructional days by month and lists exceptions first", () => {
    const html = record("calendar");
    expect(html).toContain("30 instructional days · 1 holiday, closure or special day");
    expect(html.indexOf("Thanksgiving")).toBeLessThan(html.indexOf("Instructional days by month"));
    expect(html).toContain("September 2026");
    expect(html).toContain("October 2026");
    expect(html.match(/<details/g)).toHaveLength(2);
    expect(html.match(/<(button|a)[^>]* bg-primary /g)).toHaveLength(1);
  });

  it("explains an unavailable or out-of-scope year without leaking data", () => {
    state.params = { yearId: "other" };
    successful(studio);
    const html = render(SchoolYearDetail);
    expect(html).toContain("School year not found</h1>");
    expect(html).not.toContain("2026–2027");
  });
});
describe("My School is the student's school record", () => {
  const experiences = {
    connected: true, viewerRole: "student", bookings: [], recentConferenceNotes: [], slots: [],
    events: [], notices: Array.from({ length: 5 }, (_, index) => ({
      id: `notice-${index}`, title: `Notice ${index}`, body: "Body", acknowledged: false,
    })),
  };

  it("leads with school identity, section navigation and bounded overview previews", () => {
    successful(experiences);
    const html = render(MySchool);
    expect(html).toContain("Valor Christian Academy</h1>");
    expect(html).not.toContain("School &amp; community");
    expect(html).toContain('aria-label="School sections"');
    expect(html).toMatch(/<a href="\/student\/my-school" aria-current="page">Overview<\/a>/);
    expect(html.match(/Notice \d/g)).toHaveLength(3);
    expect(html).toContain('href="/student/my-school?tab=announcements"');
    expect(html).toContain("View all 5 announcements");
    expect(html).toContain('data-school-mark=""');
  });

  it("shows one full section and keeps Mark as read quiet, not primary", () => {
    state.search = { tab: "announcements" };
    successful(experiences);
    const html = render(MySchool);
    expect(html.match(/Notice \d/g)).toHaveLength(5);
    expect(html).not.toContain("School calendar</h2>");
    expect(html).toMatch(/<a href="\/student\/my-school\?tab=announcements" aria-current="page">Announcements<\/a>/);
    const markButtons = html.match(/<button[^>]*>Mark as read<\/button>/g) ?? [];
    expect(markButtons).toHaveLength(5);
    for (const button of markButtons) {
      expect(button).toContain("border-border");
      expect(button).not.toContain("bg-primary");
    }
    expect(createActions(html)).toBe(0);
  });
});
