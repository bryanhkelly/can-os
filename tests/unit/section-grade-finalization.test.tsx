import { type EffectCallback, type ReactElement, type ReactNode, type SetStateAction, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SectionGradeFinalization } from "@/components/learning/SectionGradeFinalization";
vi.mock("@tanstack/react-router",()=>({Link:({to,search,children}:{to:string;search?:Record<string,string>;children:ReactNode})=>
  <a href={to+"?"+new URLSearchParams(search)}>{children}</a>}));

const state = vi.hoisted(() => ({
  slots: [] as unknown[], cursor: 0, effects: [] as EffectCallback[],
  read: vi.fn(), finalize: vi.fn(), correct: vi.fn(),
}));
vi.mock("@/modules/learning/report-cards.functions", () => ({
  getSectionGradeFinalization: state.read,
  finalizeSectionGrades: state.finalize,
  correctSectionGrade: state.correct,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: <T,>(initial: T | (() => T)) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
    return [state.slots[index] as T, (next: SetStateAction<T>) => {
      state.slots[index] = typeof next === "function" ? (next as (value: T) => T)(state.slots[index] as T) : next;
    }];
  },
  useRef: <T,>(initial: T) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = { current: initial };
    return state.slots[index];
  },
  useCallback: <T,>(callback: T) => callback,
  useEffect: (effect: EffectCallback) => { state.effects.push(effect); },
}));

type ControlProps = {
  children?: ReactNode;
  onClick?: () => void;
  onChange?: (event: { target: { value: string } }) => void;
  value?: string;
  disabled?: boolean;
  "aria-label"?: string;
};

const sectionId = "11111111-1111-4111-8111-111111111111";
const periodId = "22222222-2222-4222-8222-222222222222";
const laterPeriodId = "33333333-3333-4333-8333-333333333333";
const gradeId = "44444444-4444-4444-8444-444444444444";
const model = {
  connected: true as const,
  section: { id: sectionId, title: "Algebra I" },
  gradeScaleConfigured: true,
  enrolledStudents: 2,
  gradingPeriods: [
    { id: periodId, name: "Quarter 1", sequence: 1, startsOn: "2030-08-01", endsOn: "2030-10-01" },
    { id: laterPeriodId, name: "Quarter 2", sequence: 2, startsOn: "2030-10-02", endsOn: "2030-12-15" },
  ],
  grades: [{
    id: gradeId, studentProfileId: "profile-1", studentName: "Ada Lovelace",
    gradingPeriodId: periodId, letterGrade: "B", percentage: "84.00",
    finalizedAt: "2030-10-05T12:00:00.000Z", corrections: 0,
  }],
};

function render() {
  state.cursor = 0; state.effects = [];
  const wrapper = SectionGradeFinalization({ sectionId });
  const Form = wrapper.type as (props: { sectionId: string }) => ReactElement;
  return Form(wrapper.props);
}
function controls(node: ReactNode): Array<ReactElement<ControlProps>> {
  if (Array.isArray(node)) return node.flatMap(controls);
  if (!isValidElement<ControlProps>(node)) return [];
  return [node, ...controls(node.props.children)];
}
function words(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(words).join("");
  return isValidElement<ControlProps>(node) ? words(node.props.children) : "";
}
function findButton(label: string) {
  return controls(render()).find((node) => node.type === "button" && words(node.props.children).includes(label));
}
function findField(label: string) {
  return controls(render()).find((node) => node.props["aria-label"] === label);
}
function setField(label: string, value: string) {
  const field = findField(label);
  if (!field?.props.onChange) throw new Error(`Field unavailable: ${label}`);
  field.props.onChange({ target: { value } });
}
function mount() {
  render();
  const cleanup = state.effects[0]?.();
  return typeof cleanup === "function" ? cleanup : () => {};
}
async function loaded() {
  mount();
  await vi.waitFor(() => expect(findButton("Finalize grades")).toBeDefined());
}

beforeEach(() => {
  vi.clearAllMocks(); state.slots = []; state.cursor = 0; state.effects = [];
  state.read.mockResolvedValue(model);
  state.finalize.mockResolvedValue({ finalized: 1, skipped: 1 });
  state.correct.mockResolvedValue({ corrected: true });
});

describe("gradebook section grade finalization panel", () => {
  it("explains what finalization validates and shows per-period progress", async () => {
    await loaded();
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Close grading period / finalize grades");
    expect(html).toContain("latest submission, when graded");
    expect(html).toContain("active grade scale");
    expect(html).toContain("Finalized grades are immutable");
    expect(html).toContain("Quarter 1");
    expect(html).toContain("1 of 2 finalized");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("B (84.00%)");
    expect(state.read).toHaveBeenCalledWith({ data: { sectionId } });
  });

  it("reviews unfinished assignments with an exact student and assessment link before finalizing",async()=>{
    state.finalize.mockResolvedValue({preview:true,eligible:1,blockers:[{
      studentProfileId:"profile-2",studentName:"Grace Hopper",assessmentId:"essay",assessmentTitle:"Essay",status:"submitted",
    }]});
    await loaded();
    findButton("Review unfinished work")?.props.onClick?.();
    await vi.waitFor(()=>expect(renderToStaticMarkup(render())).toContain("Grace Hopper"));
    expect(state.finalize).toHaveBeenCalledWith({data:{sectionId,gradingPeriodId:periodId,previewOnly:true}});
    const html=renderToStaticMarkup(render());
    expect(html).toContain("Awaiting grading");
    expect(html).toContain("student=profile-2&amp;assessment=essay");
    expect(html).not.toContain("Finalized 1 grade");
  });

  it("finalizes the grading period selected by the teacher", async () => {
    await loaded();
    const periodSelect = findField("Grading period to finalize");
    periodSelect?.props.onChange?.({ target: { value: laterPeriodId } });
    findButton("Finalize grades")?.props.onClick?.();
    await vi.waitFor(() => expect(state.finalize).toHaveBeenCalledOnce());
    expect(state.finalize).toHaveBeenCalledWith({ data: { sectionId, gradingPeriodId: laterPeriodId } });
    await vi.waitFor(() => {
      const html = renderToStaticMarkup(render());
      expect(html).toContain("Finalized 1 grade");
      expect(html).toContain("1 enrolled student skipped");
      expect(html).toContain("report cards and transcripts");
    });
    // The panel reloads periods and finalized rows after a successful run.
    expect(state.read).toHaveBeenCalledTimes(2);
  });

  it("shows the server's rejection instead of a fake success", async () => {
    state.finalize.mockRejectedValue(new Error("Active school grade scale is required"));
    await loaded();
    findButton("Finalize grades")?.props.onClick?.();
    await vi.waitFor(() => {
      const html = renderToStaticMarkup(render());
      expect(html).toContain('role="alert"');
      expect(html).toContain("Active school grade scale is required");
    });
    expect(renderToStaticMarkup(render())).not.toContain("Finalized 1 grade");
    expect(state.read).toHaveBeenCalledTimes(1);
  });

  it("corrects a finalized grade with a percentage and recorded reason", async () => {
    await loaded();
    findButton("Correct grade")?.props.onClick?.();
    setField("Corrected percentage for Ada Lovelace", "92.5");
    setField("Correction reason for Ada Lovelace", "Verified scoring error on the final quiz.");
    const record = findButton("Record correction");
    expect(record?.props.disabled).toBe(false);
    record?.props.onClick?.();
    await vi.waitFor(() => expect(state.correct).toHaveBeenCalledOnce());
    expect(state.correct).toHaveBeenCalledWith({ data: {
      sectionGradeId: gradeId,
      percentage: 92.5,
      reason: "Verified scoring error on the final quiz.",
    } });
    await vi.waitFor(() => expect(renderToStaticMarkup(render()))
      .toContain("Corrected the finalized grade for Ada Lovelace"));
    expect(state.read).toHaveBeenCalledTimes(2);
  });

  it("requires a corrected value and a meaningful reason before recording", async () => {
    await loaded();
    findButton("Correct grade")?.props.onClick?.();
    expect(findButton("Record correction")?.props.disabled).toBe(true);
    setField("Corrected letter grade for Ada Lovelace", "A");
    expect(findButton("Record correction")?.props.disabled).toBe(true);
    setField("Correction reason for Ada Lovelace", "Verified scoring error on the final quiz.");
    const record = findButton("Record correction");
    expect(record?.props.disabled).toBe(false);
    record?.props.onClick?.();
    await vi.waitFor(() => expect(state.correct).toHaveBeenCalledOnce());
    expect(state.correct).toHaveBeenCalledWith({ data: {
      sectionGradeId: gradeId,
      letterGrade: "A",
      reason: "Verified scoring error on the final quiz.",
    } });
  });

  it("shows the correction rejection from the server", async () => {
    state.correct.mockRejectedValue(new Error("Only finalized grades can be corrected"));
    await loaded();
    findButton("Correct grade")?.props.onClick?.();
    setField("Corrected percentage for Ada Lovelace", "92.5");
    setField("Correction reason for Ada Lovelace", "Verified scoring error on the final quiz.");
    findButton("Record correction")?.props.onClick?.();
    await vi.waitFor(() => {
      const html = renderToStaticMarkup(render());
      expect(html).toContain('role="alert"');
      expect(html).toContain("Only finalized grades can be corrected");
    });
    expect(state.correct).toHaveBeenCalledOnce();
  });

  it("warns when the school year has no configured grade scale", async () => {
    state.read.mockResolvedValue({ ...model, gradeScaleConfigured: false });
    await loaded();
    expect(renderToStaticMarkup(render())).toContain("no configured grade scale");
  });
});
