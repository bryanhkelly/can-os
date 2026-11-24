import { createFileRoute } from "@tanstack/react-router";
import { websiteSearchSchema, websiteStudioStepIds, loadWebsiteHome, WebsiteHome } from "./site-website";
import { resolveAuthorizedSiteRoute } from "@/modules/sites/site-route-resolver.functions";

/** Website Studio with human-readable Site identity and existing publisher authorization. */
export const Route = createFileRoute("/o/$organizationSlug/$siteSlug/website")({
  validateSearch: (search: Record<string, unknown>) =>
    websiteSearchSchema.omit({ siteId: true, programId: true, returnGrantId: true }).parse(search),
  loader: async ({ params }) => {
    const siteId = await resolveAuthorizedSiteRoute({ data: params });
    return {
      siteId,
      outcome: siteId ? await loadWebsiteHome(siteId) : {
        ok: false as const,
        authError: null,
        message: "This Site is unavailable or access denied.",
        retryable: false,
      },
    };
  },
  component: FriendlySiteWebsitePage,
});

function FriendlySiteWebsitePage() {
  const navigate = Route.useNavigate();
  const { siteId, outcome } = Route.useLoaderData();
  const identity = Route.useParams();
  return <WebsiteHome outcome={outcome}
    selection={{ ...Route.useSearch(), siteId: siteId ?? undefined }}
    friendlyIdentity={identity} studio
    onStepChange={step => void navigate({
      search: previous => ({ ...previous, step: websiteStudioStepIds[step] }),
    })} />;
}
