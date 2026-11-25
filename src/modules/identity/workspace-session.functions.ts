import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { readWorkspaceSession, type WorkspaceSession } from "./workspace-session.server";
import { logServerFailure } from "@/lib/server-failure-log";

export type WorkspaceSessionResult = { session: WorkspaceSession | null; error: string | null };

export const getWorkspaceSession = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorkspaceSessionResult> => {
    setResponseHeader("Cache-Control", "private, no-store");
    try {
      return { session: await readWorkspaceSession(getRequest()), error: null };
    } catch (error) {
      logServerFailure("Unable to load workspace session", error);
      return { session: null, error: "Unable to load your workspace session. Please try again." };
    }
  },
);
