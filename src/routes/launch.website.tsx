import { createFileRoute } from "@tanstack/react-router";
import { optionalSearchString, siteProgramSelectionSchema } from "@/lib/route-search";
import { loadWebsiteHome, WebsiteHome } from "./site-website";

/** Canonical full-screen website setup for an explicitly authorized Site editor.
 * The ordinary /site-website editor remains available for later revisions. */
const searchSchema = siteProgramSelectionSchema.extend({ returnGrantId: optionalSearchString });
export const Route = createFileRoute("/launch/website")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ siteId: search.siteId }),
  loader: ({ deps }) => loadWebsiteHome(deps.siteId),
  component: WebsiteLaunchStudio,
});

function WebsiteLaunchStudio() {
  return <WebsiteHome outcome={Route.useLoaderData()} selection={Route.useSearch()} studio />;
}
