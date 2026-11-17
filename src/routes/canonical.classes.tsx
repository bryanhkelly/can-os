import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";

/** Bookmarked legacy provider path. All Class creation, publication, and
 * management now render only in the canonical /class workspace.
 * The redirect never constructs a Class or bypasses server authorization. */
export const Route = createFileRoute("/canonical/classes")({
  validateSearch: (raw: Record<string, unknown>) =>
    z.object({siteId:z.string().uuid().optional()}).strip().parse(raw),
  component: LegacyClassManagementLocation,
});
function LegacyClassManagementLocation() {
  const {siteId}=Route.useSearch();
  return <Navigate to="/class" search={{view:"manage",siteId}} replace />;
}
