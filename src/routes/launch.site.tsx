import { encodeUuidForPath, compactUuidUrlValue } from "@/domain/opaque-url-id";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { readSiteBrandVersionView } from "@/modules/sites/site-brand.functions";
import { launchSiteLifecycleLabel, nextLaunchAction } from "@/domain/launch-overview-v61";
import { launchModuleCompletionV61 } from "@/domain/launch-module-completion-v61";
import { safeLoader } from "@/lib/safe-loader";
import { measureServerStep } from "@/lib/performance/measure-server-step";
import { LoaderFailure } from "@/lib/loader-failure";
import { siteLaunchModules, type SiteLaunchModuleIdV61 } from "@/domain/launch-site-navigation-v61";
import { findAuthorizedSiteBySlugs, friendlySiteLaunchHref, validFriendlySlug } from "@/domain/friendly-site-urls";
import { siteLaunchSearchSchemaV61 } from "@/domain/launch-site-search-v61";
import { LaunchStudioOverview } from "@/components/launch-studio/LaunchStudioOverviewV61";
import type { SiteGuideContentV61 } from "@/components/launch-studio/SiteGuideV61";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import { LaunchSiteFrame } from "@/components/launch-studio/LaunchSiteFrameV61";
import { EstablishSiteProfileUnified, EstablishSiteProfileGuidance } from "@/components/launch-studio/EstablishSiteProfileUnified";
import { EstablishSiteInformationV61, SiteInformationV61Guidance, type SiteInformationV61Initial } from "@/components/launch-studio/EstablishSiteInformationV61";
import { readSiteInformationV61 } from "@/modules/programs/site-information-v61.functions";
import { EstablishProgramsAudiencesV61, ProgramsAudiencesV61Guidance,
  type ProgramsAudiencesV61Initial } from "@/components/launch-studio/EstablishProgramsAudiencesV61";
import { readExistingSiteProgramsV61, readSiteProgramsAudiencesV61 } from "@/modules/programs/site-programs-audiences-v61.functions";
import type { ExistingSiteProgramsStateV61 } from "@/domain/site-existing-programs-v61";
import { readCanonicalBlueprintWorkspace } from "@/modules/blueprints/blueprint-studio.functions";
import { WorkspaceShell, WorkspaceNotice } from "@/components/workspace";
import { ExistingSiteProgramsV61 } from "@/components/launch-studio/ExistingSiteProgramsV61";
import { LaunchModuleDestinationV61, isDestinationModuleV61 } from "@/components/launch-studio/LaunchModuleDestinationV61";
import { LaunchPrepareV61, isPrepareModuleV61 } from "@/components/launch-studio/LaunchPrepareV61";
import { MarketingPackagesV61 } from "@/components/launch-studio/MarketingPackagesV61";
import { isIntroduceModuleV61, introduceModuleConfigV61 } from "@/domain/launch-introduce-v61";
import { listSiteMarketingPackagesV61, readSiteMarketingSuggestionsV61 } from "@/modules/programs/site-marketing-packages-v61.functions";

/** Keep the existing authorized Launch read model for both canonical and legacy URLs. */
export async function loadSiteLaunchView(deps: {
  siteId?: string;
  organizationSlug?: string;
  siteSlug?: string;
  module?: SiteLaunchModuleIdV61;
}) {
  return safeLoader(async () => {
    const options = await measureServerStep("launch.site", "site-options", () => listLaunchOptions());
    // Friendly slugs only identify a Site inside the same authorized directory.
    const site = deps.organizationSlug && deps.siteSlug
      ? findAuthorizedSiteBySlugs(options.organizations, options.sites, {
          organizationSlug: deps.organizationSlug, siteSlug: deps.siteSlug,
        })
      : deps.siteId
        ? options.sites.find(candidate => candidate.id === deps.siteId)
        : options.sites.length === 1 ? options.sites[0] : null;
    const selectedSite = site;
    // Read actual Site Programs independently of optional planning/catalog data.
    const existingProgramsRead = selectedSite && (!deps.module || deps.module === "programs-audiences")
      ? readExistingSiteProgramsV61({ data: { siteId: selectedSite.id } })
          .then(value => ({ state: "ready" as const, programs: value.programs,
            visibility: value.visibility }))
          .catch(() => ({ state: "unavailable" as const }))
      : Promise.resolve(null);
    // Reuse overview reads for the active module. Previously these same
    // authorized server functions were called a second time on each navigation.
    let informationRead: Awaited<ReturnType<typeof readSiteInformationV61>> | undefined;
    let programsRead: Awaited<ReturnType<typeof readSiteProgramsAudiencesV61>> | undefined;
    let marketingRead: Awaited<ReturnType<typeof listSiteMarketingPackagesV61>> | undefined;
    // Suggestions are independent of overview readiness. Start their read
    // concurrently instead of placing it behind the five overview reads.
    const suggestionsRead = selectedSite && isIntroduceModuleV61(deps.module)
      ? readSiteMarketingSuggestionsV61({ data: { siteId: selectedSite.id } }).catch(() => null)
      : Promise.resolve(null);
    // Project next steps from real Site-scoped reads. A failed read must never
    // be confused with an empty saved answer or falsely reported as complete.
    // Website & Brand redirects to its dedicated route; avoid five overview
    // reads for a page whose only rendered content is a redirect.
    const overview = selectedSite && deps.module !== "website-brand" ? await (async () => {
      // Sidebar completion needs Site, planning and Brand facts. The expensive
      // Blueprint workspace and Marketing list are only needed for Overview
      // (or Share itself). Their own modules load canonical detail.
      const isOverview = !deps.module;
      const loadMarketing = isOverview || isIntroduceModuleV61(deps.module);
      const [info, programs, brand, marketing, solutionPlans] = await Promise.allSettled([
        measureServerStep("launch.site", "overview-information", () => readSiteInformationV61({ data: { siteId: selectedSite.id } })),
        measureServerStep("launch.site", "overview-programs", () => readSiteProgramsAudiencesV61({ data: { siteId: selectedSite.id } })),
        measureServerStep("launch.site", "overview-brand", () => readSiteBrandVersionView({ data: { siteId: selectedSite.id } })),
        loadMarketing
          ? measureServerStep("launch.site", "overview-marketing", () => listSiteMarketingPackagesV61({ data: { siteId: selectedSite.id } }))
          : Promise.resolve(null),
        isOverview
          ? measureServerStep("launch.site", "overview-solutions", () => readCanonicalBlueprintWorkspace({ data: { siteId: selectedSite.id } }))
          : Promise.resolve(null),
      ]);
      if (info.status === "fulfilled") informationRead = info.value;
      if (programs.status === "fulfilled") programsRead = programs.value;
      if (marketing.status === "fulfilled" && marketing.value !== null)
        marketingRead = marketing.value;
      return {
        information: info.status === "fulfilled"
          ? { state: "ready" as const, value: {
              identitySaved: info.value.identitySaved,
              hostingSaved: info.value.hostingSaved,
              environmentSaved: info.value.environmentSaved,
            } } : { state: "unavailable" as const },
        programs: programs.status === "fulfilled"
          ? { state: "ready" as const, value: { saved: programs.value.saved } }
          : { state: "unavailable" as const },
        brand: brand.status === "fulfilled"
          ? { state: "ready" as const, value: { saved: !!brand.value.current } }
          : { state: "unavailable" as const },
        marketing: marketing.status === "fulfilled" && marketing.value !== null
          ? { state: "ready" as const, value: {
              hasPackages: marketing.value.some(item => item.status !== "archived"),
            } } : { state: "unavailable" as const },
        solutions: solutionPlans.status === "fulfilled" && solutionPlans.value !== null &&
            solutionPlans.value.siteId === selectedSite.id
          ? { state: "ready" as const, value: {
              plans: solutionPlans.value.configurations.map(plan => ({
                configurationId: plan.configurationId,
                lifecycle: plan.lifecycle,
              })),
            } }
          : { state: "unavailable" as const },
        websiteDraftAvailable: Boolean(selectedSite.websiteDraft),
        websiteContentSaved: selectedSite.websiteContentSaved === true,
      };
    })() : null;
    return {
      overview,
      existingPrograms: await existingProgramsRead,
      site: selectedSite ?? null,
      organizations: options.organizations,
      sites: options.sites.map(item=>({id:item.id,name:item.name,slug:item.slug,organizationId:item.organizationId})),
      siteGuidePlanning: selectedSite && deps.module === "site-information" ? programsRead?.intent ?? null : null,
      siteInformation: selectedSite && deps.module === "site-information"
        ? informationRead ?? await readSiteInformationV61({ data: { siteId: selectedSite.id } }) : null,
      // Both Share modules use the same authorized Site package store
      // and the same editorial projection of saved Shape information.
      // Failure of optional suggestions must not hide already saved packages.
      marketingPackages: selectedSite && isIntroduceModuleV61(deps.module)
        ? marketingRead ?? await listSiteMarketingPackagesV61({ data: { siteId: selectedSite.id } })
            .catch(() => null) : null,
      marketingSuggestions: selectedSite && isIntroduceModuleV61(deps.module)
        ? await suggestionsRead : null,
      introduceIntent: selectedSite && isIntroduceModuleV61(deps.module) ? programsRead?.intent ?? null : null,
      introduceIntentUnavailable: Boolean(selectedSite && isIntroduceModuleV61(deps.module) && !programsRead),
      introduceSiteRevision: selectedSite && isIntroduceModuleV61(deps.module) ? programsRead?.revision??null : null,
      programsAudiences: selectedSite && deps.module === "programs-audiences"
        ? programsRead ?? await readSiteProgramsAudiencesV61({ data: { siteId: selectedSite.id } })
            .catch(() => null) : null,
      // Shape preferences are optional context for catalog discovery. The
      // separately authorized catalog must remain navigable if this read is
      // unavailable or its data needs repair. Never pretend it loaded empty.
      prepareIntent: selectedSite && deps.module === "program-catalog"
        ? await Promise.resolve(programsRead ?? readSiteProgramsAudiencesV61({ data: { siteId: selectedSite.id } }))
            .then(result => ({
              kind: "ready" as const, intent: result.intent, delivery: result.delivery,
              schoolYearAvailability: result.schoolYearAvailability,
              schoolYearAcademyPrograms: result.schoolYearAcademyPrograms,
            }))
            .catch(() => ({ kind: "unavailable" as const }))
        : null,
      error: (deps.siteId || deps.organizationSlug || deps.siteSlug) && !selectedSite ? "Site unavailable or access denied." : null,
    };
  })();
}

export const Route = createFileRoute("/launch/site")({
  validateSearch: (search: Record<string, unknown>) => siteLaunchSearchSchemaV61.parse(search),
  loaderDeps: ({ search }) => ({ siteId: search.siteId, module: search.module }),
  loader: ({ deps }) => loadSiteLaunchView(deps),
  component: SiteLaunchPage,
});

function SiteLaunchPage() {
  return <SiteLaunchView outcome={Route.useLoaderData()} search={Route.useSearch()} />;
}

/** Shared presentation. Both routes load through the same security-scoped read model. */
export function SiteLaunchView({ outcome, search, friendlyRoute = false }: {
  outcome: Awaited<ReturnType<typeof loadSiteLaunchView>>;
  search: { module?: string; solutionPlanId?: string };
  friendlyRoute?: boolean;
}) {
  const navigate = useNavigate();
  if (!outcome.ok) return <LoaderFailure title="Launch Studio" outcome={outcome}/>;
  const { site, sites, organizations, siteInformation, siteGuidePlanning, programsAudiences, marketingPackages, marketingSuggestions, introduceIntent, introduceIntentUnavailable, introduceSiteRevision, prepareIntent, overview, existingPrograms, error } = outcome.data;
  if (!site && friendlyRoute) return <WorkspaceShell title="Site unavailable" eyebrow="Launch Studio"
    subtitle="This Site could not be found in your authorized workspace.">
    <p className="mt-6 text-sm text-muted-foreground">Check your Site access or return to the Site directory.</p>
  </WorkspaceShell>;
  if (!site) return <WorkspaceShell title="Choose your Site" eyebrow="Launch Studio"
    subtitle={error ?? "Select an authorized Site to continue its launch."}>
    <div className="mt-6 space-y-3">{sites.map(item=><a key={item.id}
      href={"/launch/site?siteId="+compactUuidUrlValue(item.id)}
      className="block border bg-card p-4 font-medium hover:bg-muted">{item.name}</a>)}</div>
    {!sites.length && <a href="/site/new" className="mt-6 inline-flex min-h-11 items-center font-semibold text-primary">
      Create your Site
    </a>}
  </WorkspaceShell>;
  const organization = organizations.find(item => item.id === site.organizationId);
  const identity = organization && validFriendlySlug(organization.slug) && validFriendlySlug(site.slug)
    ? { organizationSlug: organization.slug, siteSlug: site.slug }
    : null;
  const base = identity ? friendlySiteLaunchHref(identity) : "/launch/site?siteId=" + compactUuidUrlValue(site.id);
  const go = (module?: SiteLaunchModuleIdV61) => identity
    ? navigate({ to: "/o/$organizationSlug/$siteSlug/launch", params: identity, search: { module } })
    : navigate({ to: "/launch/site", search: { siteId: site.id, module } });
  const goWorkspace = () => identity
    ? navigate({ to: "/o/$organizationSlug/$siteSlug", params: identity })
    : navigate({ to: "/sites/$siteId", params: { siteId: site.id } });
  const selected = siteLaunchModules.find(item=>item.id===search.module);
  const statusLabel = launchSiteLifecycleLabel(site.lifecycleStatus);
  return <LaunchSiteFrame site={site} identity={identity ?? undefined} active={search.module} statusLabel={statusLabel}
    completion={launchModuleCompletionV61(site, overview)}
    previewAvailable={Boolean(site.websiteDraft)}>
    {selected?.id === "site-profile" ? <WorkspaceShell title="Site Profile"
      eyebrow="Shape / Site Profile"
      subtitle="Confirm your Site identity and add contact or location details when available."
      width="wide" rail={<EstablishSiteProfileGuidance />}>
      <EstablishSiteProfileUnified key={`${site.id}:${site.updatedAt}`}
        site={site} organizations={organizations}
        onBackToOverview={() => void go()}
        onSaveAndExit={() => goWorkspace()}
        onContinueToSiteInformation={() => void go("site-information")} />
    </WorkspaceShell> : selected?.id === "site-information" && siteInformation ? <SiteInformationBody
      key={site.id} site={site} initial={siteInformation} organizations={organizations} guidePlanning={siteGuidePlanning}
      onBack={() => void go("site-profile")}
      onExit={() => goWorkspace()}
      onContinue={() => void go("programs-audiences")} />
    : selected?.id === "programs-audiences" && programsAudiences ? <ProgramsAudiencesBody
      key={site.id} siteId={site.id} initial={programsAudiences}
       existingPrograms={existingPrograms ?? { state: "unavailable" }}
      onBack={() => void go("site-information")}
      onExit={() => goWorkspace()}
      onContinue={() => void go("website-brand")} />
    : selected?.id === "programs-audiences" ? <WorkspaceShell
      title="Programs & Audiences" eyebrow="Shape / Programs & Audiences"
      subtitle="Existing Programs are separate from your saved planning choices." width="wide">
      <div className="mt-6 space-y-4">
        <ExistingSiteProgramsV61 siteId={site.id}
          result={existingPrograms ?? { state: "unavailable" }}/>
        <WorkspaceNotice tone="attention">
          Your saved Program planning answers could not be loaded. No changes were made.
          Reload before adding new ideas.
        </WorkspaceNotice>
        <a href={base + (identity ? "?module=" : "&module=") + "programs-audiences"}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
          Reload Programs & Audiences
        </a>
      </div>
    </WorkspaceShell>
    : selected?.id === "website-brand" ? (identity
      ? <Navigate to="/o/$organizationSlug/$siteSlug/website" params={identity}
          search={{ returnToHub: true }} replace />
      : <Navigate to="/launch/website" search={{ siteId: site.id, returnToHub: true }} replace />)
    : selected && isIntroduceModuleV61(selected.id) && marketingPackages ? <MarketingPackagesV61
      key={site.id + ":" + selected.id} module={selected.id}
      siteId={site.id} siteName={site.name} siteIntent={introduceIntent}
      intentUnavailable={introduceIntentUnavailable} siteRevision={introduceSiteRevision}
      initial={marketingPackages}
      suggestions={marketingSuggestions} suggestionsUnavailable={!marketingSuggestions}
      onExit={() => void go()} />
    : selected && isIntroduceModuleV61(selected.id) ? <WorkspaceShell
      title={introduceModuleConfigV61[selected.id].title}
      eyebrow={introduceModuleConfigV61[selected.id].eyebrow}
      subtitle="Your Site's marketing packages could not be loaded."
      width="wide">
      <p role="alert" className="mt-6 border bg-card p-4 text-sm">
        No packages have been changed. Check your Site access and retry this section.
      </p>
      <a href={base + (identity ? "?module=" : "&module=") + selected.id}
        className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
        Retry this Share step
      </a>
    </WorkspaceShell>
    : selected && isPrepareModuleV61(selected.id) ? <LaunchPrepareV61 key={site.id}
      module={selected.id} siteId={site.id}
      solutionPlanId={selected.id === "program-catalog" ? search.solutionPlanId : undefined}
      intent={prepareIntent?.kind === "ready" ? prepareIntent.intent : null}
      delivery={prepareIntent?.kind === "ready" ? prepareIntent.delivery : null}
      schoolYearAvailability={prepareIntent?.kind === "ready"
        ? prepareIntent.schoolYearAvailability : undefined}
      schoolYearAcademyPrograms={prepareIntent?.kind === "ready"
        ? prepareIntent.schoolYearAcademyPrograms : undefined}
      intentUnavailable={prepareIntent?.kind === "unavailable"} />
    : selected && isDestinationModuleV61(selected.id) ? <LaunchModuleDestinationV61
      module={selected.id} title={selected.title} stage={selected.stage} siteId={site.id} />
    : selected ? <WorkspaceShell title="Module unavailable" eyebrow="Launch Studio"
      subtitle="This module could not be loaded. Return to the Site overview and try again."
      width="wide"><a href={base} className="inline-flex min-h-11 items-center text-primary underline">
        Back to Site overview</a>
    </WorkspaceShell> : <LaunchStudioOverview
      completion={launchModuleCompletionV61(site,overview)}
      existingPrograms={existingPrograms ?? { state: "unavailable" }}
      site={{ ...site, statusLabel, statusTone: "neutral" }}
      mode="returning"
      nextAction={overview ? nextLaunchAction(site.id, overview, site.lifecycleStatus, identity ? base : undefined) : {
        title: "Review Site Information",
        description: "Saved launch progress has not yet been verified.",
        href: base + (identity ? "?module=" : "&module=") + "site-information",
      }}
      previewUrl={site.websiteDraft ? "/launch/site-preview?siteId=" + encodeURIComponent(encodeUuidForPath(site.id)) : null}
      workspaceUrl={identity ? base.slice(0, -"/launch".length) : "/sites/" + encodeURIComponent(site.id)}
    />}
  </LaunchSiteFrame>;
}

/** Owns guidance state without adding another shell or left-navigation step. */
function SiteInformationBody({ site, initial, organizations, guidePlanning, onBack, onExit, onContinue }: {
  site: { id: string; organizationId: string };
  initial: SiteInformationV61Initial;
  guidePlanning?: SiteProgramsAudiencesV61 | null;
  organizations: Array<{ id: string; name: string }>;
  onBack: () => void; onExit: () => Promise<void>; onContinue: () => void;
}) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [guide, setGuide] = useState<SiteGuideContentV61 | null>(null);
  const organization = organizations.find(item => item.id === site.organizationId);
  return <WorkspaceShell title="Site Information" eyebrow="Shape / Site Information"
    subtitle="Tell us about your community, how people will take part and what inspires you."
    width="wide" rail={<SiteInformationV61Guidance step={step} guide={guide} />}>
    <EstablishSiteInformationV61 key={site.id + ":" + initial.revision}
      siteId={site.id} responsibleOrganizationName={organization?.name ?? null}
      initial={initial} guidePlanning={guidePlanning} onInternalStepChange={setStep} onGuideChange={setGuide}
      onBackToSiteProfile={onBack} onSaveAndExit={onExit}
      onContinueToPrograms={onContinue} />
  </WorkspaceShell>;
}

/** Three internal steps share the guidance rail, not the Launch sidebar. */
function ProgramsAudiencesBody({ siteId, initial, existingPrograms, onBack, onExit, onContinue }: {
  siteId: string;
  initial: ProgramsAudiencesV61Initial;
  existingPrograms: ExistingSiteProgramsStateV61;
  onBack: () => void; onExit: () => Promise<void>; onContinue: () => void;
}) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [guide, setGuide] = useState<SiteGuideContentV61 | null>(null);
  return <WorkspaceShell title="Programs & Audiences"
    eyebrow="Shape / Programs & Audiences"
    subtitle="Explore what you want to offer, who you hope to serve and the experiences that bring your vision to life."
    width="wide" rail={<ProgramsAudiencesV61Guidance step={step} guide={guide} />}>
    <EstablishProgramsAudiencesV61 key={siteId + ":" + initial.revision}
      siteId={siteId} initial={initial} existingPrograms={existingPrograms}
      onInternalStepChange={setStep} onGuideChange={setGuide}
      onBackToSiteInformation={onBack} onSaveAndExit={onExit}
      onContinueToWebsiteBrand={onContinue} />
  </WorkspaceShell>;
}
