import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { NoncreditCompletionQueuePanel } from "@/components/learning/NoncreditCompletionQueuePanel";

/** Standalone canonical test/workspace route avoids nesting underneath
 * the existing /canonical page without requiring unrelated router edits.
 * WS00 owns final production navigation and route retirement.
 */
export const Route=createFileRoute("/canonical_/noncredit-completion")({
  component:NoncreditCompletionWorkspace,
});

function NoncreditCompletionWorkspace(){
  return <WorkspaceShell width="wide"
    eyebrow="CAN OS / Governed learning outcomes"
    title="Noncredit completion review"
    subtitle="A single authorized provider can review original registrations and
      completion histories at its verified delivery Site. This does not
      authorize certificates or academic credit.">
    <NoncreditCompletionQueuePanel/>
  </WorkspaceShell>;
}
