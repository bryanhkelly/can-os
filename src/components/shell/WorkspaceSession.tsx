import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { getWorkspaceSession, type WorkspaceSessionResult } from "@/modules/identity/workspace-session.functions";

const WorkspaceSessionContext = createContext<WorkspaceSessionResult | null>(null);

export function workspaceSessionQueryOptions() {
  return queryOptions({
    queryKey: ["workspace-session"],
    queryFn: () => getWorkspaceSession(),
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: "always",
  });
}

export function workspaceSessionIdentity(result: WorkspaceSessionResult) {
  if (!result.session) return null;
  if (!result.session.authenticated) return "signed-out";
  return JSON.stringify({
    grant: result.session.activeGrantId,
    grants: [...result.session.grants].sort((a, b) => a.id.localeCompare(b.id)),
    scope: Object.fromEntries(Object.entries(result.session.activeContext).map(([key, ids]) => [key, [...ids].sort()])),
  });
}

export function WorkspaceSessionProvider({ initial, children }: {
  initial: WorkspaceSessionResult;
  children: ReactNode;
}) {
  const { data, error } = useQuery({
    ...workspaceSessionQueryOptions(),
    initialData: initial,
  });
  const previousIdentity = useRef(workspaceSessionIdentity(initial));
  const identity = workspaceSessionIdentity(data);
  const changed = previousIdentity.current !== null && identity !== null && previousIdentity.current !== identity;
  useEffect(() => {
    // A new identity/scope must never reuse the previous workspace's mounted state or caches.
    if (changed) window.location.reload();
    else if (identity !== null) previousIdentity.current = identity;
  }, [changed, identity]);
  useEffect(() => {
    if (error) console.error("Unable to refresh workspace session", error);
  }, [error]);
  if (changed) return <p role="status" className="p-6">Refreshing workspace...</p>;
  const value = error ? { ...data, error: "Unable to refresh your workspace session. Please try again." } : data;
  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const value = useContext(WorkspaceSessionContext);
  if (!value) throw new Error("Workspace session provider is required.");
  return value;
}
