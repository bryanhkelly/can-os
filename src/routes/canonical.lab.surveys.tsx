import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalSurveyLab } from "@/modules/operations/canonical-survey-lab.functions";

export const Route = createFileRoute("/canonical/lab/surveys")({
  loader: () => safeLoader(() => getCanonicalSurveyLab())(),
  component: SurveysLabPage,
});

function SurveysLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Survey inspection" message={result.message}/>;
  const { definitions, campaigns, limits } = result.data;

  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Survey inspection"
    subtitle="Review organization-owned survey definitions and operating campaigns, with question previews and noncredit pilot preflight.">
    <CapabilityLabNav current="surveys"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">What preflight checks</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Configuration compatibility with the existing identified noncredit learner survey workflow.
        It does not confirm any particular learner's authorization, participation, submission, or
        successful delivery. No answers, recipient names, invitation IDs or secure response data are shown.
        Publishing, inviting and surveying remain owned by their canonical workflows.
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Limited to {limits.definitions} owned definitions and {limits.campaigns} operated campaigns.
        These records may belong to different survey owner and operator organizations.
      </p>
    </section>

    <section className="mt-7" aria-label="Owned survey definitions">
      <h2 className="font-serif text-2xl">Survey definitions</h2>
      <p className="mt-2 text-sm text-muted-foreground">Owned by your canonical provider organization. Draft definitions appear even without an operating campaign.</p>
      <div className="mt-3 overflow-x-auto border border-border bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="p-3 font-semibold">Definition</th>
              <th scope="col" className="p-3 font-semibold">Purpose / audience</th>
              <th scope="col" className="p-3 font-semibold">Status</th>
              <th scope="col" className="p-3 font-semibold">Versions</th>
            </tr>
          </thead>
          <tbody>
            {definitions.map(definition => <tr key={definition.id} className="border-b border-border last:border-0">
              <th scope="row" className="p-3 font-medium">{definition.title}
                <p className="mt-1 text-xs font-normal text-muted-foreground">{definition.code}</p>
                <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">{definition.id}</p>
              </th>
              <td className="p-3">{definition.purposeCode} · {definition.intendedAudience}</td>
              <td className="p-3">{definition.status}</td>
              <td className="p-3 tabular-nums">{definition.versionCount}
                <p className="mt-1 text-xs text-muted-foreground">{definition.latestVersion
                  ? "Latest in loaded inventory: v" + definition.latestVersion.versionNo + " · " + definition.latestVersion.lifecycle
                  : "No loaded version"}
                </p>
                {!definition.versionInventoryComplete && <p className="text-xs text-muted-foreground">Version inspection limited</p>}
              </td>
            </tr>)}
            {definitions.length === 0 && <tr><td colSpan={4} className="p-5 text-muted-foreground">
              No organization-owned survey definitions found.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className="mt-7" aria-label="Operating survey campaigns">
      <h2 className="font-serif text-2xl">Campaign preflight</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Each check evaluates configuration only. Open a campaign for the full blocker list
        and ordered question preview; safeguarding content requires protected review.
      </p>
      <div className="mt-4 grid gap-4">
        {campaigns.map(campaign => <article key={campaign.id} className="border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold">{campaign.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {campaign.definitionCode} · v{campaign.versionNo} · {campaign.versionLifecycle} · {campaign.locale}
              </p>
              <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{campaign.id}</p>
            </div>
            <span className={"border px-3 py-2 text-xs font-semibold " +
              (campaign.preflight.compatible ? "border-success text-foreground" : "border-border text-muted-foreground")}>
              {campaign.preflight.compatible ? "Configuration compatible" : "Needs attention"}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Status and mode</dt>
              <dd className="mt-1 font-medium">{campaign.status} · {campaign.mode}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Questions / branches</dt>
              <dd className="mt-1 font-medium tabular-nums">{campaign.questionCount} / {campaign.branchCount}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Invitations / sent</dt>
              <dd className="mt-1 font-medium tabular-nums">{campaign.invitationCount} / {campaign.sentInvitationCount}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Responses</dt>
              <dd className="mt-1 font-medium tabular-nums">{campaign.responseCount}</dd></div>
          </dl>
          <details className="mt-4 border-t border-border pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-primary underline underline-offset-4">
              View checks and question structure
            </summary>
            <div className="mt-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Noncredit pilot check</p>
              {campaign.preflight.compatible ?
                <p className="mt-2 text-sm">No configuration blockers found. Learner-specific eligibility remains unverified.</p> :
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {campaign.preflight.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
                </ul>}
              <p className="mt-4 text-xs text-muted-foreground">
                Deployment: {campaign.deploymentId ?? "Not attached"} ·
                Survey permission evidence: {campaign.permissionEvidenceId ? "Linked" : "Missing"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Scheduled: {new Date(campaign.startsAt).toLocaleString()} to
                {" "}{campaign.endsAt ? new Date(campaign.endsAt).toLocaleString() : "no end date"}
              </p>
              <h4 className="mt-5 font-semibold">Question preview</h4>
              {!campaign.questionPreviewComplete ?
                <p className="mt-2 text-sm text-muted-foreground">Complete question preview unavailable due to response limits. This campaign cannot pass preflight.</p> :
                <ol className="mt-3 space-y-3">
                  {campaign.questions.map(q => <li key={q.id} className="border border-border p-3">
                    <p className="font-medium">{q.ordinal}. {q.safetyTriage
                      ? "Protected safeguarding question" : q.prompt}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {q.type} · {q.required ? "Required" : "Optional"}
                      {q.safetyTriage ? " · Specialized handling required" : ""}
                      {q.ratingMin !== null && q.ratingMax !== null
                        ? " · Range " + q.ratingMin + "–" + q.ratingMax : ""}
                    </p>
                    {!q.safetyTriage && q.options.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                      {q.options.map(option => <li key={option.id}>{option.label}</li>)}
                    </ul>}
                  </li>)}
                </ol>}
            </div>
          </details>
        </article>)}
        {campaigns.length === 0 && <p role="status" className="border border-border bg-card p-5 text-sm text-muted-foreground">
          No operating survey campaigns found. Organization-owned definitions can still be inspected above.
        </p>}
      </div>
    </section>
  </WorkspaceShell>;
}
