import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { getChurchSourceReferenceView } from "@/modules/sites/church-source-references.functions";
import {
  getChurchContentSuggestionView, reviewChurchSourceExcerptCommand,
  submitChurchSourceExcerptCommand,
} from "@/modules/sites/church-content-suggestions.functions";
import { type ChurchSuggestionField } from "@/domain/church-source-references";

type Ref = Awaited<ReturnType<typeof getChurchSourceReferenceView>>[number];
type Suggestion = Awaited<ReturnType<typeof getChurchContentSuggestionView>>[number];
const fieldOptions: ReadonlyArray<{ value: ChurchSuggestionField; label: string }> = [
  { value: "church_history", label: "Church history" },
  { value: "church_mission", label: "Church mission" },
  { value: "church_vision", label: "Church vision" },
  { value: "denomination", label: "Denomination" },
  { value: "local_community", label: "Community outreach" },
  { value: "leadership_intro", label: "Leadership welcome" },
  { value: "ministries", label: "Church ministries / traditions" },
  { value: "welcome_message", label: "Welcome message" },
  { value: "faith_and_values", label: "Faith and values" },
];

export function ChurchSourceSuggestionReview({ currentRevision }: { currentRevision: number }) {
  const router = useRouter();
  const [references, setReferences] = useState<Ref[]>([]);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [field, setField] = useState<ChurchSuggestionField>("church_history");
  const [sourcePageUrl, setSourcePageUrl] = useState("");
  const [text, setText] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const website = references.find(ref => ref.kind === "website");

  useEffect(() => {
    let active = true;
    void Promise.all([
      getChurchSourceReferenceView({ data: {} }),
      getChurchContentSuggestionView({ data: {} }),
    ]).then(([refs, suggestions]) => {
      if (!active) return;
      setReferences(refs); setItems(suggestions);
      setLoading(false);
    }).catch(() => { if (active) { setLoading(false); setError("Could not load church source suggestions."); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (website && !sourceId) {
      setSourceId(website.id);
      setSourcePageUrl(website.normalizedUrl);
    }
  }, [website?.id, website?.normalizedUrl, sourceId]);

  async function refresh() {
    const [refs, suggestions] = await Promise.all([
      getChurchSourceReferenceView({ data: {} }),
      getChurchContentSuggestionView({ data: {} }),
    ]);
    setReferences(refs); setItems(suggestions);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!website || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await submitChurchSourceExcerptCommand({
        data: { sourceReferenceId: website.id, field, sourcePageUrl, text },
      });
      setText("");
      await refresh();
      setMessage("Excerpt added for review. Nothing was published.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add this excerpt."); }
    finally { setBusy(false); }
  }

  async function review(item: Suggestion, decision: "accepted"|"edited"|"discarded") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await reviewChurchSourceExcerptCommand({ data: {
        suggestionId: item.id, decision,
        ...(decision === "edited" ? { editedText: edits[item.id] ?? item.proposedText } : {}),
        ...(decision !== "discarded" ? { expectedRevision: currentRevision } : {}),
      } });
      await refresh();
      await router.invalidate();
      setMessage(result.publication
        ? result.publication.status === "review_required"
          ? "Church text is held for institutional claim review. Previously published copy remains unchanged."
          : "Church-owned copy saved as a new published revision. School authorization and institutional claims remain unchanged."
        : "Source suggestion discarded. Nothing was published.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to review this suggestion."); }
    finally { setBusy(false); }
  }

  return <section aria-labelledby="church-source-review" className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <h2 id="church-source-review" className="font-serif text-2xl font-semibold">Review suggested church information</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Automated website import is not enabled. For now, copy a short excerpt from a page on your saved church website,
      cite its page address, and review it here. This is user-supplied source material—not independent CAN verification.
      Never paste private information, protected third-party works, or images of children.
    </p>
    {loading && <p role="status" className="mt-3 text-sm">Loading review queue…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {!loading && !website && <p className="mt-4 rounded-lg border p-4 text-sm">
      Save your church's public website above to add attributed excerpts. You can always write local copy manually.
    </p>}
    {website && <form onSubmit={event => void submit(event)} className="mt-4 grid gap-3 rounded-xl border p-4">
      <h3 className="font-semibold">Add a source excerpt for review</h3>
      <label className="text-sm">Church information field
        <select value={field} onChange={event => setField(event.target.value as ChurchSuggestionField)}
          className="mt-1 block w-full rounded-lg border bg-background p-2">
          {fieldOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="text-sm">Source page URL (same church website)
        <input type="url" required maxLength={2048} value={sourcePageUrl}
          onChange={event => setSourcePageUrl(event.target.value)}
          className="mt-1 block w-full rounded-lg border bg-background p-2" />
      </label>
      <label className="text-sm">Source excerpt or your proposed summary
        <textarea required value={text} maxLength={1400} rows={4}
          onChange={event => setText(event.target.value)}
          className="mt-1 block w-full rounded-lg border bg-background p-2" />
      </label>
      <p className="text-xs text-muted-foreground">Your excerpt is stored only in the private editorial queue; it is not published on submission.</p>
      <button type="submit" disabled={busy}
        className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        Add for review
      </button>
    </form>}
    <div className="mt-5 grid gap-4">
      {items.filter(item => item.reviewDecision === "pending").map(item => <article key={item.id} className="rounded-xl border p-4">
        <h3 className="font-semibold">{fieldOptions.find(option => option.value === item.field)?.label ?? item.field}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Submitted {new Date(item.retrievedAt).toLocaleDateString()} · User-provided, unverified excerpt · Confidence: {item.confidence}
        </p>
        <a href={item.sourcePageUrl ?? item.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="mt-1 block break-all text-xs underline">Review original source page</a>
        <blockquote className="mt-3 whitespace-pre-wrap rounded-lg border-l-2 pl-3 text-sm">{item.proposedText}</blockquote>
        <label className="mt-3 block text-sm">Edit before saving
          <textarea rows={3} maxLength={1400} value={edits[item.id] ?? item.proposedText}
            onChange={event => setEdits(old => ({ ...old, [item.id]: event.target.value }))}
            className="mt-1 block w-full rounded-lg border bg-background p-2" />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Accept or edit saves via the canonical versioned church content command. Safe copy may publish immediately;
          protected institutional claims are held for CAN review. Discard never changes website content.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void review(item, "accepted")}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
            Accept and save church copy
          </button>
          <button type="button" disabled={busy} onClick={() => void review(item, "edited")}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Save edited copy</button>
          <button type="button" disabled={busy} onClick={() => void review(item, "discarded")}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Discard</button>
        </div>
      </article>)}
      {!loading && items.every(item => item.reviewDecision !== "pending") &&
        <p className="text-sm text-muted-foreground">No source excerpts are waiting for review. Continue with the church story editor below.</p>}
    </div>
  </section>;
}
