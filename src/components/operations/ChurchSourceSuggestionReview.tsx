import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { getChurchSourceReferenceView } from "@/modules/sites/church-source-references.functions";
import {
  getChurchContentSuggestionView, getChurchSourceReviewContextView, refreshChurchWebsiteSuggestionsCommand, reviewChurchSourceExcerptCommand,
  submitChurchSourceExcerptCommand,
} from "@/modules/sites/church-content-suggestions.functions";
import { churchSuggestionTargetFields, churchSourcesChangedEvent, type ChurchSuggestionField } from "@/domain/church-source-references";
import { siteLocalContentLimits } from "@/domain/site-local-content";
import type { ChurchBrandProposal } from "@/domain/church-brand-suggestions";

type Ref = Awaited<ReturnType<typeof getChurchSourceReferenceView>>[number];
type Suggestion = Awaited<ReturnType<typeof getChurchContentSuggestionView>>[number];
type ReviewContext = Awaited<ReturnType<typeof getChurchSourceReviewContextView>>;
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
  const [reviewContext, setReviewContext] = useState<ReviewContext | null>(null);
  const [brandProposal, setBrandProposal] = useState<ChurchBrandProposal | null>(null);
  const [field, setField] = useState<ChurchSuggestionField>("church_history");
  const [sourcePageUrl, setSourcePageUrl] = useState("");
  const [text, setText] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [rightsConfirmations, setRightsConfirmations] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const website = references.find(ref => ref.kind === "website");

  useEffect(() => {
    let active = true;
    const reload = () => { void Promise.all([
      getChurchSourceReferenceView({ data: {} }),
      getChurchContentSuggestionView({ data: {} }),
      getChurchSourceReviewContextView({ data: {} }),
    ]).then(([refs, suggestions, context]) => {
      if (!active) return;
      setReferences(refs); setItems(suggestions); setReviewContext(context);
      setLoading(false);
    }).catch(() => { if (active) { setLoading(false); setError("Could not load church source suggestions."); } }); };
    reload();
    window.addEventListener(churchSourcesChangedEvent, reload);
    return () => { active = false; window.removeEventListener(churchSourcesChangedEvent, reload); };
  }, []);

  useEffect(() => {
    if (website) setSourcePageUrl(website.normalizedUrl);
  }, [website?.id, website?.normalizedUrl]);

  async function refresh() {
    const [refs, suggestions, context] = await Promise.all([
      getChurchSourceReferenceView({ data: {} }),
      getChurchContentSuggestionView({ data: {} }),
      getChurchSourceReviewContextView({ data: {} }),
    ]);
    setReferences(refs); setItems(suggestions); setReviewContext(context);
  }

  async function discover() {
    if (busy || !website) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await refreshChurchWebsiteSuggestionsCommand({ data: {} });
      setBrandProposal("brandProposal" in result ? result.brandProposal ?? null : null);
      await refresh();
      setMessage(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to retrieve church website suggestions.");
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!website || busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await submitChurchSourceExcerptCommand({
        data: { sourceReferenceId: website.id, field, sourcePageUrl, text },
      });
      setText("");
      await refresh();
      setMessage(result.changed === false
        ? "This church excerpt is already waiting for review. Nothing was published."
        : "Church excerpt added to the private review queue. Nothing was published.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to add this excerpt."); }
    finally { setBusy(false); }
  }

  async function review(item: Suggestion, decision: "accepted"|"edited"|"discarded") {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await reviewChurchSourceExcerptCommand({ data: {
        suggestionId: item.id, decision,
        ...(decision !== "discarded" ? { rightsConfirmed: rightsConfirmations[item.id] === true } : {}),
        ...(decision === "edited" ? { editedText: edits[item.id] ?? item.proposedText } : {}),
        ...(decision !== "discarded" ? { expectedRevision: reviewContext?.revision ?? currentRevision } : {}),
      } });
      await refresh();
      await router.invalidate();
      setMessage(result.alreadyReviewed
        ? "This suggestion was already reviewed. No second website revision was created."
        : result.publication
          ? result.publication.status === "review_required"
            ? `Church copy saved as revision ${result.publication.revision}, awaiting CAN review. Previously published copy is unchanged.`
            : `Church copy committed as revision ${result.publication.revision}. School authorization and institutional claims remain unchanged.`
          : "Source suggestion discarded. Nothing was published.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to review this suggestion.");
      await refresh().catch(() => setError("Review failed and the latest church editor revision could not be loaded. Reload this page before retrying."));
    } finally { setBusy(false); }
  }

  return <section aria-labelledby="church-source-review" className="mt-6 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
    <h2 id="church-source-review" className="font-serif text-2xl font-semibold">Review suggested church information</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Where enabled, you can request a bounded read of your public church website and review each proposed excerpt.
      If automated reading is unavailable, supply a short fact-based summary from a page on your church's website.
      Suggestions are unverified editorial inputs, not school facts. Never paste private information,
      protected third-party works, or images of children.
    </p>
    {loading && <p role="status" className="mt-3 text-sm">Loading review queue…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {!loading && !website && <p className="mt-4 rounded-lg border p-4 text-sm">
      Save your church's public website above to add attributed excerpts. You can always write local copy manually.
      <button type="button" disabled={busy} onClick={() => void refresh().catch(() => setError("Unable to refresh saved sources."))}
        className="mt-3 block rounded-lg border px-3 py-2 text-sm">Reload saved sources</button>
    </p>}
    {website && <div className="mt-4 rounded-xl border p-4">
      <h3 className="font-semibold">Discover church website suggestions</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Optional and user-initiated. Only bounded public text is considered; no images,
        social posts, transcripts or school authorization facts are imported.
        If extraction is disabled or the website blocks it, use the manual editor.
      </p>
      <button type="button" disabled={busy} onClick={() => void discover()}
        className="mt-3 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
        Check church website for suggestions
      </button>
    </div>}
    {brandProposal && <div className="mt-4 rounded-xl border p-4" aria-label="Church brand suggestions">
      <h3 className="font-semibold">Suggested church brand direction · private review</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Observed {new Date(brandProposal.observedAt).toLocaleDateString()} from your saved church website.
        These are evidence-backed suggestions only, not verified brand identity or permission to reproduce assets.
        Select a maintained palette and typography preset in the website branding editor below.
        Nothing is applied automatically.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {brandProposal.paletteCandidates.map(candidate => <div key={candidate.paletteId}
          className="rounded-lg border bg-background p-3">
          <p className="font-semibold capitalize">{candidate.paletteId} palette</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ink/canvas: {candidate.contrastInkCanvas.toFixed(1)}:1 · Muted/canvas:
            {" "}{candidate.contrastMutedCanvas.toFixed(1)}:1 · White/ink: {candidate.contrastWhiteInk.toFixed(1)}:1
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{candidate.reason}</p>
        </div>)}
        {brandProposal.typographyCandidates.map(candidate => <div key={candidate.typographyId}
          className="rounded-lg border bg-background p-3">
          <p className="font-semibold capitalize">{candidate.typographyId} typography</p>
          <p className="mt-2 text-xs text-muted-foreground">{candidate.reason}</p>
        </div>)}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Source evidence: {brandProposal.evidence.map(e => `${e.signal}: ${e.value} (${e.pageUrl})`).join("; ")}.
        Extraction: {brandProposal.extractionVersion}. Photos, logos and font files are never imported.
      </p>
    </div>}
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
        <textarea required value={text} maxLength={siteLocalContentLimits[churchSuggestionTargetFields[field] ?? "churchHistory"]} rows={4}
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
      {items.filter(item => item.reviewDecision === "pending").map(item => {
        const target = churchSuggestionTargetFields[item.field];
        const publishedText = target ? reviewContext?.publishedContent[target] ?? "" : "";
        const editorText = target ? reviewContext?.editorContent[target] ?? "" : "";
        return <article key={item.id} className="rounded-xl border p-4">
        <h3 className="font-semibold">{fieldOptions.find(option => option.value === item.field)?.label ?? item.field}</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Captured {new Date(item.retrievedAt).toLocaleDateString()} · Unverified, manually attributed or website-derived · Confidence: {item.confidence}
        </p>
        <a href={item.sourcePageUrl ?? item.sourceUrl} target="_blank" rel="noopener noreferrer"
          className="mt-1 block break-all text-xs underline">Review original source page</a>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-semibold text-muted-foreground">Last published church copy
              {reviewContext?.publishedRevision ? ` · revision ${reviewContext.publishedRevision}` : " · not yet published"}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{publishedText || "No published copy for this field."}</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Current editor copy · revision {reviewContext?.revision ?? currentRevision}
              {reviewContext?.editorStatus === "review_required" ? " · awaiting CAN review" : ""}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{editorText || "No editor copy for this field."}</p>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <p className="text-xs font-semibold text-muted-foreground">Proposed church copy · not yet approved</p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{item.proposedText}</p>
          </div>
        </div>
        {reviewContext?.editorStatus === "review_required" && editorText !== publishedText &&
          <p className="mt-3 text-sm text-muted-foreground">
            A more recent editor revision is awaiting institutional review. It may differ from the
            published copy shown above. Accepting this suggestion requires reviewing that latest revision.
          </p>}
        <label className="mt-3 block text-sm">Edit before saving
          <textarea rows={3} maxLength={target ? siteLocalContentLimits[target] : 1400} value={edits[item.id] ?? item.proposedText}
            onChange={event => setEdits(old => ({ ...old, [item.id]: event.target.value }))}
            className="mt-1 block w-full rounded-lg border bg-background p-2" />
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={rightsConfirmations[item.id] === true}
            onChange={event => setRightsConfirmations(old => ({ ...old, [item.id]: event.target.checked }))} />
          <span>I confirm our church owns this text or has permission to publish it on the school website.
            A public web page alone does not grant copying rights.</span>
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Accept or edit saves via the canonical versioned church content command. Safe copy may publish immediately;
          protected institutional claims are held for CAN review. Discard never changes website content.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={busy || rightsConfirmations[item.id] !== true} onClick={() => void review(item, "accepted")}
            className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
            Accept and save church copy
          </button>
          <button type="button" disabled={busy || rightsConfirmations[item.id] !== true} onClick={() => void review(item, "edited")}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Save edited copy</button>
          <button type="button" disabled={busy} onClick={() => void review(item, "discarded")}
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Discard</button>
        </div>
      </article>;
      })}
      {!loading && items.every(item => item.reviewDecision !== "pending") &&
        <p className="text-sm text-muted-foreground">No source excerpts are waiting for review. Continue with the church story editor below.</p>}
    </div>
  </section>;
}
