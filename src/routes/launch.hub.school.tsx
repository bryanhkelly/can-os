import { createFileRoute } from "@tanstack/react-router";
import { schoolHubSearch } from "@/domain/school-launch-hub";
import { SchoolLaunchHub } from "@/components/launch-studio/SchoolLaunchHub";
import { getSchoolHubData } from "@/modules/programs/school-hub.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
export const Route = createFileRoute("/launch/hub/school")({
  validateSearch: search => schoolHubSearch.parse(search),
  loaderDeps:({search})=>search,
  loader:({deps})=>safeLoader(() => getSchoolHubData({data:{siteId:deps.siteId,programId:deps.programId}}))(),
  component: SchoolHubPage,
});
function SchoolHubPage() {
  const result=Route.useLoaderData();const search=Route.useSearch();
  if(!result.ok)return <LoaderFailure title="School Launch Hub" outcome={result} />;
  return <SchoolLaunchHub options={result.data.options} siteId={search.siteId} statuses={result.data.statuses??undefined} />;
}
