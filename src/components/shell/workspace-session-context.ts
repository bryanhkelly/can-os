import { createContext, useContext } from "react";
import type { WorkspaceSessionResult } from "@/modules/identity/workspace-session.functions";

/** Kept free of server-function imports so presentational primitives can read it anywhere. */
export const WorkspaceSessionContext = createContext<WorkspaceSessionResult | null>(null);

/** For presentational primitives that also render in isolation (Storybook, unit tests). */
export function useActiveWorkspaceMember() {
  const session = useContext(WorkspaceSessionContext)?.session;
  if (!session?.authenticated) return null;
  return session.grants.find(grant => grant.id === session.activeGrantId) ?? null;
}
