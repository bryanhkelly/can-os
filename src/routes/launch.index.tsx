import { createFileRoute } from "@tanstack/react-router";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { friendlySiteLaunchHref, validFriendlySlug } from "@/domain/friendly-site-urls";
import { compactUuidUrlValue } from "@/domain/opaque-url-id";

export const Route = createFileRoute("/launch/")({
  loader: () => safeLoader(async () => {
    const options = await listLaunchOptions();
    return options.sites.map(site => {
      const organization = options.organizations.find(item => item.id === site.organizationId);
      return {
        id: site.id,
        name: site.name,
        href: organization && validFriendlySlug(organization.slug) && validFriendlySlug(site.slug)
          ? friendlySiteLaunchHref({ organizationSlug: organization.slug, siteSlug: site.slug })
          : "/launch/site?siteId=" + compactUuidUrlValue(site.id),
      };
    });
  })(),
  component: LaunchIndex,
});

function LaunchIndex() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure title="Launch Studio" outcome={outcome}/>;
  return <WorkspaceShell title="Launch Studio" eyebrow="Shape · Share · Prepare · Launch"
    subtitle="Choose an authorized Site to continue preparing it, or establish a new Site.">
    <div className="mt-6 space-y-3">{outcome.data.map(site => <a key={site.id}
      href={site.href}
      className="block border bg-card p-4 font-semibold hover:bg-muted">{site.name}</a>)}</div>
    <div className="mt-6"><Button asChild><a href="/site/new">Create your Site</a></Button></div>
  </WorkspaceShell>;
}
