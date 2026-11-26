import { createFileRoute } from "@tanstack/react-router";
import { loadWebsiteHome, loadWebsiteLaunchCompletion, WebsiteHome, websiteSearchSchema, websiteStudioStepIds } from "./site-website";

/** Canonical full-screen website setup for an explicitly authorized Site editor.
 * The ordinary /site-website editor remains available for later revisions. */
export const Route = createFileRoute("/launch/website")({
  validateSearch: (search: Record<string, unknown>) => websiteSearchSchema.parse(search),
  loaderDeps: ({ search }) => ({ siteId: search.siteId }),
  loader: async ({ deps }) => {
    const outcome = await loadWebsiteHome(deps.siteId);
    return { outcome, completion: outcome.ok ? await loadWebsiteLaunchCompletion(outcome.data.siteId) : {} };
  },
  component: WebsiteLaunchStudio,
});

function WebsiteLaunchStudio() {
  const navigate = Route.useNavigate();
  const { outcome, completion } = Route.useLoaderData();
  return <WebsiteHome outcome={outcome} completion={completion} selection={Route.useSearch()} studio={true}
    onStepChange={step => void navigate({ search: previous => ({ ...previous, step: websiteStudioStepIds[step] }) })} />;
}
