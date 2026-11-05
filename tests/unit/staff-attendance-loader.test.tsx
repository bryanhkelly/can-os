import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/errors";
import { loadAttendanceRoster, Route } from "@/routes/staff.attendance";

const state = vi.hoisted(() => ({
  roster: vi.fn(),
  pendingExcuses: vi.fn(),
}));

vi.mock("@/modules/attendance/onsite-attendance-workflow.functions", () => ({
  getAttendanceWorkspace: vi.fn(),
  listExpectedOnsiteRoster: state.roster,
  listExpectedPendingExcuses: state.pendingExcuses,
  markExpectedOnsiteAttendance: vi.fn(),
  reviewCurrentAttendanceExcuse: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: object) => ({ options }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }));
vi.mock("@/components/workspace", () => ({ QueryState: () => null, WorkspaceShell: () => null }));
vi.mock("@/components/workspace/workflow-intro", () => ({ WorkflowIntro: () => null }));
vi.mock("@/components/operations/ObsoleteExcuseClosure", () => ({ ObsoleteExcuseClosure: () => null }));
vi.mock("@/components/operations/ExcuseAttachments", () => ({ ExcuseAttachments: () => null }));
vi.mock("@/components/operations/AttendanceConfigurationNotice", () => ({ AttendanceConfigurationNotice: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  state.roster.mockResolvedValue({ students: [], programs: [], canConfigureAcademicYear: false });
  state.pendingExcuses.mockResolvedValue({ excuses: [] });
});

describe("staff attendance supplementary excuse reads", () => {
  it("preserves exact program, student-profile and date selection without coercing malformed values", () => {
    const validate = Route.options.validateSearch;
    if (typeof validate !== "function") throw new Error("Missing attendance search validator");
    const programId = "10000000-0000-4000-8000-000000000001";
    const student = "10000000-0000-4000-8000-000000000002";
    expect(validate({ programId, student, date: "2026-11-04" })).toEqual({ programId, student, date: "2026-11-04" });
    expect(validate({ programId: 42, student: false, date: "not-a-date" })).toEqual({
      programId: undefined, student: undefined, date: undefined,
    });
  });
  it("does not request excuse review data without the server-provided capability", async () => {
    const result = await loadAttendanceRoster({
      date: "2026-11-04", programId: "program", canReviewExcuses: false,
    });

    expect(state.roster).toHaveBeenCalledOnce();
    expect(state.pendingExcuses).not.toHaveBeenCalled();
    expect(result).toMatchObject({ excuses: [], excusesError: null });
  });

  it("keeps the roster available and classifies a failed authorized excuse read", async () => {
    state.pendingExcuses.mockRejectedValue(new DomainError("FORBIDDEN"));

    const result = await loadAttendanceRoster({
      date: "2026-11-04", programId: "program", canReviewExcuses: true,
    });

    expect(state.roster).toHaveBeenCalledOnce();
    expect(state.pendingExcuses).toHaveBeenCalledOnce();
    expect(result.students).toEqual([]);
    expect(result.excuses).toEqual([]);
    expect(result.excusesError).toMatchObject({
      kind: "authorization",
      message: "You do not have permission to perform this operation.",
      retryable: false,
    });
  });
});