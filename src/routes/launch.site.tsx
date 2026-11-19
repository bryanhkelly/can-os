import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { siteLaunchModules, LaunchStudioOverview } from "@/components/launch-studio/LaunchStudioOverviewV61";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { EstablishSiteProfileUnified, EstablishSiteProfileGuidance } from "@/components/launch-studio/EstablishSiteProfileUnified";

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
  if (!site) return <main className="mx-auto max-w-3xl space-y-5 px-5 py-12">
    <h1 className="font-serif text-4xl">Choose your Site</h1>
    <p className="text-sm text-muted-foreground">{error ?? "Select an authorized Site to continue its launch."}</p>
    <div className="space-y-3">{sites.map(item=><a key={item.id}
      href={"/launch/site?siteId="+encodeURIComponent(item.id)} className="block border bg-card p-4">{item.name}</a>)}</div>
    {!sites.length && <a href="/site/new" className="font-semibold text-primary">Create your Site</a>}
  </main>;
  const base = "/launch/site?siteId=" + encodeURIComponent(site.id);
  const selected = siteLaunchModules.find(item=>item.id===search.module);
  return <LaunchSiteFrame site={site} active={search.module}>
    {selected?.id === "site-profile" ? <main className="mx-auto max-w-screen-2xl space-y-6 px-5 py-8 sm:px-8">
      <div>
        <p className="text-2xs font-bold uppercase tracking-eyebrow text-primary">Establish / Site Profile</p>
        <h1 className="mt-2 font-serif text-4xl">Site Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">Confirm your Site identity and add contact or location details when available.</p>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <EstablishSiteProfileUnified key={site.id} site={site} organizations={organizations}
          onBackToOverview={() => void navigate({ to: "/launch/site", search: { siteId: site.id } })}
          onSaveAndExit={() => void navigate({ to: "/launch/site", search: { siteId: site.id } })}
          onContinueToSiteInformation={() => void navigate({ to: "/launch/site", search: { siteId: site.id, module: "site-information" } })} />
        <aside aria-label="Site Profile guidance" className="min-w-0">
          <EstablishSiteProfileGuidance />
        </aside>
      </div>
    </main> : selected ? <main className="mx-auto max-w-6xl space-y-5 p-5 sm:p-8">
      <p className="text-2xs font-bold uppercase tracking-eyebrow text-primary">{selected.stage} / {selected.title}</p>
      <h1 className="font-serif text-4xl">{selected.title}</h1>
      <p className="text-sm text-muted-foreground">This section will be connected using the approved V6.1 content contract.</p>
      <div role="status" className="border bg-card p-5 text-sm">
        This module is not yet connected. Nothing on this page creates or publishes records.
      </div>
      <a href={base} className="inline-flex min-h-11 items-center border px-4 text-sm font-semibold">Back to Overview</a>
    </main> : <LaunchStudioOverview
      site={{ ...site, statusLabel: "Preparing", statusTone: "info" }}
      mode="first-visit"
      nextAction={{ title: "Begin with Site Profile", description: "Confirm the Site identity you already created.", href: base + "&module=site-profile" }}
      previewUrl={"/launch/site-preview?siteId=" + encodeURIComponent(site.id)}
      workspaceUrl={"/sites/" + encodeURIComponent(site.id)}
    />}
  </LaunchSiteFrame>;
}
