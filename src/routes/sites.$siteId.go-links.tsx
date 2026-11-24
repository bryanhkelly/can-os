import { createFileRoute } from "@tanstack/react-router";
import { GoLinkWorkspace } from "@/components/launch-studio/GoLinkWorkspace";
import { PageFrame } from "@/components/workspace";

/** Site links are governed by the exact same registrar/Site grants as Launch.
 * This page may be opened without a marketing package and never bypasses
 * the server's authorization or destination publication checks.
 */
export const Route=createFileRoute("/sites/$siteId/go-links")({
  component:SiteGoLinksPage,
});
function SiteGoLinksPage(){
  const {siteId}=Route.useParams();
  return <PageFrame width="wide">
    <header className="mb-6 space-y-2">
      <h1 className="font-serif text-2xl font-semibold">Site Go Links</h1>
      <p className="text-sm text-muted-foreground">
        Share a verified Site experience without creating a marketing campaign.
      </p>
    </header>
    <GoLinkWorkspace siteId={siteId}/>
  </PageFrame>;
}
