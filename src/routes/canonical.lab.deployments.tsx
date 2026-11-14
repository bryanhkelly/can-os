import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalDeploymentLab } from "@/modules/operations/canonical-deployment-lab.functions";

export const Route = createFileRoute("/canonical/lab/deployments")({
  loader: () => safeLoader(() => getCanonicalDeploymentLab())(),
  component: DeploymentLabPage,
});

function DeploymentLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Deployment inspection" message={result.message} />;
  const data = result.data;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Deployment inspection"
    subtitle="Inspect approved operator relationships, offerings, current adoptions and participation without changing program lifecycle.">
    <CapabilityLabNav current="deployments"/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Scope and interpretation</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Showing up to {data.limit} deployments from operations with a current approved operator role
        for your organization and current participation by an authorized Site.
        Approved adoption means a published offering version with a currently valid approved adoption;
        it does not activate the deployment. Counts are aggregate records, not proof of attendance.
        Blueprint execution evidence is shown only when produced by this organization.
      </p>
    </section>
    <div className="mt-5 overflow-x-auto border border-border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="p-3 font-semibold">Deployment</th>
            <th scope="col" className="p-3 font-semibold">Operation</th>
            <th scope="col" className="p-3 font-semibold">Offering</th>
            <th scope="col" className="p-3 font-semibold">Adoption</th>
            <th scope="col" className="p-3 font-semibold">Participation</th>
            <th scope="col" className="p-3 font-semibold">Blueprint evidence</th>
          </tr>
        </thead>
        <tbody>
          {data.deployments.map(row => <tr key={row.id} className="border-b border-border align-top last:border-0">
            <th scope="row" className="p-3 font-medium">{row.name}
              <p className="mt-1 font-mono text-xs font-normal text-muted-foreground">{row.code}</p>
              <p className="mt-1 text-xs font-normal text-muted-foreground">Status: {row.status}</p>
              <p className="mt-1 break-all font-mono text-xs font-normal text-muted-foreground">{row.id}</p>
            </th>
            <td className="p-3">{row.operationName}
              <p className="mt-1 text-xs text-muted-foreground">{row.operationStatus}</p>
            </td>
            <td className="p-3">{row.offeringTitle}
              <p className="mt-1 text-xs text-muted-foreground">{row.offeringCode} · {row.offeringStatus}</p>
            </td>
            <td className="p-3">
              <span className={"font-medium " + (row.hasCurrentApprovedAdoption ? "text-foreground" : "text-muted-foreground")}>
                {row.hasCurrentApprovedAdoption
                  ? "Approved · version " + row.currentVersionNo
                  : "No current approved adoption"}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.adoptionCount} adoption record(s)
                {row.latestVersionNo !== null ? " · latest v" + row.latestVersionNo : ""}
                {row.latestAdoptionStatus ? " · " + row.latestAdoptionStatus : ""}
              </p>
            </td>
            <td className="p-3 tabular-nums">
              {row.enrollmentCount} enrollment(s)
              <p className="mt-1 text-xs text-muted-foreground">
                {row.noncreditRegistrationCount} noncredit registration(s)
              </p>
            </td>
            <td className="p-3">{row.executionBatchId
              ? <><span>Executed batch</span><p className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.executionBatchId}</p></>
              : <span className="text-muted-foreground">No provider-visible execution record</span>}
            </td>
          </tr>)}
          {data.deployments.length === 0 && <tr><td colSpan={6} role="status"
            className="p-5 text-muted-foreground">
            No deployments match your current organization, operator role and authorized Site.
          </td></tr>}
        </tbody>
      </table>
    </div>
  </WorkspaceShell>;
}
