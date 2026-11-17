import { createFileRoute, Navigate } from "@tanstack/react-router";

/** /canonical is a temporary UI staging area.
 * The governed provider content home now lives under /class. */
export const Route=createFileRoute("/canonical/content")({
  component:StagedContentLocation,
});
function StagedContentLocation(){
  return <Navigate to="/class" search={{view:"content"}} replace/>;
}
