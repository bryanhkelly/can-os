import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import {optionalSearchString,siteProgramSelectionSchema} from "@/lib/route-search";

const operationsSearchSchema=siteProgramSelectionSchema.extend({action:optionalSearchString});

export const Route = createFileRoute("/operations")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, "") === "/operations") throw notFound();
  },
  validateSearch: (search: Record<string, unknown>): { siteId?: string; programId?: string; action?: string } => operationsSearchSchema.parse(search),
  component: Outlet,
});
