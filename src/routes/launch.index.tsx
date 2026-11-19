import { createFileRoute } from "@tanstack/react-router";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/launch/")({
  loader: () => safeLoader(async () => {
    const options = await listLaunchOptions();
    return options.sites.map(site => ({id:site.id,name:site.name}));
  })(),
  component: LaunchIndex,
});

function LaunchIndex() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure title="Launch Studio" outcome={outcome}/>;
  return <WorkspaceShell title="Launch Studio" eyebrow="Site setup"
    subtitle="Choose an authorized Site to continue preparing it, or establish a new Site.">
    <div className="mt-6 space-y-3">{outcome.data.map(site => <a key={site.id}
      href={"/launch/site?siteId="+encodeURIComponent(site.id)}
      className="block border bg-card p-4 font-semibold hover:bg-muted">{site.name}</a>)}</div>
    <div className="mt-6"><Button asChild><a href="/site/new">Create your Site</a></Button></div>
  </WorkspaceShell>;
}
