import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
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
  const [attempted, setAttempted] = useState(false);
  const mutation = useMutationFeedback(() => router.invalidate());
  const pending = mutation.pending || mutation.refreshFailed;
  const published = program.marketing?.status === "published";
  const eligible = !["closed", "paused"].includes(program.status);
  const action = published ? "unpublish" : "publish";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    if (reason.trim().length < 10 || (!published && (!eligible || !reviewed || summary.trim().length < 30))) return;
    await mutation.run(async () => {
      const result = await setAcademicProgramMarketingStatus({ data: {
        siteId, programId: program.id, action,
        expectedRevision: program.marketing?.updatedAt ?? null,
        summary: published ? "" : summary,
        reason, contentReviewed: !published && reviewed,
      } });
      setReason(""); setReviewed(false);
      return result;
    }, {
      successMessage: result => result.changed ? (published
        ? "Academic program withdrawn from the public catalog."
        : "Academic marketing approved. The Site must also be published to appear publicly.")
        : "No publication change was needed.",
      commandErrorMessage: "Unable to change marketing approval.",
    });
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
    {published && program.marketing?.current === true &&
      program.marketing?.catalogEligible === false && <p role="alert"
      className="mt-3 rounded-lg border border-amber-500 p-3 text-sm">
      This Program is not eligible for the public catalog. Its underlying
      institutional operating authorization may be absent, expired, suspended
      or revoked, or the Program may no longer be eligible. Review and restore
      the canonical authorization before publishing school information again.
    </p>}
    <form noValidate className="mt-4 space-y-3" onSubmit={submit}>
      {!published && <Field label="Public description (30–2,000 characters; plain text)" required
        error={attempted&&summary.trim().length<30?"Enter a public description with at least 30 characters.":undefined}>
        <Textarea rows={4} minLength={30} maxLength={2000}
          value={summary} onChange={event => setSummary(event.target.value)}
          placeholder="Describe the educational experience without promising accreditation, admission, credit, or outcomes."/>
      </Field>}
      {published && <p className="text-sm whitespace-pre-line">
        Approved description: {program.marketing?.summary}
      </p>}
      <Field label="Decision reason (10–500 characters; no student information)" required
        error={attempted&&reason.trim().length<10?"Enter at least 10 characters explaining the decision.":undefined}>
        <Textarea rows={2} value={reason} minLength={10} maxLength={500}
          onChange={event => setReason(event.target.value)}
          />
      </Field>
      {!published && <Field label="I reviewed the title, grades, delivery model and description. I understand this does not open enrollment or certify academic authority."
        required error={attempted&&!reviewed?"Confirm that you reviewed the public listing.":undefined}>
        <Checkbox checked={reviewed} onChange={event => setReviewed(event.target.checked)}/>
      </Field>}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : published ? "Unpublish program listing" : "Approve academic listing"}
      </Button>
      {!eligible && !published && <p className="text-sm text-muted-foreground">
        Paused or closed Programs cannot be newly published.
      </p>}
      <MutationFeedback state={mutation} pendingMessage="Saving academic marketing decision..."/>
    </form>
  </article>;
}
