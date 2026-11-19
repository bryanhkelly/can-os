import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { siteLaunchModules, LaunchStudioOverview } from "@/components/launch-studio/LaunchStudioOverviewV61";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { EstablishSiteProfileUnified, EstablishSiteProfileGuidance } from "@/components/launch-studio/EstablishSiteProfileUnified";
import { EstablishSiteInformationV61, SiteInformationV61Guidance, type SiteInformationV61Initial } from "@/components/launch-studio/EstablishSiteInformationV61";
import { readSiteInformationV61 } from "@/modules/programs/site-information-v61.functions";
import { EstablishProgramsAudiencesV61, ProgramsAudiencesV61Guidance,
  type ProgramsAudiencesV61Initial } from "@/components/launch-studio/EstablishProgramsAudiencesV61";
import { readSiteProgramsAudiencesV61 } from "@/modules/programs/site-programs-audiences-v61.functions";
import { WorkspaceShell } from "@/components/workspace";
import { LaunchModuleDestinationV61, isDestinationModuleV61 } from "@/components/launch-studio/LaunchModuleDestinationV61";
import { LaunchPrepareV61, isPrepareModuleV61 } from "@/components/launch-studio/LaunchPrepareV61";

const searchSchema = z.object({
  siteId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  module: z.enum(siteLaunchModules.map(item=>item.id) as [string, ...string[]]).optional(),
});

/** One authorized Site, one new Launch Studio. No legacy wizard or redirect. */
export const Route = createFileRoute("/launch/site")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ siteId: search.siteId, module: search.module }),
  loader: ({ deps }) => safeLoader(async () => {
    const options = await listLaunchOptions();
    const site = deps.siteId
      ? options.sites.find(candidate => candidate.id === deps.siteId)
      : options.sites.length === 1 ? options.sites[0] : null;
    return {
      site: site ?? null,
      organizations: options.organizations,
      sites: options.sites.map(item=>({id:item.id,name:item.name})),
      siteInformation: site && deps.module === "site-information"
        ? await readSiteInformationV61({ data: { siteId: site.id } }) : null,
      programsAudiences: site && deps.module === "programs-audiences"
        ? await readSiteProgramsAudiencesV61({ data: { siteId: site.id } }) : null,
      // Establish preferences are optional context for catalog discovery. The
      // separately authorized catalog must remain navigable if this read is
      // unavailable or its data needs repair. Never pretend it loaded empty.
      prepareIntent: site && deps.module === "program-catalog"
        ? await readSiteProgramsAudiencesV61({ data: { siteId: site.id } })
            .then(result => ({ kind: "ready" as const, intent: result.intent }))
            .catch(() => ({ kind: "unavailable" as const }))
        : null,
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
  const { site, sites, organizations, siteInformation, programsAudiences, prepareIntent, error } = outcome.data;
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
    </WorkspaceShell> : selected?.id === "site-information" && siteInformation ? <SiteInformationBody
      site={site} initial={siteInformation} organizations={organizations}
      onBack={() => void navigate({ to: "/launch/site", search: { siteId: site.id, module: "site-profile" } })}
      onExit={() => void navigate({ to: "/launch/site", search: { siteId: site.id } })}
      onContinue={() => void navigate({ to: "/launch/site", search: { siteId: site.id, module: "programs-audiences" } })} />
    : selected?.id === "programs-audiences" && programsAudiences ? <ProgramsAudiencesBody
      siteId={site.id} initial={programsAudiences}
      onBack={() => void navigate({ to: "/launch/site", search: { siteId: site.id, module: "site-information" } })}
      onExit={() => void navigate({ to: "/launch/site", search: { siteId: site.id } })}
      onContinue={() => void navigate({ to: "/launch/site", search: { siteId: site.id, module: "website-brand" } })} />
    : selected?.id === "website-brand" ? <Navigate
      to="/launch/website" search={{ siteId: site.id, returnToHub: true }} replace />
    : selected && isPrepareModuleV61(selected.id) ? <LaunchPrepareV61 key={site.id}
      module={selected.id} siteId={site.id}
      intent={prepareIntent?.kind === "ready" ? prepareIntent.intent : null}
      intentUnavailable={prepareIntent?.kind === "unavailable"} />
    : selected && isDestinationModuleV61(selected.id) ? <LaunchModuleDestinationV61
      module={selected.id} title={selected.title} stage={selected.stage} siteId={site.id} />
    : selected ? <WorkspaceShell title="Module unavailable" eyebrow="Launch Studio"
      subtitle="This module could not be loaded. Return to the Site overview and try again."
      width="wide"><a href={base} className="inline-flex min-h-11 items-center text-primary underline">
        Back to Site overview</a>
    </WorkspaceShell> : <LaunchStudioOverview
      site={{ ...site, statusLabel: "Site established", statusTone: "neutral" }}
      mode="returning"
      nextAction={{ title: "Begin with Site Profile", description: "Confirm the Site identity you already created.", href: base + "&module=site-profile" }}
      previewUrl={"/launch/site-preview?siteId=" + encodeURIComponent(site.id)}
      workspaceUrl={"/sites/" + encodeURIComponent(site.id)}
    />}
  </LaunchSiteFrame>;
}

/** Owns guidance state without adding another shell or left-navigation step. */
function SiteInformationBody({ site, initial, organizations, onBack, onExit, onContinue }: {
  site: { id: string; organizationId: string };
  initial: SiteInformationV61Initial;
  organizations: Array<{ id: string; name: string }>;
  onBack: () => void; onExit: () => void; onContinue: () => void;
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const organization = organizations.find(item => item.id === site.organizationId);
  return <WorkspaceShell title="Site Information" eyebrow="Establish / Site Information"
    subtitle="Shape your learning environment and introduce the community behind your Site."
    width="wide" rail={<SiteInformationV61Guidance step={step} />}>
    <EstablishSiteInformationV61 key={site.id + ":" + initial.revision}
      siteId={site.id} responsibleOrganizationName={organization?.name ?? null}
      initial={initial} onInternalStepChange={setStep}
      onBackToSiteProfile={onBack} onSaveAndExit={onExit}
      onContinueToPrograms={onContinue} />
  </WorkspaceShell>;
}

/** Local two-step state changes only the shared guidance rail, not the Launch sidebar. */
function ProgramsAudiencesBody({ siteId, initial, onBack, onExit, onContinue }: {
  siteId: string;
  initial: ProgramsAudiencesV61Initial;
  onBack: () => void; onExit: () => void; onContinue: () => void;
}) {
  const [step, setStep] = useState<0 | 1>(0);
  return <WorkspaceShell title="What could your community learn?"
    eyebrow="Establish / Programs & Audiences"
    subtitle="Choose what you hope to offer and who you hope to serve. Saved intentions can shape your private website and guide preparation."
    width="wide" rail={<ProgramsAudiencesV61Guidance step={step} />}>
    <EstablishProgramsAudiencesV61 key={siteId + ":" + initial.revision}
      siteId={siteId} initial={initial} onInternalStepChange={setStep}
      onBackToSiteInformation={onBack} onSaveAndExit={onExit}
      onContinueToWebsiteBrand={onContinue} />
  </WorkspaceShell>;
}
