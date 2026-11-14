import { createFileRoute, Link } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalCapabilityLab } from "@/modules/operations/canonical-capability-lab.functions";

export const Route = createFileRoute("/canonical/capability-lab")({
  loader: () => safeLoader(() => getCanonicalCapabilityLab())(),
  component: CapabilityLabOverview,
});

const areas = [
  {
    title: "Survey publication",
    detail: "Confirm independent privacy, accessibility and safeguarding approvals before publishing immutable survey versions.",
    path: "/canonical/lab/survey-publications",
    status: "Feature-flagged publication workflow",
  },
  {
    title: "Survey draft authoring",
    detail: "Create versioned, reusable survey drafts. Disabled by default until the scoped writer role is provisioned.",
    path: "/canonical/lab/survey-drafts",
    status: "Feature-flagged write workflow",
  },
  {
    title: "Site qualification",
    detail: "Inspect site qualification applications, program-fit assessments, requirement findings and reviewer recommendations.",
    path: "/canonical/lab/site-qualification",
    status: "Read-only testing page",
  },
  {
    title: "Program deployments",
    detail: "Inspect operator-scoped deployments, offering adoption, learner counts and executed Blueprint lineage.",
    path: "/canonical/lab/deployments",
    status: "Read-only testing page",
  },
  {
    title: "Assessment catalog and readiness",
    detail: "Review organization-owned diagnostic, foundation and mastery assessment definitions and version state.",
    path: "/canonical/lab/readiness",
    status: "Read-only testing page",
  },
  {
    title: "Programs and Blueprint configurations",
    detail: "Existing authoring, approval evidence and execution are handled by Blueprint Studio.",
    path: "/canonical/blueprints",
    status: "Existing workflow",
  },
  {
    title: "Noncredit learning and assessments",
    detail: "Inspect real registrations and attempts; provision assessment access, finalize scored results and record provider decisions.",
    path: "/canonical/lab/noncredit",
    status: "Connected testing page",
  },
  {
    title: "Certificates and digital badges",
    detail: "Download clearly labeled PDF, badge artwork and metadata samples for published noncredit training. Does not issue credentials.",
    path: "/canonical/lab/credentials",
    status: "Preview-only testing page",
  },
  {
    title: "Surveys and feedback",
    detail: "Inspect owned definitions, operating campaigns, question structure, invitations and pilot compatibility checks.",
    path: "/canonical/lab/surveys",
    status: "Read-only testing page",
  },
] as const;

function CapabilityLabOverview() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Capability Lab" message={result.message}/>;
  const data = result.data;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1" title="Capability Lab"
    subtitle="Exercise the real capabilities before expanding the production-facing UI. This workspace is restricted to authenticated canonical provider staff, not students or families.">
    <CapabilityLabNav current="index" surveyDraftEnabled={data.draftAuthoringEnabled}
      surveyPublicationEnabled={data.surveyPublicationEnabled}/>
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {([
        ["Training versions", data.trainings.length],
        ["Noncredit course attempts", data.attempts.length],
        ["Survey campaigns", data.surveys.length],
      ] as const).map(([label, value]) =>
        <section key={label} className="border border-border bg-card px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
        </section>)}
    </div>
    <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {areas.filter(area => (area.path !== "/canonical/lab/survey-drafts" || data.draftAuthoringEnabled)
        && (area.path !== "/canonical/lab/survey-publications" || data.surveyPublicationEnabled))
        .map(area => <section key={area.title} className="flex flex-col border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{area.status}</p>
        <h2 className="mt-3 font-serif text-2xl text-foreground">{area.title}</h2>
        <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{area.detail}</p>
        <Link className="mt-5 inline-flex min-h-10 items-center font-semibold text-primary underline underline-offset-4"
          to={area.path}>Open capability</Link>
      </section>)}
    </div>
    <section className="mt-6 border border-border bg-card p-5" aria-label="Lab limitations">
      <h2 className="text-base font-semibold">Boundaries and next coverage</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Records above are scoped to your canonical provider organization, limited to the first {data.limitPerCollection} per collection, and are not acceptance results. Survey authoring, actual foundation diagnostics and mastery decisions, site qualification authoring and funding administration still need owned services and workflow pages. The existing school routes continue to use their own authorization context.</p>
      <p className="mt-3 text-sm">Provider organization: <code className="break-all font-mono text-xs">{data.organizationId}</code></p>
    </section>
  </WorkspaceShell>;
}
