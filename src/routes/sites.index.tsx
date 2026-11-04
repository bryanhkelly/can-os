import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { listMySites } from "@/modules/operations/site-directory.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { EntityCard, WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/sites/")({
  loader: async () => {
    const outcome = await safeLoader(() => listMySites(), { authMessage: "You do not have access to any school sites." })();
    // The workspace switcher already chose the school; one site in scope means there is nothing to choose.
    const only = outcome.ok && outcome.data.length === 1 ? outcome.data[0] : undefined;
    if (only) throw redirect({ to: "/sites/$siteId/profile", params: { siteId: only.id } });
    return outcome;
  },
  component: SitesDirectoryPage,
});

function SitesDirectoryPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Schools" title="All schools" outcome={outcome}/>;
  const sites: Awaited<ReturnType<typeof listMySites>> = outcome.data;
  return <WorkspaceShell eyebrow="Schools" title="Your school sites"
    subtitle="Choose a site to review its actual operating decision, programs, schedule, and actions.">
    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      {sites.map(site => <EntityCard key={site.id}
        title={site.name}
        subtitle={site.organizationName}
        meta={`Time zone: ${site.timezone}`}
        className="min-h-44"
        leading={<span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center border bg-muted text-lg font-semibold text-foreground">
          {site.name.slice(0, 1).toUpperCase()}
        </span>}
        status={<span aria-hidden="true" className="text-primary">↗</span>}
        openLabel="School profile"
        renderLink={({ className, children }) => <Link
          to="/sites/$siteId/profile" params={{ siteId: site.id }}
          className={className}
          aria-label={`Open ${site.name} school profile`}
        >{children}</Link>}
      >
        <p className="text-xs text-muted-foreground">Local timezone: {site.timezone}</p>
      </EntityCard>)}
    </div>
    {!sites.length && <p className="mt-8 border p-5 text-sm text-muted-foreground">
      No schools are assigned to your current workspace. Ask a school administrator to review your scoped access.
    </p>}
  </WorkspaceShell>;
}
