import type { SetStateAction } from "react";
import type { MarketingFormat, MarketingPackageContent } from "@/domain/marketing-package-v61";
import type { listSiteMarketingPackagesV61 } from "@/modules/programs/site-marketing-packages-v61.functions";

type PackageRecord = Awaited<ReturnType<typeof listSiteMarketingPackagesV61>>[number];
export type MarketingEditorView = "library" | "wizard" | "detail" | "share" | "followup";

export type MarketingEditorState = {
  view: MarketingEditorView;
  record: PackageRecord | null;
  title: string;
  content: MarketingPackageContent;
  step: number;
  hasAuthoredCopy: boolean;
  previewFormat: MarketingFormat;
  editingFormat: MarketingFormat | null;
};

export type MarketingEditorAction =
  | { type: "view"; update: SetStateAction<MarketingEditorView> }
  | { type: "record"; update: SetStateAction<PackageRecord | null> }
  | { type: "title"; update: SetStateAction<string> }
  | { type: "content"; update: SetStateAction<MarketingPackageContent> }
  | { type: "step"; update: SetStateAction<number> }
  | { type: "previewFormat"; update: SetStateAction<MarketingFormat> }
  | { type: "editingFormat"; update: SetStateAction<MarketingFormat | null> }
  | { type: "open"; record: PackageRecord; content: MarketingPackageContent; editing: boolean }
  | { type: "start"; title: string; content: MarketingPackageContent }
  | { type: "duplicate"; record: PackageRecord }
  | { type: "patch"; patch: Partial<MarketingPackageContent> }
  | { type: "discard" };

function resolveUpdate<T>(previous: T, update: SetStateAction<T>): T {
  return typeof update === "function" ? (update as (prior: T) => T)(previous) : update;
}

/** Atomically switch a Site-scoped editor between working records and modes.
 * Async release operations and verified Brand reads remain separate resources;
 * saving a draft never silently writes or publishes a release.
 */
export function marketingEditorReducer(
  state: MarketingEditorState, action: MarketingEditorAction,
): MarketingEditorState {
  switch (action.type) {
    case "view": return { ...state, view: resolveUpdate(state.view, action.update) };
    case "record": return { ...state, record: resolveUpdate(state.record, action.update) };
    case "title": return { ...state, title: resolveUpdate(state.title, action.update) };
    case "content": return { ...state, content: resolveUpdate(state.content, action.update) };
    case "step": return { ...state, step: resolveUpdate(state.step, action.update) };
    case "previewFormat": return { ...state, previewFormat: resolveUpdate(state.previewFormat, action.update) };
    case "editingFormat": return { ...state, editingFormat: resolveUpdate(state.editingFormat, action.update) };
    case "open":
      return { ...state, record: action.record, title: action.record.title,
        content: action.content, step: 0, view: action.editing ? "wizard" : "detail",
        hasAuthoredCopy: true, editingFormat: null };
    case "start":
      return { ...state, record: null, title: action.title, content: action.content,
        step: 0, view: "wizard", hasAuthoredCopy: false, editingFormat: null };
    case "duplicate":
      return { ...state, record: action.record, title: action.record.title,
        content: action.record.content, step: 0, view: "wizard",
        hasAuthoredCopy: true, editingFormat: null };
    case "patch":
      return { ...state, content: { ...state.content, ...action.patch },
        hasAuthoredCopy: state.hasAuthoredCopy ||
          "headline" in action.patch || "message" in action.patch || "callToAction" in action.patch };
    case "discard":
      return { ...state, record: null, view: "library", editingFormat: null };
  }
}
