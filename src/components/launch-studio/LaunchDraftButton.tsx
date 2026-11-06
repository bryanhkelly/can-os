import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { saveLaunchStudioDraft } from "@/modules/programs/launch-drafts.functions";
import type { LaunchDraftRecord, LaunchDraftSelection, LaunchDraftValue } from "@/domain/launch-draft";

export function LaunchDraftButton({ selection, initial, value, disabled = false, buttonLabel = "Save draft",
  successMessage = "Draft saved. Save again after making more changes. Nothing was submitted or approved.",
  commandErrorMessage = "Unable to save draft. Your input is still on this page.", onSaved }: {
  selection: LaunchDraftSelection; initial: LaunchDraftRecord | null;
  value: () => LaunchDraftValue; disabled?: boolean;
  buttonLabel?: string; successMessage?: string; commandErrorMessage?: string; onSaved?: (value: LaunchDraftValue) => void;
}) {
  const [revision, setRevision] = useState(initial?.revision ?? 0);
  const [savedAt, setSavedAt] = useState(initial?.savedAt);
  const mutation = useMutationFeedback(async () => {});
  async function saveDraft() {
    const submitted = value();
    const outcome = await mutation.run(async () => {
      const receipt = await saveLaunchStudioDraft({ data: {
        ...selection, expectedRevision: revision, value: submitted,
      } });
      setRevision(receipt.revision);
      setSavedAt(receipt.savedAt);
      return receipt;
    }, { successMessage, commandErrorMessage });
    if (outcome.status === "saved") onSaved?.(submitted);
  }
  return <div className="space-y-2">
    <Button type="button" variant="outline" disabled={disabled || mutation.pending}
      onClick={() => void saveDraft()}>
      {mutation.pending ? "Saving draft..." : buttonLabel}
    </Button>
    {savedAt && <p className="text-xs text-muted-foreground">Last draft save: <time dateTime={savedAt}>{savedAt.slice(0, 16).replace("T", " ")} UTC</time></p>}
    <MutationFeedback state={mutation} pendingMessage="Saving draft..." />
  </div>;
}
