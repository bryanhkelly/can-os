import { useBlocker } from "@tanstack/react-router";
import { useRef, useState } from "react";

export function launchNavigationLosesInput(current: { pathname: string; search: Record<string, unknown> },
  next: { pathname: string; search: Record<string, unknown> }) {
  if (current.pathname !== next.pathname) return true;
  const scope = (search: Record<string, unknown>) => Object.entries(search)
    .filter(([key, value]) => key !== "step" && value !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(scope(current.search)) !== JSON.stringify(scope(next.search));
}

export function useLaunchUnsavedChanges(dirty: boolean | (() => boolean)) {
  const released = useRef(false);
  const isDirty = () => typeof dirty === "function" ? dirty() : dirty;
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (released.current) { released.current = false; return false; }
      return isDirty() && launchNavigationLosesInput(current, next)
        && !window.confirm("Leave setup? Changes you haven't saved or submitted will be lost. Stay to save them, or leave without saving.");
    },
    enableBeforeUnload: isDirty,
    withResolver: false,
  });
  return () => { released.current = true; };
}

export function LaunchUnsavedChangesGuard({ dirty }: { dirty: boolean | (() => boolean) }) {
  useLaunchUnsavedChanges(dirty);
  return null;
}

export function useLaunchDraftChanges(value: unknown) {
  const snapshot = JSON.stringify(value);
  const [saved, setSaved] = useState(snapshot);
  return { dirty: snapshot !== saved, markSaved: (value: unknown) => setSaved(JSON.stringify(value)) };
}
