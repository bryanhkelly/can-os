import { createFileRoute, notFound } from "@tanstack/react-router";
import { SchoolLaunchHub } from "@/components/launch-studio/SchoolLaunchHub";
import { schoolHubModules, type SchoolHubModule } from "@/domain/school-launch-hub";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { schoolHubSearch } from "@/domain/school-launch-hub";
export const Route = createFileRoute("/launch/hub/school_/$module")({
  validateSearch: search => schoolHubSearch.parse(search),
  beforeLoad: ({params}) => {if(!Object.hasOwn(schoolHubModules,params.module))throw notFound();},
  loader: safeLoader(() => listLaunchOptions()),
  component: SchoolModulePage,
});
function SchoolModulePage() {
  const result=Route.useLoaderData();const search=Route.useSearch();const {module}=Route.useParams();
  if(!result.ok)return <LoaderFailure title="School preparation" outcome={result} />;
  return <SchoolLaunchHub options={result.data} siteId={search.siteId} module={module as SchoolHubModule} />;
}
