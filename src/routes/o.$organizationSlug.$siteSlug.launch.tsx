import { createFileRoute } from "@tanstack/react-router";
import { siteLaunchSearchSchemaV61 } from "@/domain/launch-site-search-v61";
import { loadSiteLaunchView, SiteLaunchView } from "./launch.site";

/** Human-readable alias with exactly the same authorized Launch Studio service. */
export const Route = createFileRoute("/o/$organizationSlug/$siteSlug/launch")({
  validateSearch: (search: Record<string, unknown>) =>
    siteLaunchSearchSchemaV61.omit({ siteId: true }).parse(search),
  loaderDeps: ({ search }) => ({ module: search.module }),
  loader: ({ params, deps }) => loadSiteLaunchView({
    organizationSlug: params.organizationSlug,
    siteSlug: params.siteSlug,
    module: deps.module,
  }),
  component: FriendlySiteLaunchPage,
});

function FriendlySiteLaunchPage() {
  return <SiteLaunchView outcome={Route.useLoaderData()}
    search={Route.useSearch()} friendlyRoute />;
}
