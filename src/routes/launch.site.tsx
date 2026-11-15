import { createFileRoute } from "@tanstack/react-router";
import { SiteFirstLaunch } from "@/components/launch-studio/SiteFirstLaunch";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

/** Site-first operator onboarding. Keeps existing school and participant routes intact. */
export const Route = createFileRoute("/launch/site")({
  loader: safeLoader(() => listLaunchOptions()),
  component: SiteLaunchPage,
});
function SiteLaunchPage(){
  const outcome=Route.useLoaderData();
  if(!outcome.ok)return <LoaderFailure title="Launch your Site" outcome={outcome}/>;
  return <SiteFirstLaunch options={outcome.data}/>;
}
