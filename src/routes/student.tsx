import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/student")({
  beforeLoad: ({ location }) => {
    if (location.pathname.replace(/\/$/, "") === "/student") throw notFound();
  },
  component: Outlet,
});
