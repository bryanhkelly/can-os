import { createFileRoute } from "@tanstack/react-router";
import { GoLinkWorkspace } from "@/components/launch-studio/GoLinkWorkspace";
import { PageFrame } from "@/components/workspace";
import { resolveAuthorizedSiteRoute } from "@/modules/sites/site-route-resolver.functions";

/** Friendly Site namespace uses existing verified actor-to-Site resolution. */
export const Route=createFileRoute("/o/$organizationSlug/$siteSlug/go-links")({
  loader:async({params})=>resolveAuthorizedSiteRoute({data:params}),
  component:FriendlySiteGoLinksPage,
});
function FriendlySiteGoLinksPage(){
  const siteId=Route.useLoaderData();
  if(!siteId)return <PageFrame width="wide">
    <p role="alert" className="text-sm">This Site is unavailable or access is denied.</p>
  </PageFrame>;
  return <PageFrame width="wide">
    <header className="mb-6 space-y-2">
      <h1 className="font-serif text-2xl font-semibold">Site Go Links</h1>
      <p className="text-sm text-muted-foreground">
        Create and manage shareable links for approved Site experiences.
      </p>
    </header>
    <GoLinkWorkspace siteId={siteId}/>
  </PageFrame>;
}
