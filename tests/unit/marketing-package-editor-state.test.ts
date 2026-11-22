import { describe, expect, it } from "vitest";
import { initialMarketingContent } from "@/domain/marketing-package-v61";
import { marketingEditorReducer, type MarketingEditorState } from "@/components/launch-studio/marketing-package-editor-state";

const content = initialMarketingContent("Example Site", "site-announcement");
const saved = {
  id: "record-1", title: "Saved outreach", content,
} as NonNullable<MarketingEditorState["record"]>;

const initial = (): MarketingEditorState => ({
  view: "library", record: null, title: "Initial outreach",
  content, step: 0, hasAuthoredCopy: false, previewFormat: "email", editingFormat: null,
});

describe("Marketing Package working editor transitions", () => {
  it("opens the saved package atomically without discarding its authored copy", () => {
    const opened = marketingEditorReducer(initial(), {
      type: "open", record: saved, content: saved.content, editing: false,
    });
    expect(opened).toMatchObject({
      view: "detail", record: saved, title: saved.title,
      hasAuthoredCopy: true, editingFormat: null, step: 0,
    });
    const edited = marketingEditorReducer(opened, {
      type: "patch", patch: { headline: "Operator-reviewed headline" },
    });
    expect(edited.content.headline).toBe("Operator-reviewed headline");
    expect(opened.content.headline).toBe(content.headline);
    expect(edited.record).toBe(saved);
  });

  it("starts a new draft with a clean editor and does not retain the old selected record", () => {
    const old = { ...initial(), view: "detail" as const, record: saved, step: 4,
      editingFormat: "email" as const, hasAuthoredCopy: true };
    const started = marketingEditorReducer(old, {
      type: "start", title: "New outreach", content: { ...content, message: "" },
    });
    expect(started).toMatchObject({
      view: "wizard", title: "New outreach", record: null, step: 0,
      editingFormat: null, hasAuthoredCopy: false,
    });
    expect(started.content.message).toBe("");
  });

  it("duplicates into an editable authored draft and discards unsaved edits without mutating a release", () => {
    const duplicated = marketingEditorReducer(initial(), { type: "duplicate", record: saved });
    expect(duplicated).toMatchObject({
      view: "wizard", record: saved, title: saved.title,
      content: saved.content, step: 0, hasAuthoredCopy: true,
    });
    const discarded = marketingEditorReducer(duplicated, { type: "discard" });
    expect(discarded.view).toBe("library");
    expect(discarded.record).toBeNull();
    expect(discarded.editingFormat).toBeNull();
  });

  it("preserves React functional step updates and does not flag non-copy edits as authored text", () => {
    const advanced = marketingEditorReducer(initial(), { type: "step", update: previous => previous + 1 });
    expect(advanced.step).toBe(1);
    const selection = marketingEditorReducer(advanced, { type: "patch", patch: { geography: "Local" } });
    expect(selection.hasAuthoredCopy).toBe(false);
    const copy = marketingEditorReducer(selection, { type: "patch", patch: { callToAction: "Join us" } });
    expect(copy.hasAuthoredCopy).toBe(true);
  });
});
