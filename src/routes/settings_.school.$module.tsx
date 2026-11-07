import { createFileRoute, Link, Navigate, notFound } from "@tanstack/react-router";
import { PageFrame, PageHeader } from "@/components/workspace";
import { schoolHubSearch, isPlannedSchoolHubModule } from "@/domain/school-launch-hub";
import { schoolSettingsModules, type SchoolSettingsModule } from "@/domain/school-configuration";
import { loadSchoolConfiguration } from "@/modules/programs/school-configuration-loader";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SchoolHubWorkflow } from "@/components/launch-studio/SchoolHubWorkflow";
import { ModuleStatus, SchoolModuleHome } from "@/components/launch-studio/SchoolLaunchHub";
import { SchoolConfigurationContextProvider } from "@/components/launch-studio/SchoolConfigurationContext";
import { SchoolProfileConfiguration } from "@/components/launch-studio/SchoolProfileConfiguration";
export const Route=createFileRoute("/settings_/school/$module")({
 validateSearch:search=>schoolHubSearch.parse(search),
 beforeLoad:({params})=>{if(!Object.hasOwn(schoolSettingsModules,params.module))throw notFound();},
 loaderDeps:({search})=>search,
 loader:({deps,params})=>safeLoader(()=>loadSchoolConfiguration(deps,params.module))(),
 component:SchoolSettingsModulePage,
});
function SchoolSettingsModulePage(){
 const result=Route.useLoaderData();const selection=Route.useSearch();const {module:rawModule}=Route.useParams();
 if(!result.ok)return <LoaderFailure title="School Settings" outcome={result}/>;
 const module=rawModule as SchoolSettingsModule;const item=schoolSettingsModules[module];const data=result.data;
 const site=data.options.sites.find(site=>site.id===selection.siteId);
 if(!site)return <PageFrame width="wide"><PageHeader eyebrow="School Settings" title="Choose your school" subtitle="Select the authorized school whose configuration you want to manage."/>
  {selection.siteId&&<p role="alert" className="mt-5 border p-4 text-sm">{data.selectionError??"The requested school is not available in this membership."}</p>}<div className="mt-6 grid gap-4 sm:grid-cols-2">{data.options.sites.map(site=><Link key={site.id} to="/settings/school/$module" params={{module}} search={{siteId:site.id}} className="border bg-card p-5 font-semibold text-primary">{site.name} →</Link>)}</div>{!data.options.sites.length&&<p role="status" className="mt-5">No schools are available in this membership.</p>}<Link to="/settings" className="mt-6 inline-flex min-h-11 items-center text-primary">Back to Settings</Link></PageFrame>;
 // Old Settings bookmarks open the canonical editor when permission is available.
 // Blocked or unavailable Sites remain on this page with scoped status.
 if(module==="website" && data.statuses?.website &&
    !["Blocked","Unavailable"].includes(data.statuses.website.state))
   return <Navigate to="/launch/website" search={{siteId:site.id,returnToSettings:true}} replace/>;
 return <SchoolConfigurationContextProvider value="settings"><PageFrame width="wide">
  <Link to="/settings" search={{siteId:site.id}} className="mb-5 inline-flex min-h-11 items-center text-sm font-semibold text-primary">← School Settings</Link>
  <PageHeader eyebrow={`School Settings / ${site.name}`} title={item.title} subtitle={item.description}/>
  {module!=="profile"&&data.statuses?.[module]&&<div className="mt-5"><ModuleStatus status={data.statuses[module]}/></div>}
  {module==="profile"?<SchoolProfileConfiguration site={site}/>:isPlannedSchoolHubModule(module)?<SchoolModuleHome module={module} siteId={site.id}/>:<SchoolHubWorkflow context="settings" data={data} selection={selection} module={module}/>} 
 </PageFrame></SchoolConfigurationContextProvider>;
}
