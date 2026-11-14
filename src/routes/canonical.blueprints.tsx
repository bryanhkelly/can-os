import { createFileRoute, Link } from "@tanstack/react-router";
import { CanonicalBlueprintWorkspace } from "@/components/launch-studio/CanonicalBlueprintWorkspace";
import { BlueprintReferenceCatalogPanel } from "@/components/launch-studio/BlueprintReferenceCatalogPanel";
import { WorkspaceShell } from "@/components/workspace";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import { readCanonicalBlueprintHome } from "@/modules/blueprints/blueprint-studio.functions";

/** A fresh v3.0.1 workspace, deliberately separate from public-schema Launch. */
export const Route = createFileRoute("/canonical/blueprints")({
  loader: () => safeLoader(() => readCanonicalBlueprintHome())(),
  component: CanonicalBlueprintPage,
});

function CanonicalBlueprintPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure title="Canonical Blueprint Studio" outcome={outcome} />;

  const { role, siteId, referencesEnabled } = outcome.data;
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
    </WorkspaceShell>;
  }
  if (!siteId) {
    return <WorkspaceShell
      eyebrow="CAN OS v3.0.1"
      title="Choose an authorized Site"
      subtitle="This account has no active canonical Site assignment. An administrator must grant a Site role before planning.">
      <p className="mt-5 text-sm">No Site is available for Blueprint planning.</p>
    </WorkspaceShell>;
  }
  return <WorkspaceShell
    eyebrow="CAN OS v3.0.1"
    title="Plan your learning Site"
    subtitle="Plan a school or a community learning center. Your Organization and Site come from your canonical authenticated membership.">
    <CanonicalBlueprintWorkspace siteId={siteId} enableReferences={referencesEnabled} />
    {referencesEnabled && <BlueprintReferenceCatalogPanel siteId={siteId} />}
  </WorkspaceShell>;
}
