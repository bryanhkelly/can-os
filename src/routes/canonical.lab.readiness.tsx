import { createFileRoute } from "@tanstack/react-router";
import { DirectoryTable, WorkspaceShell } from "@/components/workspace";
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
    <DirectoryTable label="Assessment inventory" caption="Organization-owned assessment definitions; learner answers and secure scoring are excluded."
      rows={assessments} rowKey={row=>row.id}
      empty={<p className="p-4 text-sm text-muted-foreground">No organization-owned assessment definitions in this scope.</p>}
      columns={[
        {id:"assessment",title:"Assessment",render:row=><>{row.title}
          <p className="mt-1 font-mono text-xs text-muted-foreground">{row.key}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.id}</p></>},
        {id:"purpose",title:"Purpose",render:row=>row.purpose},
        {id:"status",title:"Status",render:row=>row.status},
        {id:"versions",title:"Versions",render:row=><>{row.versionCount}
          <p className="mt-1 text-xs text-muted-foreground">{row.latestVersionNo===null?"No versions":"Latest v"+row.latestVersionNo+" · "+row.latestLifecycle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{row.hasPublishedVersion?"Published version exists":"None published"}</p></>},
        {id:"linkage",title:"Course linkage",render:row=>row.isCourseLinked?"Version linked":"Not linked"},
      ]}/>
  </WorkspaceShell>;
}
