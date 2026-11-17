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
      <h2 className="font-serif text-xl">Administration boundaries</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This verified platform role does not bypass Site-to-canonical identity review,
        grant Blueprint approval, or expose individual learner records.
        Privileged platform mutations require separate audited server commands.
      </p>
    </section>
  </WorkspaceShell>;
}
