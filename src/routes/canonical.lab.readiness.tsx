import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalAssessmentLab } from "@/modules/operations/canonical-assessment-lab.functions";

export const Route = createFileRoute("/canonical/lab/readiness")({
  loader: () => safeLoader(() => getCanonicalAssessmentLab())(),
  component: AssessmentLabPage,
});

function AssessmentLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Assessment inventory" message={result.message} />;
  const { assessments, limit } = result.data;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Assessment inventory"
    subtitle="Inspect diagnostic, foundation, readiness, mastery and other assessment definitions without seeing learner answers or secure scoring keys.">
    <CapabilityLabNav current="readiness"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Catalog only</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Showing up to {limit} definitions owned by your canonical organization.
        Published versions are not evidence that learners completed diagnostics or achieved mastery.
        Authoring, item review, secure scoring and readiness decisions remain with their owned workflows.
      </p>
    </section>
    <div className="mt-5 overflow-x-auto border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="p-3 font-semibold">Assessment</th>
            <th scope="col" className="p-3 font-semibold">Purpose</th>
            <th scope="col" className="p-3 font-semibold">Status</th>
            <th scope="col" className="p-3 font-semibold">Versions</th>
            <th scope="col" className="p-3 font-semibold">Course linkage</th>
          </tr>
        </thead>
        <tbody>
          {assessments.map(row => <tr key={row.id} className="border-b border-border align-top last:border-0">
            <th scope="row" className="p-3 font-medium">{row.title}
              <p className="mt-1 font-mono text-xs font-normal text-muted-foreground">{row.key}</p>
              <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">{row.id}</p>
            </th>
            <td className="p-3">{row.purpose}</td>
            <td className="p-3">{row.status}</td>
            <td className="p-3 tabular-nums">{row.versionCount}
              <p className="mt-1 text-xs text-muted-foreground">
                {row.latestVersionNo === null ? "No versions" : "Latest v" + row.latestVersionNo + " · " + row.latestLifecycle}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.hasPublishedVersion ? "Published version exists" : "None published"}
              </p>
            </td>
            <td className="p-3">{row.isCourseLinked ? "Version linked" : "Not linked"}</td>
          </tr>)}
          {assessments.length === 0 && <tr><td colSpan={5} role="status"
            className="p-5 text-muted-foreground">No organization-owned assessment definitions in this scope.</td></tr>}
        </tbody>
      </table>
    </div>
  </WorkspaceShell>;
}
