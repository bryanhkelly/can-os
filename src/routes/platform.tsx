import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { readPlatformAdminOverview } from "@/modules/identity/platform-admin.functions";

export const Route = createFileRoute("/platform")({
  loader: () => safeLoader(() => readPlatformAdminOverview())(),
  component: PlatformAdministration,
});

function PlatformAdministration() {
  const result = Route.useLoaderData();
  if (!result.ok) {
    return <WorkspaceShell width="wide" eyebrow="CAN OS · Platform"
      title="Platform administration"
      subtitle="This area requires an independently provisioned, verified App Admin account.">
      <p role="alert" className="mt-6 border border-destructive p-4 text-sm text-destructive">
        {result.message}
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Site Admin and Registrar grants do not authorize platform administration.
        An authorized operator must provision the account-wide App Admin membership.
      </p>
    </WorkspaceShell>;
  }
  const summary = result.data;
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Platform"
    title="Platform administration"
    subtitle="Aggregate platform inventory. School operations and independent approvals retain their own permissions.">
    <div className="mt-6 grid gap-4 sm:grid-cols-3">
      {([
        ["Organizations", summary.organizations],
        ["Sites", summary.sites],
        ["Active App Admin grants", summary.activePlatformAdmins],
      ] as const).map(([label, value]) => <section key={label}
        className="border border-border bg-card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      </section>)}
    </div>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Site identity readiness</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        An approved correspondence and a canonical Site record are prerequisites
        for further staff identity verification. This view does not approve them.
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="py-3 pr-4">Site</th>
            <th scope="col" className="py-3 pr-4">Identity review</th>
            <th scope="col" className="py-3">Canonical Site</th>
          </tr></thead>
          <tbody>
            {summary.siteReadiness.map(site => <tr key={site.siteId} className="border-b border-border">
              <td className="py-3 pr-4 font-medium">{site.siteName}</td>
              <td className="py-3 pr-4">{site.linkStatus.replaceAll("_", " ")}</td>
              <td className="py-3">{site.canonicalSiteExists ? "Present" : "Not established"}</td>
            </tr>)}
          </tbody>
        </table>
        {summary.siteReadiness.length === 0 && <p className="py-5 text-sm text-muted-foreground">
          No Sites are registered in the school directory.
        </p>}
      </div>
      {summary.sites > summary.siteReadiness.length &&
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the first 100 Sites. Use the authorized reporting workflow for a complete inventory.
        </p>}
    </section>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Administration boundaries</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This verified platform role does not bypass Site-to-canonical identity review,
        grant Blueprint approval, or expose individual learner records.
        Privileged platform mutations require separate audited server commands.
      </p>
    </section>
  </WorkspaceShell>;
}
