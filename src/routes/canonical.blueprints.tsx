import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { CanonicalBlueprintWorkspace } from "@/components/launch-studio/CanonicalBlueprintWorkspace";
import { BlueprintReferenceCatalogPanel } from "@/components/launch-studio/BlueprintReferenceCatalogPanel";
import { WorkspaceShell } from "@/components/workspace";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { readCanonicalBlueprintHome } from "@/modules/blueprints/blueprint-studio.functions";
import { NativeOfferingAdoptionReviewPanel } from "@/components/launch-studio/NativeOfferingAdoptionReviewPanel";

/** Native v3.0.1 memberships, isolated from public-schema Launch identities. */
export const Route = createFileRoute("/canonical/blueprints")({
  validateSearch: (value) => z.object({ siteId: z.string().uuid().optional() }).parse(value),
  loader: () => safeLoader(() => readCanonicalBlueprintHome())(),
  component: CanonicalBlueprintPage,
});

function CanonicalBlueprintPage() {
  const outcome = Route.useLoaderData();
  const { siteId } = Route.useSearch();
  if (!outcome.ok) return <CanonicalBlueprintLoadError title="Solution planning" message={outcome.message} />;

  const { role, siteIds, referencesEnabled } = outcome.data;
  // A staff member assigned to exactly one canonical Site opens Solution planning
  // immediately. Explicit URLs never fall back to a different Site.
  const selectedSiteId = siteId ?? (siteIds.length === 1 ? siteIds[0] : undefined);
  if (role === "blueprint_reviewer") {
    return <WorkspaceShell
      eyebrow="CAN OS v3.0.1"
      title="Independent Blueprint review"
      subtitle="Your canonical account has review authority, not Site authoring authority.">
      <p className="mt-5">
        <Link to="/canonical/blueprint-reviews" className="underline">
          Open submitted Blueprint reviews
        </Link>
      </p>
      <NativeOfferingAdoptionReviewPanel/>
    </WorkspaceShell>;
  }
  if (!selectedSiteId || !siteIds.includes(selectedSiteId)) {
    return <WorkspaceShell
      eyebrow="CAN OS v3.0.1"
      title="Choose an authorized Site"
      subtitle="Choose the exact Site to plan. Blueprint configurations and program adoption stay with that Site.">
      {siteId && <p role="alert" className="mt-5 border p-4 text-sm">
        The requested Site is not authorized for this canonical account.
      </p>}
      {siteIds.length === 0 && <p className="mt-5 text-sm">
        No Site is available for Blueprint planning. An administrator must grant a Site role.
      </p>}
      <div className="mt-5 grid gap-3">
        {siteIds.map(authorizedSiteId => <Link
          key={authorizedSiteId}
          to="/canonical/blueprints"
          search={{siteId: authorizedSiteId}}
          className="border bg-card px-5 py-4 text-sm font-semibold text-primary">
          Open Site {authorizedSiteId}
        </Link>)}
      </div>
    </WorkspaceShell>;
  }
  return <WorkspaceShell
    eyebrow="CAN OS v3.0.1"
    title="Configure published Solutions"
    subtitle="CAN administers published Blueprint definitions. Your authorized Site configures local Solution plans; publication and enrollment are separate.">
    {siteIds.length > 1 && <div className="mt-4 text-sm"><Link to="/canonical/blueprints" search={{}} className="underline">
      Choose a different Site
    </Link></div>}
    <CanonicalBlueprintWorkspace key={selectedSiteId} siteId={selectedSiteId} enableReferences={referencesEnabled} />
    {referencesEnabled && <BlueprintReferenceCatalogPanel key={selectedSiteId} siteId={selectedSiteId} />}
  </WorkspaceShell>;
}
