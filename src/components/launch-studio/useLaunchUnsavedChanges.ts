import { useBlocker } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

export function launchNavigationLosesInput(current: { pathname: string; search: Record<string, unknown> },
  next: { pathname: string; search: Record<string, unknown> },
  options: {includeStep?:boolean} = {}) {
  if (current.pathname !== next.pathname) return true;
  const scope = (search: Record<string, unknown>) => Object.entries(search)
    .filter(([key, value]) => (options.includeStep || key !== "step") && value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(scope(current.search)) !== JSON.stringify(scope(next.search));
}

export type LaunchGuardRecord = {
  isDirty: () => boolean;
  message: string;
  includeStepChanges: boolean;
  released: { current: boolean };
};
export type LaunchGuardRegistry = (id: string, source: () => LaunchGuardRecord) => () => void;
export const LaunchNavigationContext = createContext<LaunchGuardRegistry | null>(null);

export function useLaunchUnsavedChanges(dirty: boolean | (() => boolean),
  message = "Leave setup? Changes you haven't saved or submitted will be lost. Stay to save them, or leave without saving.",
  includeStepChanges = false) {
  const released = useRef(false);
  const id = useId();
  const register = useContext(LaunchNavigationContext);
  const source = useRef<LaunchGuardRecord>({
    isDirty: () => false, message, includeStepChanges, released,
  });
  source.current = {
    isDirty: () => typeof dirty === "function" ? dirty() : dirty,
    message, includeStepChanges, released,
  };
  useEffect(() => register?.(id, () => source.current), [register, id]);

  // Standalone/legacy workspaces without a Launch frame keep the browser
  // fallback. Launch Studio uses one shared V6.1 ActionDialog in its frame.
  useBlocker({
    shouldBlockFn: ({ current, next }) => {
      if (register) return false;
      if (released.current) { released.current = false; return false; }
      return source.current.isDirty() &&
        launchNavigationLosesInput(current, next, {includeStep:includeStepChanges}) &&
        !window.confirm(message);
    },
    enableBeforeUnload: () => !register && source.current.isDirty() && !released.current,
    withResolver: false,
  });
  return () => { released.current = true; };
}

export function LaunchUnsavedChangesGuard({ dirty, message }: { dirty: boolean | (() => boolean); message?: string }) {
  useLaunchUnsavedChanges(dirty, message);
  return null;
}

export function useLaunchDraftChanges(value: unknown) {
  const snapshot = JSON.stringify(value);
  const [saved, setSaved] = useState(snapshot);
  return { dirty: snapshot !== saved, markSaved: (value: unknown) => setSaved(JSON.stringify(value)) };
}
