import { createFileRoute, Link } from "@tanstack/react-router";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { SiteAffiliationPanel } from "@/components/operations/SiteAffiliationPanel";

export const Route = createFileRoute("/sites/")({
  loader: safeLoader(() => listMySites(), { authMessage: "You do not have access to any school sites." }),
  component: SitesDirectoryPage,
});
function SitesDirectoryPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Schools" title="Your school sites" outcome={outcome}/>;
  const sites: Awaited<ReturnType<typeof listMySites>> = outcome.data;
  return <WorkspaceShell eyebrow="CAN OS · Schools" title="Your school sites"
    subtitle="Choose a site to view today's schedule, action queue, active programs and recorded attendance.">
    <div className="mt-8 grid gap-3 sm:grid-cols-2">
      {sites.map(site => <div key={site.id}>
      <Link
        to="/sites/$siteId" params={{ siteId: site.id }}
        className="rounded-xl border bg-card p-5 transition-colors hover:bg-muted">
        <h2 className="font-serif text-2xl">{site.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{site.organizationName} · {site.timezone}</p>
        <p className="mt-4 text-sm font-medium underline">Open Site Today →</p>
      </Link>
      <SiteAffiliationPanel siteId={site.id}/>
      </div>)}
    </div>
    {!sites.length && <p className="mt-8 rounded-xl border p-5 text-sm text-muted-foreground">
      No sites are assigned to your current account. Ask a school administrator to review your scoped access.
    </p>}
  </WorkspaceShell>;
}
