import { createFileRoute, Outlet } from "@tanstack/react-router";

/** All Site-scoped friendly pages share one unambiguous parent namespace. */
export const Route = createFileRoute("/o/$organizationSlug/$siteSlug")({
  component: Outlet,
});
