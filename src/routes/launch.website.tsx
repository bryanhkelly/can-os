import { createFileRoute } from "@tanstack/react-router";
import { loadWebsiteHome, WebsiteHome, websiteSearchSchema, websiteStudioStepIds } from "./site-website";

/** Canonical full-screen website setup for an explicitly authorized Site editor.
 * The ordinary /site-website editor remains available for later revisions. */
export const Route = createFileRoute("/launch/website")({
  validateSearch: (search: Record<string, unknown>) => websiteSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ siteId: search.siteId }),
  loader: ({ deps }) => loadWebsiteHome(deps.siteId),
  component: WebsiteLaunchStudio,
});

function WebsiteLaunchStudio() {
  const navigate = Route.useNavigate();
  return <WebsiteHome outcome={Route.useLoaderData()} selection={Route.useSearch()} studio={true}
    onStepChange={step => void navigate({ search: previous => ({ ...previous, step: websiteStudioStepIds[step] }) })} />;
}
