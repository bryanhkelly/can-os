import {createFileRoute} from "@tanstack/react-router";
import {listMySites} from "@/modules/operations/site-directory.functions";
import {safeLoader} from "@/lib/safe-loader";
import {LoaderFailure} from "@/lib/loader-failure";
import {WorkspaceShell} from "@/components/workspace";
import {ScopedSiteDirectory} from "@/components/operations/ScopedSiteDirectory";

export const Route=createFileRoute("/sites/")({
  loader:()=>safeLoader(()=>listMySites(),{
    authMessage:"You do not have access to any schools.",
  })(),
  component:SitesDirectoryPage,
});

function SitesDirectoryPage(){
  const outcome=Route.useLoaderData();
  if(!outcome.ok)return <LoaderFailure eyebrow="Schools" title="All schools" outcome={outcome}/>;
  return <WorkspaceShell eyebrow="Schools" title="Your schools"
    subtitle="Choose an authorized school to review its operations, programs, schedule, and actions.">
    <div className="mt-5">
      <ScopedSiteDirectory sites={outcome.data} profileLinks
        emptyMessage="No schools are assigned to your current workspace. Ask a school administrator to review your scoped access."/>
    </div>
  </WorkspaceShell>;
}
