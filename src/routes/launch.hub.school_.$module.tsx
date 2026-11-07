import { createFileRoute, notFound } from "@tanstack/react-router";
import { SchoolLaunchHub } from "@/components/launch-studio/SchoolLaunchHub";
import { schoolHubModules, type SchoolHubModule } from "@/domain/school-launch-hub";
import { getSchoolHubData } from "@/modules/programs/school-hub.functions";
import { getLaunchStudioDraft } from "@/modules/programs/launch-drafts.functions";
import { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";
import { SchoolHubWorkflow } from "@/components/launch-studio/SchoolHubWorkflow";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { schoolHubSearch } from "@/domain/school-launch-hub";
export const Route = createFileRoute("/launch/hub/school_/$module")({
  validateSearch: search => schoolHubSearch.parse(search),
  beforeLoad: ({params}) => {if(!Object.hasOwn(schoolHubModules,params.module))throw notFound();},
  loaderDeps:({search})=>search,
  loader:({deps,params})=>safeLoader(async () => {
    const data=await getSchoolHubData({data:{siteId:deps.siteId,programId:deps.programId}});
    const academic=params.module==="academics" && data.selectedProgramId
      ? await safeLoader(()=>getLaunchAcademicSetup({data:{programId:data.selectedProgramId!}}))() : null;
    const draft=params.module==="academics" && deps.siteId && data.launches?.length===0
      ? await safeLoader(()=>getLaunchStudioDraft({data:{audience:"school",context:`${deps.siteId}:`}}))() : null;
    return {...data,academic:academic?.ok?academic.data:null,academicFailed:academic!==null&&!academic.ok,draft:draft?.ok?draft.data:null,draftFailed:draft!==null&&!draft.ok};
  })(),
  component: SchoolModulePage,
});
function SchoolModulePage() {
  const result=Route.useLoaderData();const search=Route.useSearch();const {module}=Route.useParams();
  if(!result.ok)return <LoaderFailure title="School preparation" outcome={result} />;
  return <SchoolLaunchHub options={result.data.options} siteId={search.siteId} module={module as SchoolHubModule} statuses={result.data.statuses??undefined} workflow={search.siteId && ["website","team","academics","compliance"].includes(module) ? <SchoolHubWorkflow data={result.data} selection={search} module={module as SchoolHubModule}/> : undefined} />;
}
