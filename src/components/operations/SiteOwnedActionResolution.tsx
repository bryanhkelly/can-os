import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import { resolveOwnedSiteOperationalAction } from "@/modules/operations/action-workspace.functions";

type OwnedFollowUp = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  priority: string;
  dueAt: string | null;
  createdAt: string;
};

const followUpLabels: Record<string, string> = {
  onsite_coverage_gap: "Coverage gap",
  onsite_pickup_denied_follow_up: "Denied pickup follow-up",
  onsite_pickup_uncollected_child: "Uncollected child follow-up",
};

/** Owner-only resolution for onsite coverage and custody follow-up Actions.
 * These exceptions belong to the named site leader; the registrar operations
 * queue remains the general path for every other Action type. Resolving
 * records what was done — it never edits the underlying attendance, pickup
 * or duty history. */
export function SiteOwnedActionResolution({ actions }: { actions: OwnedFollowUp[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function resolve(id: string) {
    const note = (notes[id] ?? "").trim();
    if (note.length < 10) {
      setError("Describe what was actually done (at least 10 characters) before resolving.");
      return;
    }
    setBusy(id); setError(""); setNotice("");
    try {
      await resolveOwnedSiteOperationalAction({ data: { id, resolutionNote: note } });
      setNotice("Follow-up resolved. The underlying attendance, pickup and duty records are preserved unchanged.");
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The resolution was not saved.");
    } finally { setBusy(""); }
  }

  return <WorkspacePanel title="Your assigned onsite follow-ups"
    description="Coverage gaps and pickup exceptions assigned to you as the named local leader. Record what was actually done before resolving."
    className="mt-6">
    {notice && <WorkspaceNotice tone="success" className="mb-3">{notice}</WorkspaceNotice>}
    {error && <p role="alert" className="mb-3 rounded border p-3 text-sm">{error}</p>}
    <ul className="space-y-3">
      {actions.map(action => <li key={action.id} className="rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{action.title}</span>
          <span className="text-xs text-muted-foreground">
            {followUpLabels[action.type] ?? action.type.replaceAll("_", " ")}
            {action.dueAt ? " · due " + new Date(action.dueAt).toLocaleDateString() : ""}
          </span>
        </div>
        {action.description &&
          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{action.description}</p>}
        <label className="mt-3 block text-xs font-semibold">
          What was done (required)
          <textarea value={notes[action.id] ?? ""} maxLength={2000} rows={2}
            onChange={event => setNotes(current => ({ ...current, [action.id]: event.target.value }))}
            placeholder="Factual record of the steps taken and any remaining handoff"
            className="mt-1 w-full rounded border bg-background p-2 text-sm font-normal" />
        </label>
        <Button className="mt-2" variant="outline"
          disabled={!!busy || (notes[action.id] ?? "").trim().length < 10}
          onClick={() => void resolve(action.id)}>
          {busy === action.id ? "Resolving…" : "Resolve follow-up"}
        </Button>
      </li>)}
    </ul>
  </WorkspacePanel>;
}
