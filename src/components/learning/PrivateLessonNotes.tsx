import { useCallback, useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { QueryState, ActionFooter, DisclosureSection } from "@/components/workspace";
import { useMutationFeedback, mutationErrorMessage } from "@/lib/mutation-feedback";
import { getPrivateLessonNote, savePrivateLessonNote } from "@/modules/learning/classroom-notes.functions";

export function PrivateLessonNotes({ sectionId, versionId, lessonId }: {
  sectionId: string; versionId: string; lessonId: string;
}) {
  const [saved, setSaved] = useState<Awaited<ReturnType<typeof getPrivateLessonNote>> | null>(null);
  const [body, setBody] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const refresh = useCallback(async () => {
    const note = await getPrivateLessonNote({ data: { sectionId, versionId, lessonId } });
    setSaved(note);
  }, [sectionId, versionId, lessonId]);
  const mutation = useMutationFeedback(refresh);
  useEffect(() => {
    let active = true;
    getPrivateLessonNote({ data: { sectionId, versionId, lessonId } }).then(note => {
      if (active) { setSaved(note); setBody(note.body); setLoadError(""); setLoading(false); }
    }, error => {
      if (active) { setLoadError(mutationErrorMessage(error, "Unable to load your private notes.")); setLoading(false); }
    });
    return () => { active = false; };
  }, [sectionId, versionId, lessonId, reload]);
  const dirty = saved !== null && body !== saved.body;
  const busy = loading || mutation.pending || mutation.refreshFailed;
  const blocker = useBlocker({ shouldBlockFn: () => dirty || mutation.pending || mutation.refreshFailed,
    enableBeforeUnload: dirty || mutation.pending || mutation.refreshFailed, withResolver: true });
  async function save() {
    if (!saved || busy || !dirty) return;
    await mutation.run(() => savePrivateLessonNote({ data: { sectionId, versionId, lessonId, body, revision: saved.revision } }), {
      successMessage: "Private notes saved.", commandErrorMessage: "Unable to save your private notes.",
    });
  }
  return <section className="space-y-4" aria-label="Private lesson notes">
    <Modal open={blocker.status === "blocked"} onClose={() => blocker.reset?.()} label="Leave this lesson?">
      <div className="space-y-4 p-5"><h2 className="font-serif text-2xl">Leave this lesson?</h2>
        <p className="text-sm">{mutation.pending ? "Your note is still saving. Wait for the result before leaving." :
          mutation.refreshFailed ? "The save succeeded but could not be refreshed. Retry the refresh before leaving, or leave without confirming the saved revision." :
          "You have unsaved private notes. Stay to save them, or discard this unsaved writing."}</p>
        <ActionFooter layout="dialog"><Button type="button" onClick={() => blocker.reset?.()}>Stay in lesson</Button>
          <Button type="button" variant="outline" disabled={mutation.pending} onClick={() => blocker.proceed?.()}>{dirty ? "Discard changes and leave" : "Leave lesson"}</Button></ActionFooter>
      </div>
    </Modal>
    <p className="text-sm text-muted-foreground">These notes are private to your signed-in identity. They are not submitted work, teacher feedback, or a grade. Shared demo identities also share their notes.</p>
    <QueryState loading={loading?"Loading private notes…":undefined} error={loadError||undefined} onRetry={() => { setLoading(true); setLoadError(""); setReload(value => value + 1); }}>
    {saved && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      <Field label="Your notes" className="text-sm font-semibold">
        <Textarea value={body} rows={10} maxLength={30000} disabled={busy}
          onChange={event => setBody(event.target.value)} className="p-4 font-normal leading-7"
          placeholder="Capture a question, an example, or what you want to remember."/>
      </Field>
      <ActionFooter layout="inline">
        <Button type="submit" disabled={busy || !dirty} loading={mutation.pending} loadingLabel="Saving notes…">Save notes</Button>
        <span className="text-xs text-muted-foreground">{dirty ? "Unsaved changes. Save before leaving this lesson." : saved.revision > 0 ? "Saved to your account" : "No notes saved yet"} · {body.length.toLocaleString()} / 30,000</span>
      </ActionFooter>
    </form>}
    </QueryState>
    <MutationFeedback state={mutation} pendingMessage="Saving private notes..."/>
    {mutation.error && !mutation.refreshFailed && saved && <DisclosureSection title="Resolve a conflict or uncertain save">
      <p className="my-2 text-muted-foreground">Reload the saved revision without discarding your writing, then compare it before saving again.</p>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void mutation.run(async () => {
        await refresh();
      }, { successMessage: "Saved revision reloaded. Your unsaved writing is still in the editor.", commandErrorMessage: "Unable to reload the saved note." })}>Reload saved revision</Button>
      <pre className="mt-3 min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] border border-border p-3">{saved.body || "No saved text."}</pre>
    </DisclosureSection>}
  </section>;
}
