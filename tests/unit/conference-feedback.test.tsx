import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const state = vi.hoisted(() => ({
  hooks: [] as unknown[],
  index: 0,
  create: vi.fn(),
  read: vi.fn(),
  cancel: vi.fn(),
  invalidate: vi.fn(),
  matches: [] as { id: string; status: string; loaderData?: unknown }[],
}));

vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.hooks)) state.hooks[index] = typeof initial === "function" ? initial() : initial;
    return [state.hooks[index], (value: unknown) => {
      state.hooks[index] = typeof value === "function" ? value(state.hooks[index]) : value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = state.index++;
    if (!(index in state.hooks)) state.hooks[index] = { current: initial };
    return state.hooks[index];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: () => undefined,
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: state.invalidate, state: { matches: state.matches } }),
  useSearch: () => ({}),
  Link: () => null,
}));
vi.mock("@/modules/conferences/conference.functions", () => ({
  createTeacherConferenceSeries: state.create,
  getTeacherConferences: state.read,
  cancelTeacherConferenceBooking: vi.fn(),
  completeTeacherConference: vi.fn(),
  queueTeacherConferenceReminder: vi.fn(),
}));
vi.mock("@/modules/student-experience/school-experiences.functions", () => ({
  bookOfficeHour: vi.fn(), rescheduleOfficeHour: vi.fn(), cancelOfficeHour: state.cancel,
}));
vi.mock("@/modules/learning/guardian-academic-queries.functions", () => ({
  getGuardianStudents: vi.fn(),
}));
vi.mock("@/modules/communication/notification-center.functions", () => ({ readNotification: vi.fn() }));

import { TeacherConferencePanel } from "@/components/teacher/TeacherConferencePanel";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import type { useMutationFeedback } from "@/lib/mutation-feedback";

type Node = ReactElement<{
  children?: unknown;
  onSubmit?: (event: { preventDefault(): void }) => void;
  onClick?: () => Promise<unknown> | void;
  onChange?: (event: { target: { value: string } }) => void;
  onConfirm?: () => void;
  title?: string;
  value?: unknown;
  state?: ReturnType<typeof useMutationFeedback>;
  "aria-label"?: string;
}>;
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function feedback(output: Node) {
  return nodes(output).find(node => node.type === MutationFeedback)!.props.state!;
}
function teacher() {
  state.index = 0;
  return TeacherConferencePanel();
}
function publish(output: Node) {
  nodes(output).find(node => node.type === "form")!.props.onSubmit!({ preventDefault() {} });
}
async function settle() {
  for (let count = 0; count < 10; count++) await Promise.resolve();
}

beforeEach(() => {
  vi.resetAllMocks();
  state.hooks = [];
  state.index = 0;
  state.matches = [{ id: "experiences", status: "success" }];
  vi.stubGlobal("window", { confirm: () => true });
});
afterEach(() => vi.unstubAllGlobals());

describe("conference mutation feedback", () => {
  it("blocks synchronous duplicate publishes and retries only a failed teacher read", async () => {
    state.hooks[0] = { connected: true, series: [], bookings: [] };
    state.create.mockResolvedValue({ seriesId: "series-1" });
    state.read.mockRejectedValueOnce(new Error("private database detail"))
      .mockResolvedValue({ connected: true, series: [], bookings: [] });
    const output = teacher();
    publish(output);
    publish(output);
    await settle();
    expect(state.create).toHaveBeenCalledOnce();
    expect(feedback(teacher())).toMatchObject({
      refreshFailed: true, notice: "Office-hour window published for guardians.",
    });
    expect(feedback(teacher()).error).not.toContain("private database");
    publish(teacher());
    expect(state.create).toHaveBeenCalledOnce();
    await feedback(teacher()).retryRefresh();
    expect(state.read).toHaveBeenCalledTimes(2);
    expect(state.create).toHaveBeenCalledOnce();
    expect(feedback(teacher()).refreshFailed).toBe(false);
  });

  it("treats a disconnected teacher refresh as failed, not saved reconciliation", async () => {
    state.hooks[0] = { connected: true, series: [], bookings: [] };
    state.create.mockResolvedValue({ seriesId: "series-1" });
    state.read.mockResolvedValue({ connected: false, series: [], bookings: [] });
    publish(teacher());
    await settle();
    expect(feedback(teacher()).refreshFailed).toBe(true);
  });

  it("normalizes a command failure without refreshing and permits a corrected retry", async () => {
    state.hooks[0] = { connected: true, series: [], bookings: [] };
    state.create.mockRejectedValueOnce(new Error("private database detail"))
      .mockResolvedValue({ seriesId: "series-1" });
    state.read.mockResolvedValue({ connected: true, series: [], bookings: [] });
    publish(teacher());
    await settle();
    expect(feedback(teacher())).toMatchObject({
      refreshFailed: false, error: "Unable to save conference change.", notice: "",
    });
    expect(state.read).not.toHaveBeenCalled();
    publish(teacher());
    await settle();
    expect(state.create).toHaveBeenCalledTimes(2);
    expect(feedback(teacher()).notice).toBe("Office-hour window published for guardians.");
  });

  it("retains uncertain payload identities across edits and resets only after receipt", async () => {
    state.hooks[0] = { connected: true, series: [], bookings: [] };
    state.create.mockRejectedValueOnce(new Error("network outcome unknown"))
      .mockRejectedValueOnce(new Error("network outcome unknown"))
      .mockResolvedValue({ seriesId: "saved" });
    state.read.mockResolvedValue({ connected: true, series: [], bookings: [] });
    publish(teacher());
    await settle();
    const original = state.create.mock.calls[0][0].data;
    nodes(teacher()).find(node => node.props.value === "Family office hours")?.props.onChange?.({
      target: { value: "Edited office hours" },
    });
    publish(teacher());
    await settle();
    const edited = state.create.mock.calls[1][0].data;
    expect(edited.seriesId).not.toBe(original.seriesId);
    expect(edited.title).toBe("Edited office hours");
    nodes(teacher()).find(node => node.props.value === "Edited office hours")?.props.onChange?.({
      target: { value: "Family office hours" },
    });
    publish(teacher());
    await settle();
    expect(state.create.mock.calls[2][0].data).toEqual(original);
    publish(teacher());
    await settle();
    expect(state.create.mock.calls[3][0].data.seriesId).not.toBe(original.seriesId);
  });

  it("preserves guardian cancellation success when the router resolves with a failed read", async () => {
    const data = {
      connected: true, viewerRole: "guardian" as const, events: [], notices: [], slots: [],
      recentConferenceNotes: [],
      bookings: [{ id: "booking", slotId: "slot", studentPersonId: "student", seriesId: "series",
        startsAt: "2027-01-01T10:00:00Z", endsAt: "2027-01-01T10:20:00Z",
        seriesTitle: "Office hours", teacherName: "Teacher", timezone: "UTC" }],
    };
    const render = () => { state.index = 0; return LiveSchoolExperiences({ data }); };
    state.cancel.mockResolvedValue({ cancelled: true });
    state.matches = [{ id: "experiences", status: "success", loaderData: { ok: false } }];
    const output = render();
    const cancel = nodes(output).find(node => node.props["aria-label"] === "Cancel appointment")!;
    cancel.props.onClick!();
    const dialog = nodes(render()).find(node => node.props.title?.startsWith("Cancel appointment"))!;
    dialog.props.onConfirm!();
    dialog.props.onConfirm!();
    await settle();
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(feedback(render())).toMatchObject({ refreshFailed: true, notice: "Appointment cancelled." });
    // The router state object is captured by the failed refresh's closure.
    state.matches[0].loaderData = { ok: true };
    await feedback(render()).retryRefresh();
    expect(state.invalidate).toHaveBeenCalledTimes(2);
    expect(state.cancel).toHaveBeenCalledOnce();
    expect(feedback(render()).refreshFailed).toBe(false);
  });
});
