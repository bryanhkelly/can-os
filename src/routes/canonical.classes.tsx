import { createFileRoute, Navigate } from "@tanstack/react-router";
import { z } from "zod";

/** /canonical is the UI design parking lot. Native Class creation,
 * publication, and management have been promoted to the production /class
 * workspace. This staged path forwards old links without authorizing anyone. */
export const Route = createFileRoute("/canonical/classes")({
  validateSearch: (raw: Record<string, unknown>) =>
    z.object({siteId:z.string().uuid().optional()}).strip().parse(raw),
  component: StagedClassManagementLocation,
});
function StagedClassManagementLocation() {
  const {siteId}=Route.useSearch();
  return <Navigate to="/class" search={{view:"manage",siteId}} replace />;
}
