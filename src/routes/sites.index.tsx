import { createFileRoute, Link } from "@tanstack/react-router";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/sites/")({
  loader: safeLoader(() => listMySites(), { authMessage: "You do not have access to any school sites." }),
  component: SitesDirectoryPage,
});

function SitesDirectoryPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Schools" title="Your school sites" outcome={outcome}/>;
  const sites: Awaited<ReturnType<typeof listMySites>> = outcome.data;
  return <WorkspaceShell eyebrow="CAN OS · Schools" title="Your school sites"
    subtitle="Choose a site to review its actual operating decision, programs, schedule, and actions.">
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {sites.map(site => <Link key={site.id}
        to="/sites/$siteId" params={{ siteId: site.id }}
        className="can-entity-card group flex min-h-44 flex-col p-5"
        aria-label={`Open ${site.name} site workspace`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center border bg-muted text-lg font-semibold text-foreground">
              {site.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <h2 className="font-serif text-2xl leading-tight">{site.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{site.organizationName}</p>
            </div>
          </div>
          <span aria-hidden="true" className="text-primary">↗</span>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Local timezone: {site.timezone}</p>
        <div className="mt-auto flex items-center justify-between border-t pt-4 text-sm">
          <span className="text-xs text-muted-foreground">Open the authoritative site record to view operating status</span>
          <span className="shrink-0 font-semibold text-primary">Site Today →</span>
        </div>
      </Link>)}
    </div>
    {!sites.length && <p className="mt-8 border p-5 text-sm text-muted-foreground">
      No sites are assigned to your current account. Ask a school administrator to review your scoped access.
    </p>}
  </WorkspaceShell>;
}
