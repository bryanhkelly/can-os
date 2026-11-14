import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getFacilitatedImpactReport } from "@/modules/learning/facilitated-impact.functions";
import { NoncreditPilotOutcomesPanel } from "@/components/learning/NoncreditPilotOutcomesPanel";

export const Route = createFileRoute("/canonical/lab/impact")({
  loader: () => safeLoader(() => getFacilitatedImpactReport())(),
  component: ImpactLabPage,
});

function ImpactLabPage() {
  const result=Route.useLoaderData();
  if(!result.ok)return <CanonicalBlueprintLoadError
    title="Participation evidence" message={result.message}/>;
  const data=result.data;
  return <WorkspaceShell width="wide" eyebrow="Canonical · Learning operations"
    title="Participation evidence"
    subtitle="Delivery, learner pairing, assessment activity, and verified training decisions remain separate measures.">
    <CapabilityLabNav current="impact"/>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 text-sm">
      <p>Site delivery: last 90 days, beginning {new Date(data.since).toLocaleDateString()}</p>
      <p className="text-muted-foreground">As of {new Date(data.asOf).toLocaleString()}</p>
    </div>
    <section className="mt-6" aria-label="Site delivery evidence">
      <h2 className="font-serif text-xl font-semibold">Site-delivered learning</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Counts are restricted to Site relationships authorized for your account.
        One person can attend several rooms but is counted only once in the distinct paired total.
      </p>
      {data.siteDelivery.partial&&<p role="status" className="mt-3 border border-border p-3 text-sm">
        Site delivery contains more than 5,000 rooms. The displayed counts are partial and must not be published as totals.
      </p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {label:"Facilitator rooms",value:data.siteDelivery.roomCount},
          {label:"People who paired a device",value:data.siteDelivery.distinctPairedPeople},
          {label:"Distinct paired course attempts",value:data.siteDelivery.distinctPairedCourseAttempts},
          {label:"Facilitator playback starts",value:data.siteDelivery.playbackStarts},
        ].map(item=><div key={item.label} className="border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="mt-2 font-serif text-3xl font-semibold tabular-nums">
            {Number(item.value).toLocaleString()}
          </p>
        </div>)}
      </div>
      <div className="mt-5 overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-160 text-left text-sm">
          <thead className="border-b border-border bg-muted/40">
            <tr>
              <th scope="col" className="p-3">Deployment</th>
              <th scope="col" className="p-3">Site</th>
              <th scope="col" className="p-3">Rooms</th>
              <th scope="col" className="p-3">Device pairings across rooms</th>
              <th scope="col" className="p-3">Playback starts</th>
            </tr>
          </thead>
          <tbody>
            {data.siteDelivery.byDeployment.map(row=><tr
              key={row.deploymentId+":"+row.siteId} className="border-b border-border last:border-b-0">
              <td className="p-3 font-mono text-xs">{row.deploymentId.slice(0,8)}</td>
              <td className="p-3 font-mono text-xs">{row.siteId.slice(0,8)}</td>
              <td className="p-3 tabular-nums">{row.rooms}</td>
              <td className="p-3 tabular-nums">{row.pairedDeviceSessions}</td>
              <td className="p-3 tabular-nums">{row.playbackStarts}</td>
            </tr>)}
            {!data.siteDelivery.byDeployment.length&&
              <tr><td colSpan={5} className="p-4 text-muted-foreground">
                No facilitated delivery records in the current reporting window.
              </td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <section className="mt-8" aria-label="Authoritative noncredit learning outcomes">
      <p className="mb-4 text-sm text-muted-foreground">
        Registration, baseline and final knowledge checks, identified feedback,
        and confirmed completion are calculated by the canonical noncredit pilot
        reporting service. These are not inferred from paired devices or video starts.
      </p>
      <NoncreditPilotOutcomesPanel/>
    </section>
    <section className="mt-7 border-t border-border pt-5" aria-label="Evidence definitions">
      <h2 className="font-serif text-lg font-semibold">How to interpret these counts</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
        {data.limitations.map(item=><li key={item}>{item}</li>)}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Report preview only. An audited snapshot, reconciliation review, and data-use policy are
        required before using these measures in published national impact reports or funding claims.
      </p>
    </section>
  </WorkspaceShell>;
}
