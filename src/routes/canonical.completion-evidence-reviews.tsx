import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CompletionEvidenceReviewQueuePanel } from "@/components/learning/CompletionEvidenceReviewQueuePanel";

/** Temporary WS3 canonical operator workspace pending WS00 production route
 * selection. Route itself grants no access. All queries use current exact
 * Session, capability, Organization, delivery Site and independent reviewer.
 */
export const Route=createFileRoute("/canonical/completion-evidence-reviews")({
  component:CompletionEvidenceReviewWorkspace,
});
function CompletionEvidenceReviewWorkspace(){
  return <WorkspaceShell width="wide"
    eyebrow="CAN OS / Evidence integrity"
    title="Independent completion approvals"
    subtitle="Review the provider's original evidence, prevent self-approval, and govern credential revocations across canonical learning sources.">
    <div className="mt-6">
      <CompletionEvidenceReviewQueuePanel/>
    </div>
  </WorkspaceShell>;
}
