import { createFileRoute } from "@tanstack/react-router";
import { SiteFirstLaunch } from "@/components/launch-studio/SiteFirstLaunch";
import { listLaunchOptions, listLaunches } from "@/modules/programs/launch.functions";
import { supplementaryRead } from "@/lib/supplementary-read";
import { readSiteLaunchPreferences } from "@/modules/programs/site-launch-preferences.functions";
import { siteFirstLaunchSearch } from "@/domain/launch-studio";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

/** Reauthorize an exact selected Site for each reload. Do not silently replace
 * inaccessible Sites with a different account's default. */
export const Route = createFileRoute("/launch/site")({
  validateSearch: (search: Record<string, unknown>) => siteFirstLaunchSearch.parse(search),
  loaderDeps: ({ search }) => ({ siteId: search.siteId }),
  loader: ({ deps }) => safeLoader(async () => {
    const options = await listLaunchOptions();
    if (!deps.siteId) return { options, selectedSiteId: "", preferences: null, selectionError: null, sitePrograms: null, programsState: "empty" as const };
    if (!options.sites.some(item => item.id === deps.siteId))
      return { options, selectedSiteId: deps.siteId, preferences: null, sitePrograms: null, programsState: "unauthorized" as const,
        selectionError: "This Site is not available to your active account or role. Choose an authorized Site explicitly." };
    const preferences = await readSiteLaunchPreferences({ data: { siteId: deps.siteId } });
    // The private website remains available even when a program reader fails.
    const recordRead = await supplementaryRead(
      () => listLaunches({data:{includeActive:true}}), data=>data.launches.length===0);
    return { options, selectedSiteId: deps.siteId, preferences, selectionError: null,
      sitePrograms: recordRead.data?.launches.filter(record=>record.siteId===deps.siteId)??null,
      programsState: recordRead.state };
  })(),
  component: SiteLaunchPage,
});
function SiteLaunchPage() {
  const outcome = Route.useLoaderData();
  const search = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure title="Launch your Site" outcome={outcome}/>;
  return <SiteFirstLaunch key={outcome.data.selectedSiteId || "new"}
    options={outcome.data.options} selectedSiteId={outcome.data.selectedSiteId}
    initialStep={search.step ?? "site"} initialPreferences={outcome.data.preferences}
    selectionError={outcome.data.selectionError} sitePrograms={outcome.data.sitePrograms}
    programsState={outcome.data.programsState}/>
}
