import { createFileRoute } from "@tanstack/react-router";
import { siteProgramSelectionSchema } from "@/lib/route-search";
import { ScopedAdminConsole } from "@/routes/admin";

export const Route = createFileRoute("/admin_/people")({
  validateSearch: (search: Record<string, unknown>) => siteProgramSelectionSchema.pick({ siteId: true }).parse(search),
  component: PeopleDirectoryPage,
});

function PeopleDirectoryPage() {
  const selection = Route.useSearch();
  return <ScopedAdminConsole key={JSON.stringify(selection)} selection={selection} mode="people"/>;
}