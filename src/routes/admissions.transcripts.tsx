import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { LoaderFailure } from "@/lib/loader-failure";
import { safeLoader } from "@/lib/safe-loader";
import {
  issueTranscript,
  listTranscriptIssuanceCandidates,
} from "@/modules/learning/report-cards.functions";
import { WorkspaceShell } from "@/components/workspace";

const loadTranscriptCandidates = (query: string) =>
  listTranscriptIssuanceCandidates({ data: { query } });

export const Route = createFileRoute("/admissions/transcripts")({
  validateSearch: (search: Record<string, unknown>) => ({
    query: typeof search.query === "string" ? search.query.slice(0, 100) : "",
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
    return <LoaderFailure eyebrow="CAN OS · Registrar" title="Official transcripts" outcome={outcome} />;
  }
  return <TranscriptIssuanceView
    query={Route.useSearch().query}
    candidates={outcome.data.candidates}
    truncated={"truncated" in outcome.data && outcome.data.truncated === true}
  />;
}

type Candidates = Awaited<ReturnType<typeof loadTranscriptCandidates>>["candidates"];

function TranscriptIssuanceView({
  query,
  candidates,
  truncated,
}: {
  query: string;
  candidates: Candidates;
  truncated: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    const normalized = search.trim();
    if (normalized.length < 2) {
      setError("Enter at least two characters to search for a student.");
      return;
    }
    void router.navigate({to:"/admissions/transcripts",search:{query:normalized}});
  }

  async function issue(studentPersonId: string, studentName: string) {
    setBusy(studentPersonId);
    setError("");
    setNotice("");
    try {
      await issueTranscript({ data: {
        studentPersonId,
        purpose: purpose.trim() || undefined,
      } });
      await router.invalidate();
      setNotice(`Official transcript issued for ${studentName}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to issue the transcript.");
    } finally {
      setBusy("");
    }
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Registrar"
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
      {notice && <p role="status" className="mt-4 rounded-lg border p-3 text-sm">{notice}</p>}
      <form onSubmit={submitSearch} className="mt-6 flex flex-wrap items-end gap-3">
        <label className="min-w-64 flex-1 text-sm font-semibold">
          Student name
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            maxLength={100}
            className="mt-1 block w-full rounded-lg border bg-background p-3 font-normal"
            autoComplete="off"
          />
        </label>
        <button className="rounded-lg bg-foreground px-4 py-3 text-sm font-semibold text-background">
          Search
        </button>
      </form>
      <label className="mt-4 block max-w-xl text-sm">
        Issuance purpose (optional)
        <input
          value={purpose}
          onChange={event => setPurpose(event.target.value)}
          maxLength={500}
          className="mt-1 block w-full rounded-lg border bg-background p-3"
          placeholder="For example, college application"
        />
      </label>
      {query.length < 2
        ? <p className="mt-6 rounded-lg border p-4 text-sm text-muted-foreground">
            Search by at least two characters. Only students with finalized grades or an approved W notation in your permitted sites and programs are returned.
          </p>
        : truncated
          ? <p role="status" className="mt-6 rounded-lg border p-4 text-sm text-amber-800">
              Too many transcript records match this search to verify credit issuers safely. Search with a more specific student name.
            </p>
          : <section aria-label="Transcript candidates" className="mt-6 space-y-3">
            {candidates.map(candidate => (
              <article key={candidate.studentPersonId} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
                <div>
                  <h2 className="font-semibold">{candidate.studentName}</h2>
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
                  {busy === candidate.studentPersonId ? "Issuing…" : "Issue official transcript"}
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
