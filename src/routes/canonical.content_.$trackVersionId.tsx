import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Staging bookmark only; original Course/asset authorization
 * continues to be enforced by the promoted instruction editor. */
export const Route=createFileRoute("/canonical/content_/$trackVersionId")({
  component:StagedTrackLocation,
});
function StagedTrackLocation(){
  const {trackVersionId}=Route.useParams();
  return <Navigate to="/class" search={{view:"content",trackVersionId}} replace/>;
}
