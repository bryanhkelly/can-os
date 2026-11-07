import { createFileRoute } from "@tanstack/react-router";
import { schoolHubSearch } from "@/domain/school-launch-hub";
import { SchoolLaunchHub } from "@/components/launch-studio/SchoolLaunchHub";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
export const Route = createFileRoute("/launch/hub/school")({
  validateSearch: search => schoolHubSearch.parse(search),
  loader: safeLoader(() => listLaunchOptions()),
  component: SchoolHubPage,
});
function SchoolHubPage() {
  const result=Route.useLoaderData();const search=Route.useSearch();
  if(!result.ok)return <LoaderFailure title="School Launch Hub" outcome={result} />;
  return <SchoolLaunchHub options={result.data} siteId={search.siteId} />;
}
