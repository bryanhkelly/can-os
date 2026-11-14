import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalQualificationLab } from "@/modules/operations/canonical-qualification-lab.functions";

export const Route = createFileRoute("/canonical/lab/site-qualification")({
  loader: () => safeLoader(() => getCanonicalQualificationLab())(),
  component: QualificationLabPage,
});

function QualificationLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Site qualification" message={result.message}/>;
  const { applications, limit } = result.data;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Site qualification"
    subtitle="Inspect site qualification applications, program-fit evidence summaries and latest review recommendations.">
    <CapabilityLabNav current="site-qualification"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">No implied approval</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Showing up to {limit} site or proposed-site applications owned by your canonical organization,
        limited to authorized Sites where a Site is assigned. Counts use the latest recorded
        determination for each requirement. A recommendation is not a site opening authorization,
        safety certification or final compliance approval. Evidence bodies and applicant contact
        details are not exposed.
      </p>
    </section>
    <div className="mt-5 overflow-x-auto border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="p-3 font-semibold">Application / Site</th>
            <th scope="col" className="p-3 font-semibold">Population</th>
            <th scope="col" className="p-3 font-semibold">Program fit</th>
            <th scope="col" className="p-3 font-semibold">Requirement observations</th>
            <th scope="col" className="p-3 font-semibold">Review recommendation</th>
          </tr>
        </thead>
        <tbody>
          {applications.map(row => <tr key={row.id} className="border-b border-border align-top last:border-0">
            <th scope="row" className="p-3 font-medium">
              {row.subjectKind === "proposed_site" ? "Proposed site" : "Site"} · {row.status}
              <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">{row.siteId ?? "No canonical Site attached"}</p>
              <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">Application {row.id}</p>
            </th>
            <td className="p-3">{row.intendedPopulation}</td>
            <td className="p-3">{row.assessmentCount} assessment(s)
              <p className="mt-1 text-xs text-muted-foreground">
                {row.latestDeliveryContext ?? "No fit assessment"} · {row.latestPopulation ?? "Not assessed"}
              </p>
              {row.policyVersionId && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                Policy version {row.policyVersionId}</p>}
            </td>
            <td className="p-3 tabular-nums">
              {row.requirementsObserved} observed · {row.satisfied} satisfied
              <p className="mt-1 text-xs text-muted-foreground">
                {row.deficient} deficient · {row.pending} pending
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.verified} verified · {row.evidenceLinked} evidence-linked
              </p>
            </td>
            <td className="p-3">{row.latestReviewOutcome ?? "No review recorded"}</td>
          </tr>)}
          {applications.length === 0 && <tr><td colSpan={5} role="status"
            className="p-5 text-muted-foreground">
            No site qualification applications in this authorized scope.
          </td></tr>}
        </tbody>
      </table>
    </div>
  </WorkspaceShell>;
}
