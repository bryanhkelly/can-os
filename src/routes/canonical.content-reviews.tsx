import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Staging location only. Author, reviewer and publisher authorities stay
 * independent and are revalidated by the promoted /class server commands. */
export const Route=createFileRoute("/canonical/content-reviews")({
  component:StagedContentReviewsLocation,
});
function StagedContentReviewsLocation(){
  return <Navigate to="/class" search={{view:"reviews"}} replace/>;
}
