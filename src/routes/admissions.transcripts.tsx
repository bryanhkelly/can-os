import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import {
  issueTranscript,
  listTranscriptIssuanceCandidates,
} from "@/modules/learning/report-cards.functions";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const loadTranscriptCandidates = (query: string) =>
  listTranscriptIssuanceCandidates({ data: { query } });

export const Route = createFileRoute("/admissions/transcripts")({
  validateSearch: (search: Record<string, unknown>): { query: string; student?: string } => ({
    query: typeof search.query === "string" ? search.query.slice(0, 100) : "",
    student: typeof search.student === "string" ? search.student : undefined,
  }),
  loaderDeps: ({ search }) => ({ query: search.query }),
  loader: ({ deps }) => safeLoader(() => loadTranscriptCandidates(deps.query), {
    authMessage: "Sign in with an authorized registrar account to issue transcripts.",
  })(),
  component: TranscriptIssuancePage,
});

function TranscriptIssuancePage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) {
    return <LoaderFailure eyebrow="Registrar" title="Official transcripts" outcome={outcome} />;
  }
  return <TranscriptIssuanceView
    query={Route.useSearch().query}
    student={Route.useSearch().student}
    candidates={outcome.data.candidates}
    truncated={"truncated" in outcome.data && outcome.data.truncated === true}
  />;
}

type Candidates = Awaited<ReturnType<typeof loadTranscriptCandidates>>["candidates"];

function TranscriptIssuanceView({
  query,
  student,
  candidates,
  truncated,
}: {
  query: string;
  student?: string;
  candidates: Candidates;
  truncated: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [purpose, setPurpose] = useState("");
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const [error, setError] = useState("");

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalized = search.trim();
    if (normalized.length < 2) {
      setError("Enter at least two characters to search for a student.");
      return;
    }
    void router.navigate({to:"/admissions/transcripts",search:{query:normalized}});
  }

  async function issue(studentPersonId: string, studentName: string) {
    setError("");
    await mutation.run(() => issueTranscript({ data: {
        studentPersonId,
        purpose: purpose.trim() || undefined,
      } }), {
        successMessage: `Official transcript issued for ${studentName}.`,
        commandErrorMessage: "Unable to issue the transcript.",
      });
  }

  return (
    <WorkspaceShell
      eyebrow="Registrar"
      title="Official transcripts"
      subtitle="Search finalized academic records in your authorized school scope and issue a point-in-time transcript from the credit issuer of record."
      actions={<div className="flex flex-wrap gap-2">
        <Link to="/operations/transfer-records" className="rounded-lg border px-3 py-2 text-sm">Complete records handoffs</Link>
        <Link to="/admissions/credential-delivery" className="rounded-lg border px-3 py-2 text-sm">Deliver official credentials</Link>
        <Link to="/admissions" className="rounded-lg border px-3 py-2 text-sm">Admissions</Link>
      </div>}
    >
      <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
        An official transcript records finalized coursework, grades, and recorded credits.
        Courses without recorded credit units remain part of the transcript with credits marked
        Not recorded. Missing credits do not block issuance, and issuing a transcript does
        not certify graduation or award a diploma.
      </p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-400 p-3 text-sm">{error}</p>}
      <MutationFeedback state={mutation} pendingMessage="Issuing official transcript..." className="mt-4"/>
      <form onSubmit={submitSearch} className="mt-6 flex flex-wrap items-end gap-3">
        <Field label="Student name" className="min-w-64 flex-1 text-sm font-semibold"
          description="Search by at least two characters. Only students in your authorized school scope are returned.">
          <Input
            value={search}
            onChange={event => setSearch(event.target.value)}
            maxLength={100}
            autoComplete="off"
          />
        </Field>
        <Button type="submit">
          Search
        </Button>
      </form>
      <Field label="Issuance purpose (optional)" className="mt-4 max-w-xl text-sm">
        <Input
          value={purpose}
          onChange={event => setPurpose(event.target.value)}
          maxLength={500}
          placeholder="For example, college application"
        />
      </Field>
      {student && <Link to="/admissions/transcripts" search={{query}} className="mt-4 inline-block text-sm underline">All matching transcript candidates</Link>}
      {query.length < 2
        ? <p className="mt-6 rounded-lg border p-4 text-sm text-muted-foreground">
            Search by at least two characters. Only students with finalized grades or an approved W notation in your permitted sites and programs are returned.
          </p>
        : truncated
          ? <p role="status" className="mt-6 rounded-lg border p-4 text-sm text-amber-800">
              Too many transcript records match this search to verify credit issuers safely. Search with a more specific student name.
            </p>
          : <section aria-label="Transcript candidates" className="mt-6 space-y-3">
            {student && !candidates.some(candidate => candidate.studentPersonId === student) &&
              <p role="status" className="rounded-lg border p-4 text-sm">This transcript candidate is unavailable in your current search and school scope.</p>}
            {candidates.filter(candidate => !student || candidate.studentPersonId === student).map(candidate => (
              <article key={candidate.studentPersonId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
                <div>
                  <h2 className="font-semibold"><Link to="/admissions/transcripts" search={{query,student:candidate.studentPersonId}} className="underline">{candidate.studentName}</Link></h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {candidate.recordCount} transcript record{candidate.recordCount === 1 ? "" : "s"}
                    {candidate.issuer ? ` · Credit issuer: ${candidate.issuer.name}` : ""}
                  </p>
                  {candidate.multipleIssuers && <p className="mt-1 text-sm text-amber-800">
                    This record spans multiple credit issuers and cannot be issued as one transcript without a transfer-credit agreement.
                  </p>}
                </div>
                <button
                  type="button"
                  disabled={Boolean(busy) || candidate.multipleIssuers || !candidate.issuer}
                  onClick={() => void issue(candidate.studentPersonId, candidate.studentName)}
                  className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {mutation.pending ? "Issuing…" : "Issue official transcript"}
                </button>
              </article>
            ))}
            {!candidates.length && <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              No eligible students match this search in your authorized scope.
            </p>}
          </section>}
    </WorkspaceShell>
  );
}
