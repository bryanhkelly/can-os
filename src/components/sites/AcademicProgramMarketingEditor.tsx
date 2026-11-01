import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  getSitePublicationDraftView, setAcademicProgramMarketingStatus,
} from "@/modules/sites/site-publication.functions";

type Draft = Awaited<ReturnType<typeof getSitePublicationDraftView>>;
type AcademicProgram = Draft["academicPrograms"][number];

/** Scoped publisher UI; the server independently verifies every decision. */
export function AcademicProgramMarketingEditor({
  siteId, program,
}: {
  siteId: string;
  program: AcademicProgram;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState(program.marketing?.summary ?? "");
  const [reason, setReason] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const published = program.marketing?.status === "published";
  const eligible = !["closed", "paused"].includes(program.status);
  const action = published ? "unpublish" : "publish";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true); setNotice(""); setError("");
    try {
      const result = await setAcademicProgramMarketingStatus({ data: {
        siteId, programId: program.id, action,
        expectedRevision: program.marketing?.updatedAt ?? null,
        summary: published ? "" : summary,
        reason, contentReviewed: !published && reviewed,
      } });
      setNotice(result.changed ? (published
        ? "Academic program withdrawn from the public catalog."
        : "Academic marketing approved. The Site must also be published to appear publicly.")
        : "No publication change was needed.");
      setReason(""); setReviewed(false);
      await router.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to change marketing approval.");
    } finally {
      setPending(false);
    }
  }

  return <article className="rounded-xl border bg-card p-5">
    <h3 className="text-lg font-semibold">{program.name}</h3>
    <p className="mt-1 text-xs text-muted-foreground">
      {program.type.replaceAll("_", " ")} · Grades {program.gradeRange.min}–{program.gradeRange.max}
    </p>
    <p className="mt-2 text-sm text-muted-foreground">
      Academic operations: {program.status}. Public marketing: {program.marketing?.status ?? "not approved"}.
    </p>
    {published && program.marketing?.current === false && <p role="alert"
      className="mt-3 rounded-lg border border-amber-500 p-3 text-sm">
      This approved listing no longer matches the canonical Program title,
      grades, delivery schedule or current protected-claim rules. It is
      withheld from the public catalog. Withdraw the outdated listing,
      then review and approve a new snapshot before advertising it.
    </p>}
    <form className="mt-4 space-y-3" onSubmit={submit}>
      {!published && <label className="block text-sm">
        Public description (30–2,000 characters; plain text)
        <textarea rows={4} minLength={30} maxLength={2000}
          value={summary} onChange={event => setSummary(event.target.value)}
          className="mt-1 block w-full rounded-lg border bg-background p-2"
          placeholder="Describe the educational experience without promising accreditation, admission, credit, or outcomes."/>
      </label>}
      {published && <p className="text-sm whitespace-pre-line">
        Approved description: {program.marketing?.summary}
      </p>}
      <label className="block text-sm">
        Decision reason (10–500 characters; no student information)
        <textarea rows={2} value={reason} minLength={10} maxLength={500}
          onChange={event => setReason(event.target.value)}
          className="mt-1 block w-full rounded-lg border bg-background p-2"/>
      </label>
      {!published && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={reviewed}
          onChange={event => setReviewed(event.target.checked)}/>
        <span>I reviewed the title, grades, delivery model and description.
          I understand this does not open enrollment or certify academic authority.</span>
      </label>}
      <button type="submit" disabled={pending || reason.trim().length < 10 ||
        (!published && (!eligible || !reviewed || summary.trim().length < 30))}
        className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50">
        {pending ? "Saving…" : published ? "Unpublish program listing" : "Approve academic listing"}
      </button>
      {!eligible && !published && <p className="text-sm text-muted-foreground">
        Paused or closed Programs cannot be newly published.
      </p>}
      {error && <p role="alert" className="text-sm">{error}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </form>
  </article>;
}
