/**
 * V6.1 Launch Studio module destinations. Show real owned capabilities and
 * honest planned states instead of a shared "not connected" placeholder.
 * These links do not grant Site, Program, Blueprint or publication authority.
 */
import { StatusBadge, WorkspaceActionLink, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import type { siteLaunchModules } from "./LaunchStudioOverviewV61";
import { LaunchGuidancePanels } from "./LaunchGuidancePanels";
import { LaunchReadinessPanelV61 } from "./LaunchReadinessPanelV61";
import type { PrepareStageModuleIdV61 } from "@/domain/launch-prepare-v61";

type ModuleId = typeof siteLaunchModules[number]["id"];
export type DestinationModuleId = Exclude<ModuleId,
  "site-profile" | "site-information" | "programs-audiences" | "website-brand" |
  "create-outreach" | "my-outreach" |
  PrepareStageModuleIdV61>;

type ModuleLink = { label: string; path: (siteId: string) => string; detail: string };
type Destination = {
  subtitle: string;
  intro: string;
  state: "governed";
  note: string;
  links: readonly ModuleLink[];
};
const scope = (siteId: string) => encodeURIComponent(siteId);
export const launchModuleDestinationsV61: Record<DestinationModuleId, Destination> = {
  open: {
    subtitle: "Open enrollment for approved offerings.",
    intro: "Check your offerings and complete any remaining requirements before opening enrollment.",
    state: "governed",
    note: "Enrollment is enabled separately for each approved offering.",
    links: [
      { label: "Review readiness and opening authority", path: id => `/settings/school/compliance?siteId=${scope(id)}`, detail: "Check opening requirements" },
      { label: "Review Site publication", path: id => `/launch/site?siteId=${scope(id)}&module=publish-site`, detail: "Review Site publication" },
      { label: "Review admissions and seats", path: id => `/admissions/capacity?siteId=${scope(id)}`, detail: "Review Programs and available seats" },
      { label: "Manage eligible noncredit registration", path: id => `/programs/noncredit/enrollment?publicSiteId=${scope(id)}`, detail: "Manage approved noncredit registration" },
      { label: "Open your Site workspace", path: id => `/sites/${scope(id)}`, detail: "Go to your Site Workspace" },
    ],
  },
};

export function isDestinationModuleV61(id: ModuleId): id is DestinationModuleId {
  return Object.prototype.hasOwnProperty.call(launchModuleDestinationsV61, id);
}

export function LaunchModuleDestinationV61({ module, title, stage, siteId }: {
  module: DestinationModuleId; title: string; stage: string; siteId: string;
}) {
  const destination = launchModuleDestinationsV61[module];
  return <WorkspaceShell title={title} eyebrow={`${stage} / ${title}`}
    subtitle={destination.subtitle} width="wide"
    rail={<LaunchGuidancePanels guidance={{ why: destination.intro, next: destination.note }} />}>
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone="info">Enrollment setup</StatusBadge>
      </div>
      {module === "open" && <LaunchReadinessPanelV61 siteId={siteId} context="open" />}
      <WorkspacePanel title={module === "open" ? "Enable Enrollment" : "Continue with existing capabilities"}
        description={module === "open"
          ? "Check readiness, then open registration for each eligible offering."
          : "Open the existing authorized workspace, retaining the selected Site where that destination supports it."}>
        <div className="grid gap-3">
          {destination.links.map(item => <WorkspaceActionLink key={item.label}
            title={item.label} description={item.detail} href={item.path(siteId)}
            actionLabel={item.label} />)}
        </div>
      </WorkspacePanel>
    </div>
  </WorkspaceShell>;
}
