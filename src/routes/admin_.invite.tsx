import { createFileRoute } from "@tanstack/react-router";
import { adminSearchSchema, ScopedAdminConsole } from "@/routes/admin";

export const Route = createFileRoute("/admin_/invite")({
  validateSearch: (search: Record<string, unknown>) => adminSearchSchema.parse(search),
  component: StaffInvitationPage,
});

function StaffInvitationPage() {
  const selection = Route.useSearch();
  return <ScopedAdminConsole key={JSON.stringify(selection)} selection={selection} mode="invite"/>;
}