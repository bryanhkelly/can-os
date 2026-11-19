import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { siteLaunchModules, LaunchStudioOverview } from "@/components/launch-studio/LaunchStudioOverviewV61";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { EstablishSiteProfileUnified, EstablishSiteProfileGuidance } from "@/components/launch-studio/EstablishSiteProfileUnified";
import { WorkspaceShell } from "@/components/workspace";

const searchSchema = z.object({
  siteId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  module: z.enum(siteLaunchModules.map(item=>item.id) as [string, ...string[]]).optional(),
});

/** One authorized Site, one new Launch Studio. No legacy wizard or redirect. */
export const Route = createFileRoute("/launch/site")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ siteId: search.siteId }),
  loader: ({ deps }) => safeLoader(async () => {
    const options = await listLaunchOptions();
    const site = deps.siteId
      ? options.sites.find(candidate => candidate.id === deps.siteId)
      : options.sites.length === 1 ? options.sites[0] : null;
    return {
      site: site ?? null,
      organizations: options.organizations,
      sites: options.sites.map(item=>({id:item.id,name:item.name})),
      error: deps.siteId && !site ? "You do not have access to the selected Site." : null,
    };
  })(),
  component: SiteLaunchPage,
});

function SiteLaunchPage() {
  const navigate = Route.useNavigate();
  const outcome = Route.useLoaderData();
  const search = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure title="Launch Studio" outcome={outcome}/>;
  const { site, sites, organizations, error } = outcome.data;
  if (!site) return <WorkspaceShell title="Choose your Site" eyebrow="Launch Studio"
    subtitle={error ?? "Select an authorized Site to continue its launch."}>
    <div className="mt-6 space-y-3">{sites.map(item=><a key={item.id}
      href={"/launch/site?siteId="+encodeURIComponent(item.id)}
      className="block border bg-card p-4 font-medium hover:bg-muted">{item.name}</a>)}</div>
    {!sites.length && <a href="/site/new" className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary">
      Create your Site
    </a>}
  </WorkspaceShell>;
  const base = "/launch/site?siteId=" + encodeURIComponent(site.id);
  const selected = siteLaunchModules.find(item=>item.id===search.module);
  return <LaunchSiteFrame site={site} active={search.module}>
    {selected?.id === "site-profile" ? <WorkspaceShell title="Site Profile"
      eyebrow="Establish / Site Profile"
      subtitle="Confirm your Site identity and add contact or location details when available."
      width="wide" rail={<EstablishSiteProfileGuidance />}>
      <EstablishSiteProfileUnified key={`${site.id}:${site.updatedAt}`}
        site={site} organizations={organizations}
        onBackToOverview={() => void navigate({ to: "/launch/site", search: { siteId: site.id } })}
        onSaveAndExit={() => void navigate({ to: "/launch/site", search: { siteId: site.id } })}
        onContinueToSiteInformation={() => void navigate({ to: "/launch/site", search: { siteId: site.id, module: "site-information" } })} />
    </WorkspaceShell> : selected ? <WorkspaceShell title={selected.title}
      eyebrow={`${selected.stage} / ${selected.title}`}
      subtitle="This section will be connected using the approved V6.1 content contract."
      width="wide">
      <div role="status" className="mt-6 border bg-card p-5 text-sm">
        This module is not yet connected. Nothing on this page creates or publishes records.
      </div>
      <a href={base} className="mt-6 inline-flex min-h-11 items-center border px-4 text-sm font-semibold">
        Back to Overview
      </a>
    </WorkspaceShell> : <LaunchStudioOverview
      site={{ ...site, statusLabel: "Preparing", statusTone: "info" }}
      mode="first-visit"
      nextAction={{ title: "Begin with Site Profile", description: "Confirm the Site identity you already created.", href: base + "&module=site-profile" }}
      previewUrl={"/launch/site-preview?siteId=" + encodeURIComponent(site.id)}
      workspaceUrl={"/sites/" + encodeURIComponent(site.id)}
    />}
  </LaunchSiteFrame>;
}
