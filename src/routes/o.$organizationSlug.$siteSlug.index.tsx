import { createFileRoute } from "@tanstack/react-router";
import { resolveAuthorizedSiteRoute } from "@/modules/sites/site-route-resolver.functions";
import { readSiteToday, SiteTodayView } from "./sites.$siteId.index";

export const Route = createFileRoute("/o/$organizationSlug/$siteSlug/")({
  loader: async ({ params }) => {
    const siteId = await resolveAuthorizedSiteRoute({ data: params });
    return readSiteToday(siteId);
  },
  component: FriendlySiteTodayPage,
});

function FriendlySiteTodayPage() {
  return <SiteTodayView outcome={Route.useLoaderData()} identity={Route.useParams()} />;
}
