import { createFileRoute } from "@tanstack/react-router";
import { resolveAuthorizedSiteRoute } from "@/modules/sites/site-route-resolver.functions";
import { schoolRecordTabs } from "@/components/operations/SchoolProfile";
import { readSchoolProfile, SiteProfileView } from "./sites.$siteId.profile";

export const Route = createFileRoute("/o/$organizationSlug/$siteSlug/profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: schoolRecordTabs.find(item => item.value === search.tab)?.value,
  }),
  loader: async ({ params }) => {
    const siteId = await resolveAuthorizedSiteRoute({ data: params });
    return readSchoolProfile(siteId ?? "unavailable");
  },
  component: FriendlySiteProfilePage,
});

function FriendlySiteProfilePage() {
  const identity = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  return <SiteProfileView outcome={Route.useLoaderData()} tab={tab} identity={identity} />;
}
