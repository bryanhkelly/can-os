import { useCallback, useRef, type ReactNode } from "react";
import { useBlocker } from "@tanstack/react-router";
import { ActionDialog } from "@/components/workspace";
import {
  LaunchNavigationContext, launchNavigationLosesInput,
  type LaunchGuardRecord, type LaunchGuardRegistry,
} from "./useLaunchUnsavedChanges";

/** A single focus-managed V6.1 dialog protects all active Launch editors.
 * Each editor registers its current dirty snapshot; no parallel approval or
 * draft data is persisted here. Native beforeunload remains the browser gate.
 */
export function LaunchNavigationGuardProvider({children}: {children: ReactNode}) {
  const guards = useRef(new Map<string, () => LaunchGuardRecord>());
  const prompt = useRef("Leave Launch Studio? Your unsaved changes will be lost.");
  const register: LaunchGuardRegistry = useCallback((id, source) => {
    guards.current.set(id, source);
    return () => {
      if (guards.current.get(id) === source) guards.current.delete(id);
    };
  }, []);
  const blocker = useBlocker({
    shouldBlockFn: ({current,next}) => {
      for (const getGuard of guards.current.values()) {
        const guard = getGuard();
        if (guard.released.current) {
          guard.released.current = false;
          continue;
        }
        if (guard.isDirty() && launchNavigationLosesInput(current,next,{
          includeStep:guard.includeStepChanges,
        })) {
          prompt.current = guard.message;
          return true;
        }
      }
      return false;
    },
    enableBeforeUnload: () => [...guards.current.values()]
      .some(getGuard => {
        const guard = getGuard();
        return guard.isDirty() && !guard.released.current;
      }),
    withResolver: true,
  });
  return <LaunchNavigationContext.Provider value={register}>
    {children}
    <ActionDialog open={blocker.status === "blocked"}
      title="Leave with unsaved changes?"
      description={prompt.current}
      confirmLabel="Leave without saving" destructive
      onClose={() => { if (blocker.status === "blocked") blocker.reset(); }}
      onConfirm={() => { if (blocker.status === "blocked") blocker.proceed(); }} />
  </LaunchNavigationContext.Provider>;
}
