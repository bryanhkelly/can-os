import { createFileRoute } from "@tanstack/react-router";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

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
  return <main className="mx-auto max-w-3xl space-y-5 px-5 py-12">
    <h1 className="font-serif text-4xl">Launch Studio</h1>
    <p className="text-sm text-muted-foreground">Choose an authorized Site to continue preparing it, or establish a new Site.</p>
    <div className="space-y-3">{outcome.data.map(site => <a key={site.id}
      href={"/launch/site?siteId="+encodeURIComponent(site.id)}
      className="block border bg-card p-4 font-semibold">{site.name}</a>)}</div>
    <a href="/site/new" className="inline-flex min-h-11 items-center bg-primary px-5 text-sm font-semibold text-primary-foreground">Create your Site</a>
  </main>;
}
