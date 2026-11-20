import { createFileRoute } from "@tanstack/react-router";
import { adminSearchSchema } from "@/lib/admin-route-search";
import { ScopedAdminConsole } from "@/components/operations/ScopedAdminConsole";

export const Route = createFileRoute("/admin_/invite")({
  validateSearch: (search: Record<string, unknown>) => adminSearchSchema.parse(search),
  component: StaffInvitationPage,
});

function StaffInvitationPage() {
  const selection = Route.useSearch();
  return <ScopedAdminConsole key={JSON.stringify(selection)} selection={selection} mode="invite"/>;
}