import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/operations")({
  validateSearch: (search: Record<string, unknown>): { siteId?: string; programId?: string; action?: string } => ({
    siteId: typeof search.siteId === "string" ? search.siteId : undefined,
    programId: typeof search.programId === "string" ? search.programId : undefined,
    action: typeof search.action === "string" ? search.action : undefined,
  }),
  component: Outlet,
});
