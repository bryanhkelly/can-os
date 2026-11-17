import { createFileRoute } from "@tanstack/react-router";
import { DirectoryTable, WorkspaceShell } from "@/components/workspace";
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
    <DirectoryTable label="Deployments" caption="Authorized deployments and adoption evidence; participation counts do not prove attendance."
      rows={data.deployments} rowKey={row=>row.id}
      empty={<p className="p-4 text-sm text-muted-foreground">No deployments match your organization, operator role and authorized Site.</p>}
      columns={[
        {id:"deployment",title:"Deployment",render:row=><>{row.name}
          <p className="mt-1 font-mono text-xs text-muted-foreground">{row.code}</p>
          <p className="mt-1 text-xs text-muted-foreground">Status: {row.status}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.id}</p></>},
        {id:"operation",title:"Operation",render:row=><>{row.operationName}<p className="mt-1 text-xs text-muted-foreground">{row.operationStatus}</p></>},
        {id:"offering",title:"Offering",render:row=><>{row.offeringTitle}<p className="mt-1 text-xs text-muted-foreground">{row.offeringCode} · {row.offeringStatus}</p></>},
        {id:"adoption",title:"Adoption",render:row=><>
          <span className={row.hasCurrentApprovedAdoption?"font-medium":"text-muted-foreground"}>{row.hasCurrentApprovedAdoption?"Approved · version "+row.currentVersionNo:"No current approved adoption"}</span>
          <p className="mt-1 text-xs text-muted-foreground">{row.adoptionCount} adoption record(s){row.latestVersionNo!==null?" · latest v"+row.latestVersionNo:""}{row.latestAdoptionStatus?" · "+row.latestAdoptionStatus:""}</p>
        </>},
        {id:"participation",title:"Participation",render:row=><>{row.enrollmentCount} enrollment(s)
          <p className="mt-1 text-xs text-muted-foreground">{row.noncreditRegistrationCount} noncredit registration(s)</p></>},
        {id:"evidence",title:"Blueprint evidence",render:row=>row.executionBatchId?<><span>Executed batch</span>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.executionBatchId}</p></>:<span className="text-muted-foreground">No provider-visible execution record</span>},
      ]}/>
  </WorkspaceShell>;
}
