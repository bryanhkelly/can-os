import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalCapabilityLab } from "@/modules/operations/canonical-capability-lab.functions";

export const Route = createFileRoute("/canonical/lab/surveys")({
  loader: () => safeLoader(() => getCanonicalCapabilityLab())(),
  component: SurveysLabPage,
});

function SurveysLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Survey inspection" message={result.message}/>;
  const campaigns = result.data.surveys;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Survey inspection" subtitle="Inspect published survey campaign configuration and response evidence without reading private answers or changing campaign lifecycle.">
    <CapabilityLabNav current="surveys"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-semibold">Current coverage</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Campaigns below are scoped to the signed-in operating organization. Counts are diagnostic, not proof of delivery or completion. Respondents use their own authorized course participation for survey submission. Survey creation, publication and invitation management are not exposed in this first lab slice.</p>
    </section>
    <div className="mt-5 overflow-x-auto border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="p-3 font-semibold">Survey and campaign</th>
            <th scope="col" className="p-3 font-semibold">Status</th>
            <th scope="col" className="p-3 font-semibold">Response mode</th>
            <th scope="col" className="p-3 font-semibold">Questions</th>
            <th scope="col" className="p-3 font-semibold">Responses</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(campaign => <tr key={campaign.id} className="border-b border-border last:border-0">
            <th scope="row" className="p-3 font-medium">{campaign.title}
              <p className="mt-1 text-xs font-normal text-muted-foreground">Version {campaign.versionNo}</p>
              <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">{campaign.id}</p>
              {campaign.deploymentId && <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">
                Deployment {campaign.deploymentId}</p>}
            </th>
            <td className="p-3">{campaign.status}</td>
            <td className="p-3">{campaign.mode}</td>
            <td className="p-3 tabular-nums">{campaign.questionCount}</td>
            <td className="p-3 tabular-nums">{campaign.responseCount}</td>
          </tr>)}
          {campaigns.length === 0 && <tr><td colSpan={5} role="status"
            className="p-5 text-muted-foreground">No survey campaigns in your operating organization.</td></tr>}
        </tbody>
      </table>
    </div>
  </WorkspaceShell>;
}
