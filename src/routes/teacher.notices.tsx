import { createFileRoute, redirect } from "@tanstack/react-router";

/** Preserve existing staff links; all roles share the recipient-scoped center. */
export const Route = createFileRoute("/teacher/notices")({
  beforeLoad: () => { throw redirect({ to: "/notifications" }); },
});
