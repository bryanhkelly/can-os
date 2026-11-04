import { createFileRoute, Link } from "@tanstack/react-router";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { EntityCard, WorkspaceShell } from "@/components/workspace";

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
      {sites.map(site => <EntityCard key={site.id}
        title={site.name}
        subtitle={site.organizationName}
        meta="Open the authoritative site record to view operating status"
        className="min-h-44"
        leading={<span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center border bg-muted text-lg font-semibold text-foreground">
          {site.name.slice(0, 1).toUpperCase()}
        </span>}
        status={<span aria-hidden="true" className="text-primary">↗</span>}
        openLabel="Site Today"
        renderLink={({ className, children }) => <Link
          to="/sites/$siteId" params={{ siteId: site.id }}
          className={className}
          aria-label={`Open ${site.name} site workspace`}
        >{children}</Link>}
      >
        <p className="text-xs text-muted-foreground">Local timezone: {site.timezone}</p>
      </EntityCard>)}
    </div>
    {!sites.length && <p className="mt-8 border p-5 text-sm text-muted-foreground">
      No sites are assigned to your current account. Ask a school administrator to review your scoped access.
    </p>}
  </WorkspaceShell>;
}
