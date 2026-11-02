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
    demoAccountSwitching: result.session.demoAccountSwitching ?? false,
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
  useEffect(() => {
    if (!data.session?.authenticated) return;
    // Do not use refetch timers, page load, focus, visibility, or synthetic
    // browser events as a signal of user activity. Only trusted interaction.
    // This is a session-idle signal, not educational attendance or time on task.
    let lastSentAt = 0;
    const onInteraction = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastSentAt < 60_000) return;
      lastSentAt = now;
      void fetch("/access/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "activity" }),
      }).then(response => {
        if (response.status === 401) window.location.reload();
      }).catch(() => {
        // Transient network loss does not authorize a longer session.
        // The next real interaction may retry after the client throttle.
      });
    };
    document.addEventListener("pointerdown", onInteraction, { passive: true });
    document.addEventListener("keydown", onInteraction);
    return () => {
      document.removeEventListener("pointerdown", onInteraction);
      document.removeEventListener("keydown", onInteraction);
    };
  }, [data.session?.authenticated]);
  if (changed) return <p role="status" className="p-6">Refreshing workspace...</p>;
  const value = error ? { ...data, error: "Unable to refresh your workspace session. Please try again." } : data;
  return <WorkspaceSessionContext.Provider value={value}>{children}</WorkspaceSessionContext.Provider>;
}

export function useWorkspaceSession() {
  const value = useContext(WorkspaceSessionContext);
  if (!value) throw new Error("Workspace session provider is required.");
  return value;
}
