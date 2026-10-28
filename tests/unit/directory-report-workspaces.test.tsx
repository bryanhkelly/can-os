import type { EffectCallback, ReactNode, SetStateAction } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route as Students } from "@/routes/staff.students.index";
import { Route as Teachers } from "@/routes/staff.teachers";
import { Route as StudentReport } from "@/routes/student.report-card";
import { Route as GuardianReport } from "@/routes/guardian.report-cards";
import { QueryState } from "@/components/workspace";
import { getGuardianStudents } from "@/modules/learning/guardian-academic-queries.functions";
import { getStudentReportCard, getStudentTranscript } from "@/modules/learning/report-cards.functions";

const state = vi.hoisted(() => ({
  values: [] as unknown[], index: 0, effects: [] as EffectCallback[],
  search: {} as { student?: string }, navigate: vi.fn(),
  searchStudents: vi.fn(), listTeachers: vi.fn(),
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = state.index++;
    if (!(index in state.values)) state.values[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [state.values[index] as T, (value: SetStateAction<T>) => {
      state.values[index] = typeof value === "function" ? (value as (prior: T) => T)(state.values[index] as T) : value;
    }];
  },
  useEffect: (effect: EffectCallback) => { state.effects.push(effect); },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    options, useSearch: () => state.search, useNavigate: () => state.navigate,
  }),
  Link: ({ to, params, search, children, ...props }: {
    to: string; params?: Record<string, string>; search?: Record<string, string>; children: ReactNode;
  }) => <a href={to.replace(/\$([^/]+)/g, (_, key: string) => params?.[key] ?? key)
    + (search ? `?${new URLSearchParams(search)}` : "")} {...props}>{children}</a>,
}));
vi.mock("@/modules/profiles/directory.functions", () => ({
  searchStudents: state.searchStudents, listTeachers: state.listTeachers,
}));
vi.mock("@/modules/learning/report-cards.functions", () => ({
  getStudentReportCard: vi.fn(), getStudentTranscript: vi.fn(),
}));
vi.mock("@/modules/learning/guardian-academic-queries.functions", () => ({ getGuardianStudents: vi.fn() }));
vi.mock("@/components/profiles/ProfilePhoto", () => ({ ProfilePhoto: () => null }));

function render(route: typeof Students | typeof Teachers | typeof StudentReport | typeof GuardianReport) {
  state.index = 0;
  state.effects = [];
  const Page = route.options.component;
  if (typeof Page !== "function") throw new Error("Missing workspace component");
  return renderToStaticMarkup(<Page />);
}
const child = { studentPersonId: "child", firstName: "Alex", lastName: "Learner" };
const grade = {
  sectionGradeId: "grade", sectionTitle: "English", letterGrade: "F", percentage: "0", score: "0",
  schoolYearName: "2026", termName: "Fall", gradingPeriodName: "Quarter 1",
  programName: "Program", creditIssuingOrganization: "School", creditsEarned: 0, creditsAttempted: 1,
};
const transcript = { rows: [grade], issuances: [{
  id: "issuance", issuedAt: "2026-10-01", purpose: "Official record", issuingOrganization: "School",
}] };

beforeEach(() => {
  state.values = [];
  state.index = 0;
  state.effects = [];
  state.search = {};
  vi.resetAllMocks();
});
afterEach(() => { vi.useRealTimers(); });

describe("shared workspace query state", () => {
  it("shows only loading, then error, then empty, then content in that order", () => {
    const view = (loading: boolean, error: string, isEmpty: boolean) => renderToStaticMarkup(
      <QueryState loading={loading && "Loading records"} error={error} isEmpty={isEmpty}
        empty={<p>No records</p>}><p>Private records</p></QueryState>,
    );
    expect(view(true, "Failed", true)).toContain('role="status"');
    expect(view(true, "Failed", true)).not.toContain("Failed");
    expect(view(false, "Failed", true)).toContain('role="alert"');
    expect(view(false, "Failed", true)).not.toContain("No records");
    expect(view(false, "", true)).toContain("No records");
    expect(view(false, "", true)).not.toContain("Private records");
    expect(view(false, "", false)).toContain("Private records");
  });
});

describe.each([
  { route: Students, name: "students", fetch: state.searchStudents, key: "students",
    row: { personId: "learner", name: "Alex Learner", gradeLevel: "9", activeSectionCount: 0, openMissingWorkCount: 0 },
    href: "/staff/students/learner" },
  { route: Teachers, name: "teachers", fetch: state.listTeachers, key: "teachers",
    row: { personId: "teacher", name: "Taylor Teacher", sections: ["English"], studentCount: 0 },
    href: "/profiles?person=teacher" },
])("$name directory shared presentation", ({ route, name, fetch, key, row, href }) => {
  it("renders one landmark and search controls while loading, without an empty table", () => {
    const html = render(route);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('type="search"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<table");
    expect(html).not.toContain("matched your search");
  });
  it("distinguishes errors from a successful empty response", () => {
    state.values = ["", [], false, "Access unavailable"];
    const failed = render(route);
    expect(failed).toContain('role="alert"');
    expect(failed).not.toContain("matched your search");
    state.values[3] = "";
    const empty = render(route);
    expect(empty).toContain(`No ${name} matched your search`);
    expect(empty).not.toContain("<table");
  });
  it("keeps exact profile links and zero counts in successful results", () => {
    state.values = ["", [row], false, ""];
    const html = render(route);
    expect(html).toContain(`href="${href}"`);
    expect(html).toContain(">0</td>");
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain('role="status"');
  });
  it("recovers from a failed search and retains the 250ms trimmed-query debounce", async () => {
    vi.useFakeTimers();
    fetch.mockRejectedValueOnce(new Error("Unavailable"));
    render(route);
    const effect = state.effects[0];
    if (!effect) throw new Error("Missing directory search effect");
    const cleanup = effect();
    await vi.advanceTimersByTimeAsync(249);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(render(route)).toContain('role="alert"');
    if (typeof cleanup === "function") cleanup();
    state.values[0] = "  Alex  ";
    fetch.mockResolvedValueOnce({ [key]: [row] });
    render(route);
    state.effects[0]?.();
    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenLastCalledWith({ data: { query: "Alex" } });
    const recovered = render(route);
    expect(recovered).toContain(`href="${href}"`);
    expect(recovered).not.toContain('role="alert"');
  });
  it("ignores a late response after the search effect is disposed", async () => {
    vi.useFakeTimers();
    let resolve!: (result: unknown) => void;
    fetch.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    render(route);
    const cleanup = state.effects[0]?.();
    await vi.advanceTimersByTimeAsync(250);
    if (typeof cleanup === "function") cleanup();
    resolve({ [key]: [row] });
    await Promise.resolve();
    expect(state.values[1]).toEqual([]);
  });
});

describe("report-card shared presentation", () => {
  it("suppresses report and transcript panels while loading or failing", () => {
    for (const [loading, error] of [[true, ""], [false, "Report unavailable"]] as const) {
      state.values = [[grade], transcript, loading, error];
      const html = render(StudentReport);
      expect(html).toContain(loading ? 'role="status"' : 'role="alert"');
      expect(html).not.toContain("English");
      expect(html).not.toContain("Official issuances");
      expect(html.match(/<main/g)).toHaveLength(1);
    }
  });
  it("preserves zero grades, transcript credits and official issuances", () => {
    state.values = [[grade], transcript, false, ""];
    const html = render(StudentReport);
    expect(html).toContain("English");
    expect(html).toContain("0%");
    expect(html).toContain("0/1 credits earned");
    expect(html).toContain("Official record");
  });
  it("retains meaningful empty academic results rather than treating them as missing access", () => {
    state.values = [[], { rows: [], issuances: [] }, false, ""];
    const html = render(StudentReport);
    expect(html).toContain("No finalized grades yet");
    expect(html).toContain("No finalized grades on record yet");
    expect(html).not.toContain('role="alert"');
  });
  it("does not render empty reports for an explicitly unavailable guardian child", () => {
    state.search = { student: "unavailable" };
    state.values = [[child], "", [], { rows: [], issuances: [] }, false, false, ""];
    const html = render(GuardianReport);
    expect(html).toContain('role="alert"');
    expect(html).toContain("This student is unavailable");
    expect(html).toContain("Alex Learner");
    expect(html).not.toContain("No finalized grades");
    expect(html).not.toContain(">Transcript<");
  });
  it("distinguishes no authorized children from a selected child's empty grades", () => {
    state.values = [[], "", [], { rows: [], issuances: [] }, false, false, ""];
    expect(render(GuardianReport)).toContain("No students with academic-viewing permission");
    state.values = [[child], "child", [], { rows: [], issuances: [] }, false, false, ""];
    const selected = render(GuardianReport);
    expect(selected).toContain("No finalized grades yet");
    expect(selected).not.toContain("No students with academic-viewing permission");
  });
  it.each(["child", "unavailable"])("loads reports only for the authorized requested child (%s)", async student => {
    state.search = { student };
    vi.mocked(getGuardianStudents).mockResolvedValue({ connected: true, students: [child] });
    vi.mocked(getStudentReportCard).mockResolvedValue({ grades: [grade] });
    vi.mocked(getStudentTranscript).mockResolvedValue(transcript);
    render(GuardianReport);
    state.effects[0]?.();
    await Promise.resolve();
    render(GuardianReport);
    state.effects[1]?.();
    await Promise.resolve();
    await Promise.resolve();
    const html = render(GuardianReport);
    if (student === "child") {
      expect(getStudentReportCard).toHaveBeenCalledWith({ data: { studentPersonId: "child" } });
      expect(getStudentTranscript).toHaveBeenCalledWith({ data: { studentPersonId: "child" } });
      expect(html).toContain("English");
    } else {
      expect(getStudentReportCard).not.toHaveBeenCalled();
      expect(getStudentTranscript).not.toHaveBeenCalled();
      expect(html).toContain("This student is unavailable");
    }
  });
});
