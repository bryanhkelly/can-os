import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { SchoolLaunchHub } from "@/components/launch-studio/SchoolLaunchHub";
import { schoolHubModules, schoolHubSearch, type OperationalSchoolHubModule, type SchoolHubModule } from "@/domain/school-launch-hub";
import { loadSchoolConfiguration } from "@/modules/programs/school-configuration-loader";
import { SchoolHubWorkflow } from "@/components/launch-studio/SchoolHubWorkflow";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
export const Route = createFileRoute("/launch/hub/school_/$module")({
  validateSearch: search => schoolHubSearch.parse(search),
  beforeLoad: ({params}) => {
    if(!Object.hasOwn(schoolHubModules,params.module))throw notFound();
    // The loader verifies website access before redirecting. A blocked editor
    // stays on a scoped explanatory page rather than opening an unauthorized studio.
  },
  loaderDeps:({search})=>search,
  loader:async({deps,params})=>{
    const outcome=await safeLoader(()=>loadSchoolConfiguration(deps,params.module))();
    if(params.module==="website" && deps.siteId && outcome.ok &&
       outcome.data.options.sites.some(site=>site.id===deps.siteId) &&
       outcome.data.statuses?.website?.state !== undefined &&
       outcome.data.statuses.website.state!=="Blocked" &&
       outcome.data.statuses.website.state!=="Unavailable")
      throw redirect({to:"/launch/website",search:{siteId:deps.siteId,returnToHub:true},replace:true});
    return outcome;
  },
  component: SchoolModulePage,
});
function SchoolModulePage() {
  const result=Route.useLoaderData();const search=Route.useSearch();const {module}=Route.useParams();
  if(!result.ok)return <LoaderFailure title="School preparation" outcome={result} />;
  return <SchoolLaunchHub options={result.data.options} siteId={search.siteId} module={module as SchoolHubModule} statuses={result.data.statuses??undefined} selectionError={result.data.selectionError} workflow={search.siteId && ["profile","information","website","team","blueprint","academics","compliance"].includes(module) ? <SchoolHubWorkflow data={result.data} selection={search} module={module as OperationalSchoolHubModule}/> : undefined} />;
}
